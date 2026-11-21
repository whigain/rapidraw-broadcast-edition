// Early 2000s Television Broadcast — GPU effect for RapidRAW.
//
// Clean-room emulation of the look of professional early-2000s broadcast
// cameras (3CCD, Digital Betacam, Sony DVW-790WSP, PAL-SD). A single toggled
// effect that drives one tuned multi-pass pipeline instead of re-exposing
// RapidRAW's existing sliders:
//
//   1. electronic softening            (small blur, mixed in)
//   2. milky highlight diffusion       (bright-pass -> large blur -> screen)
//   3. highlight compression to white  (soft-knee white clip)
//   4. punchy broadcast colour         (saturation push)
//   5. skin-detail smoothing           (blurred copy, skin-tone masked)
//   6. electronic contour correction   (luma unsharp overshoot)
//   7. chroma-detail < luma-detail     (Y from source, CbCr from a strong blur)
//   8. optional clean video noise + interlacing (image-space, default off)
//   9. optional PAL-SD / 720x576 resample
//
// Tier-2 effect: dispatched from render/source.rs inside the effects transform
// block. Reads loose JSON fields (no Rust Adjustments struct). The combine runs
// as its own Group::Broadcast shader; blurs and the SD downsample reuse the
// shared ComputeEncoder primitives.

use crate::render::adjustment_utils::is_effect_enabled;
use crate::render::gpu::compute::{Bind, ComputeEncoder, Grid, Group, Out, RGB_MODE, Slot};

const BC_SD: u32 = 1;
const BC_INTERLACE: u32 = 2;

// Field-for-field mirror of `struct Params` in shaders/broadcast.wgsl. Only
// scalars follow `grid` so the uniform layout is identical on both sides.
#[repr(C)]
#[derive(Debug, Default, Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
struct Params {
    grid: Grid,
    amount: f32,
    softness: f32,
    detail: f32,
    chroma: f32,
    color_punch: f32,
    rolloff: f32,
    diffusion: f32,
    diffusion_threshold: f32,
    skin: f32,
    warmth: f32,
    noise_amt: f32,
    interlace: f32,
    seed: u32,
    flags: u32,
    sd_w: u32,
    sd_h: u32,
}

pub struct Broadcast {
    source_size: (u32, u32),
    amount: f32,
    softness: f32,
    detail: f32,
    chroma: f32,
    color_punch: f32,
    rolloff: f32,
    diffusion: f32,
    diffusion_threshold: f32,
    skin: f32,
    warmth: f32,
    noise_amt: f32,
    interlace: f32,
    seed: u32,
    sd: bool,
    sd_soft: bool,
    interlace_on: bool,
}

pub fn prepare(
    adjustments: &serde_json::Value,
    (w, h): (u32, u32),
    source_size: (u32, u32),
) -> Option<Broadcast> {
    if !is_effect_enabled(adjustments, "broadcast", "broadcastEnabled") {
        return None;
    }
    if w < 2 || h < 2 {
        return None;
    }

    // 0-100 UI value -> 0.0-1.0 shader value.
    let unit = |key: &str, default: f64| {
        (adjustments[key].as_f64().unwrap_or(default) as f32 / 100.0).clamp(0.0, 1.0)
    };

    let amount = unit("broadcastAmount", 100.0);
    if amount <= 0.0 {
        return None;
    }

    let sd_look = adjustments["broadcastSdLook"].as_str().unwrap_or("off");
    let sd = sd_look != "off";
    let sd_soft = sd_look == "soft576";

    Some(Broadcast {
        source_size,
        amount,
        softness: unit("broadcastSoftness", 35.0),
        detail: unit("broadcastDetail", 45.0),
        chroma: unit("broadcastChromaReduction", 50.0),
        color_punch: unit("broadcastColorPunch", 40.0),
        rolloff: unit("broadcastHighlightRolloff", 50.0),
        diffusion: unit("broadcastDiffusion", 30.0),
        diffusion_threshold: unit("broadcastDiffusionThreshold", 70.0),
        skin: unit("broadcastSkinSmooth", 30.0),
        warmth: unit("broadcastWarmth", 45.0),
        noise_amt: unit("broadcastVideoNoise", 0.0),
        interlace: unit("broadcastInterlaceStrength", 20.0),
        seed: (adjustments["broadcastSeed"].as_u64().unwrap_or(1) & 0xffff_ffff) as u32,
        sd,
        sd_soft,
        interlace_on: adjustments["broadcastInterlace"].as_bool().unwrap_or(false),
    })
}

pub fn encode(enc: &mut ComputeEncoder, job: &Broadcast, src: &Slot, dst: &Slot) {
    let (w, h) = src.size;
    if w < 2 || h < 2 {
        return;
    }
    let long = w.max(h) as f32;

    // PAL-SD resample target: limit to a 576-line equivalent (never upscale).
    let (sd_tex, sd_w, sd_h) = if job.sd {
        let sh = 576u32.min(h).max(2);
        let sw = (((w as f32) * (sh as f32) / (h as f32)).round() as u32).max(2);
        (Some(enc.area_down(src, (sw, sh), RGB_MODE)), sw, sh)
    } else {
        (None, 0, 0)
    };

    let mut flags = 0u32;
    if job.sd {
        flags |= BC_SD;
    }
    if job.interlace_on {
        flags |= BC_INTERLACE;
    }

    // A touch of extra electronic softness for the "soft576" SD variant.
    let softness = (job.softness + if job.sd_soft { 0.12 } else { 0.0 }).min(1.0);

    let params = Params {
        grid: Grid::new((w, h)).with_src(job.source_size),
        amount: job.amount,
        softness,
        detail: job.detail,
        chroma: job.chroma,
        color_punch: job.color_punch,
        rolloff: job.rolloff,
        diffusion: job.diffusion,
        diffusion_threshold: job.diffusion_threshold,
        skin: job.skin,
        warmth: job.warmth,
        noise_amt: job.noise_amt,
        interlace: job.interlace,
        seed: job.seed,
        flags,
        sd_w,
        sd_h,
    };

    // Small blur: electronic softness + the high-frequency base for contour
    // correction. Radii stay in preview-pixel units (not image space).
    let r_soft = ((long * 0.0035).round() as u32).max(1);
    let soft_copy = enc.area_down(src, (w, h), RGB_MODE);
    let soft = enc.blur(soft_copy, r_soft, 2, RGB_MODE);

    // Strong blur: chroma-subsample colour source + skin-smoothing source.
    let r_chroma = ((long * 0.006 * (0.4 + job.chroma)).round() as u32).max(1);
    let chroma_copy = enc.area_down(src, (w, h), RGB_MODE);
    let chroma = enc.blur(chroma_copy, r_chroma, 2, RGB_MODE);

    // Milky highlight diffusion: thresholded bright-pass, then a large blur.
    let bloom = (job.diffusion > 0.0).then(|| {
        let bright = enc.texture("Broadcast Bright", (w, h), wgpu::TextureFormat::Rgba32Float);
        enc.run(
            Group::Broadcast,
            "bc_bright",
            &params,
            (w, h),
            &[&src.view],
            Out::F32(&bright.view),
            Bind::default(),
        );
        enc.blur(bright, ((long * 0.02).round() as u32).max(2), 2, RGB_MODE)
    });

    let bloom_view = bloom.as_ref().map(|b| &b.view).unwrap_or(&src.view);
    let sd_view = sd_tex.as_ref().map(|t| &t.view).unwrap_or(&src.view);

    enc.run(
        Group::Broadcast,
        "bc_combine",
        &params,
        (w, h),
        &[&src.view, &soft.view, &chroma.view, bloom_view, sd_view],
        Out::F16(&dst.view),
        Bind::default(),
    );
}
