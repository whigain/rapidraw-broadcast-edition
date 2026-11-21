// Early 2000s Television Broadcast — WGSL for the Broadcast plugin group.
//
// Clean-room emulation of the look of professional early-2000s broadcast
// cameras (3CCD, Digital Betacam / Sony DVW-790WSP, PAL-SD). This shader runs
// as its own compute group (Group::Broadcast). RapidRAW appends the shared
// compute_common.wgsl after this source, so `Grid`, the texture bindings
// (t0..t5, out_f32/out_f16), `plain_luma`, `smooth_step`, `tap_uv`,
// `tap_sample` and `outside` are all available here.
//
// The Params struct below mirrors effects/broadcast.rs field-for-field. Only
// scalars follow `grid` (a 32-byte, 8-aligned struct) so the std140 uniform
// layout stays trivially identical between Rust (repr(C)) and WGSL.

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

@group(0) @binding(7) var<uniform> params: Params;

const BC_SD: u32 = 1u;
const BC_INTERLACE: u32 = 2u;

fn bc_to_srgb(c: vec3<f32>) -> vec3<f32> {
    return pow(max(c, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.4));
}

fn bc_to_linear(c: vec3<f32>) -> vec3<f32> {
    return pow(max(c, vec3<f32>(0.0)), vec3<f32>(2.4));
}

// Deterministic, image-space hash so grain/interlace never swim with zoom and
// the preview matches export (see gpu-effects image-space rule).
fn bc_hash(p: vec2<u32>, seed: u32) -> f32 {
    var h = (p.x * 0x8da6b343u) ^ (p.y * 0xd8163841u) ^ (seed * 0x2545f491u);
    h = (h ^ (h >> 13u)) * 0x85ebca6bu;
    h = h ^ (h >> 16u);
    return f32(h) / 4294967296.0;
}

fn bc_image_xy(id: vec2<u32>) -> vec2<u32> {
    let src = vec2<f32>(params.grid.src);
    let dst = max(vec2<f32>(params.grid.dst), vec2<f32>(1.0));
    if (src.x < 1.0 || src.y < 1.0) {
        return id;
    }
    return vec2<u32>(vec2<f32>(id) * src / dst);
}

// Cheap skin-tone mask in a pseudo-sRGB space: red dominant over green over
// blue, biased to mid/high luma. Used to smooth skin detail only.
fn bc_skin_mask(c: vec3<f32>) -> f32 {
    let s = bc_to_srgb(c);
    let l = plain_luma(s);
    let rg = smooth_step(0.02, 0.22, s.r - s.g);
    let gb = smooth_step(0.0, 0.22, s.g - s.b);
    let tone = smooth_step(0.18, 0.35, l) * (1.0 - smooth_step(0.9, 1.0, l));
    return clamp(rg * gb * tone, 0.0, 1.0);
}

// Soft-knee highlight compression that rolls bright values toward white, the
// classic broadcast "white clip" shoulder.
fn bc_white_clip(c: vec3<f32>, r: f32) -> vec3<f32> {
    if (r <= 0.0) {
        return c;
    }
    let knee = mix(1.0, 0.55, r);
    let span = max(1.0 - knee, 1e-3);
    var o = c;
    for (var i = 0; i < 3; i = i + 1) {
        let x = c[i];
        if (x > knee) {
            let t = clamp((x - knee) / span, 0.0, 1.0);
            // ease toward 1.0 (1 - (1-t)^2), scaled so the knee stays continuous
            o[i] = knee + span * (1.0 - (1.0 - t) * (1.0 - t));
        }
    }
    return o;
}

// Pass 1 — bright-pass extraction for the milky highlight diffusion. Writes the
// thresholded colour to an F32 scratch texture that Rust then blurs large.
@compute @workgroup_size(8, 8, 1)
fn bc_bright(@builtin(global_invocation_id) id: vec3<u32>) {
    if (outside(id)) {
        return;
    }
    let c = textureLoad(t0, vec2<i32>(id.xy), 0).rgb;
    let l = plain_luma(c);
    let w = smooth_step(params.diffusion_threshold, params.diffusion_threshold + 0.12, l);
    textureStore(out_f32, id.xy, vec4<f32>(c * w, 1.0));
}

// Pass 2 — the full broadcast combine.
//   t0 = source (linear light, working size)
//   t1 = small blur of source (electronic softness + unsharp base)
//   t2 = strong blur of source (chroma-subsample + skin smoothing source)
//   t3 = blurred bright-pass (diffusion bloom; dummy when diffusion == 0)
//   t4 = low-res area-down of source (PAL-SD resample; dummy when SD off)
@compute @workgroup_size(8, 8, 1)
fn bc_combine(@builtin(global_invocation_id) id: vec3<u32>) {
    if (outside(id)) {
        return;
    }
    let p = vec2<i32>(id.xy);
    var base = textureLoad(t0, p, 0).rgb;

    // PAL-SD resample: replace the working source with a bilinear read of the
    // 576-line downsample, giving authentic SD softness.
    if ((params.flags & BC_SD) != 0u) {
        let uv = (vec2<f32>(id.xy) + 0.5) / max(vec2<f32>(params.grid.dst), vec2<f32>(1.0));
        base = tap_sample(t4, tap_uv(uv, vec2<u32>(params.sd_w, params.sd_h))).rgb;
    }
    let original = base;

    let soft = textureLoad(t1, p, 0).rgb;
    let chroma_src = textureLoad(t2, p, 0).rgb;

    // 1. Electronic softening.
    var col = mix(base, soft, params.softness);

    // 7. Chroma detail reduction (4:2:2 feel): keep this pixel's luma, take the
    //    colour-difference from the strongly blurred copy.
    let yl = plain_luma(col);
    let yc = plain_luma(chroma_src);
    let chroma_off = chroma_src - vec3<f32>(yc);
    let own_off = col - vec3<f32>(yl);
    col = vec3<f32>(yl) + mix(own_off, chroma_off, params.chroma);

    // 5. Skin smoothing: blend luminance-detail toward the blurred copy only in
    //    skin-tone regions.
    let skin_m = bc_skin_mask(col) * params.skin;
    if (skin_m > 0.0) {
        let smoothed = mix(col, vec3<f32>(yl) + chroma_off, 0.65);
        col = mix(col, smoothed, skin_m);
    }

    // 6. Aperture / contour correction: electronic edge enhancement via a luma
    //    unsharp overshoot from the small blur.
    let hi = plain_luma(base) - plain_luma(soft);
    col = col + vec3<f32>(hi * params.detail * 1.6);

    // 4. Broadcast colour punch + gentle warm TV bias (cosy studio warmth).
    let g = plain_luma(col);
    col = mix(vec3<f32>(g), col, 1.0 + params.color_punch);
    let warm = mix(vec3<f32>(1.0), vec3<f32>(1.06, 1.0, 0.90), params.warmth);
    col = col * warm;

    // 3. Highlight compression toward white.
    col = bc_white_clip(col, params.rolloff);

    // 2. Milky highlight diffusion — a warm veiling bloom (the hero of the
    //    look: a clean pro-mist-style glow, like 2000s broadcast lenses).
    if (params.diffusion > 0.0) {
        let warm_tint = mix(vec3<f32>(1.0), vec3<f32>(1.12, 1.0, 0.80), params.warmth);
        let bloom = max(textureLoad(t3, p, 0).rgb, vec3<f32>(0.0)) * params.diffusion * warm_tint;
        let cc = clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));
        // Screen the glow over the highlights ...
        col = vec3<f32>(1.0) - (vec3<f32>(1.0) - cc) * (vec3<f32>(1.0) - clamp(bloom, vec3<f32>(0.0), vec3<f32>(1.0)));
        // ... plus a soft additive veil for the milky diffusion haze ...
        col = col + bloom * 0.12;
        // ... and a gentle shadow lift so it reads slightly milky/low-con.
        col = mix(col, col * 0.94 + vec3<f32>(0.02), params.diffusion * 0.5);
    }

    let img = bc_image_xy(id.xy);

    // 8a. Optional subtle video noise (perturb in sRGB-ish, back to linear).
    if (params.noise_amt > 0.0) {
        let n = (bc_hash(img, params.seed) - 0.5) * 2.0;
        let s = bc_to_srgb(col) + vec3<f32>(n * params.noise_amt * 0.06);
        col = bc_to_linear(s);
    }

    // 8b. Optional interlacing — a very subtle per-field luma modulation on the
    //     576-line image grid. Clean: no comb, no displacement.
    if ((params.flags & BC_INTERLACE) != 0u) {
        let field = f32(img.y & 1u) * 2.0 - 1.0;
        col = col * (1.0 + field * params.interlace * 0.05);
    }

    // Master blend over the (optionally SD-resampled) source.
    col = mix(original, max(col, vec3<f32>(0.0)), params.amount);

    textureStore(out_f16, id.xy, vec4<f32>(col, 1.0));
}
