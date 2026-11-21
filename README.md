# Early 2000s Television Broadcast — a RapidRAW plugin

A clean-room **RapidRAW plugin** that recreates the look of professional
early-2000s television cameras — 3CCD broadcast cameras like the Sony
DVW-790WSP and the Digital Betacam format. Soft, warm, with milky highlight
diffusion, punchy "TV" colour and smooth skin — a clean broadcast look, **not**
VHS (no tracking errors, no film grain, no CRT curvature, no retro overlays).

> Built for **RapidRAW v1.7.0** ("Furka Rendering Engine").

This repository contains **only the plugin** — an idempotent source-tree
patcher that applies the effect to a RapidRAW *source checkout*. It never
vendors the RapidRAW source itself.

## Install (source checkout)

```sh
# 1. Get a clean RapidRAW v1.7.0 source checkout (force LF endings on Windows):
git -c core.autocrlf=false -c core.eol=lf clone --depth 1 --branch v1.7.0 \
  https://github.com/CyberTimon/RapidRAW.git RapidRAW

# 2. From this plugin repo:
npm install
node installer/install.mjs --rapidraw ../RapidRAW --dry-run   # preview
node installer/install.mjs --rapidraw ../RapidRAW              # apply

# 3. Build RapidRAW as usual:
cd ../RapidRAW && npm install && npm run tauri dev   # or: npm run tauri build
```

Uninstall is hash-safe and reversible:

```sh
node installer/uninstall.mjs --rapidraw ../RapidRAW
```

## What it does

Enable the **Early 2000s Broadcast** section in the Effects panel. One toggle
drives a single tuned pipeline (it does *not* just re-expose RapidRAW's own
sliders):

| Control | Effect |
|---|---|
| Electronic Softness | mild electronic image softening |
| Contour Correction | electronic edge enhancement (aperture correction) |
| Chroma Reduction | colour detail softened more than luma (4:2:2 feel) |
| Colour Punch | vivid, broadcast-style colour |
| Highlight Roll-off | highlight compression toward white |
| Highlight Diffusion (+ Threshold) | warm, milky pro-mist glow on highlights |
| Skin Smoothing | gentle skin-detail smoothing |
| **Warmth** | cosy warm studio-light cast |
| Video Noise / Interlacing | optional, subtle, clean (default off) |
| PAL-SD Look | optional 720×576 standard-definition resample |
| Amount | master blend |

Presets: **DVW-790 Studio** (cosy default), **Studio** (warmer, glowier),
**ENG / News** (crisp, cooler, a hint of video noise + interlacing).

## Development

See [PLAN.md](PLAN.md) for the architecture and the full verification workflow
(`npm test`, installer dry-run, `cargo check`, `naga`, `tsc`, build, GUI smoke).

```sh
npm test   # patch/preset sanity
```

## Licence

AGPL-3.0-or-later, matching RapidRAW. See [LICENSE](LICENSE) and
[NOTICE.md](NOTICE.md). RapidRAW © CyberTimon.
