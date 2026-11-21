# PLAN.md — Early 2000s Television Broadcast Plugin für RapidRAW

Version dieses Plans: **v2 (research-grounded)**. Nach Recherche von Upstream
`CyberTimon/RapidRAW` und dem eigenen Repo `whigain/rapidraw-blur-noise-edition`.

Status: **noch nicht gebaut.** Clean-Room: nur RapidRAW-Source patchen, keine
Dekompilierung. Referenz-Look (Sony DVW-790WSP / Digital Betacam / PAL-SD) aus öffentlichem
Wissen über 3CCD-Broadcast-DSP. Code-Kommentare englisch, User-Kommunikation deutsch.

---

## 0. Recherche-Ergebnisse (was den Plan geändert hat)

**Zielversion fix: RapidRAW v1.7.0 „Furka Rendering Engine".**
Upstream-Latest (2026-11-15), lokaler Checkout `../RapidRAW-main` und installierte
`RapidRAW.exe` sind alle **1.7.0**. Patch-Anker binden an genau diese Version.

**Repo-Muster steht fest** (`whigain/rapidraw-blur-noise-edition`, v0.2.0 live):
`installer/ plugin-src/ wrapper/ tests/` + `PLAN/README/CHANGELOG/CONTRIBUTING/LICENSE/
NOTICE/PUBLISHING/RELEASING`. Homepage → `/releases/latest`, Topics `rapidraw, plugin,
raw-editor, tauri, wgpu, windows, …`. Owner `whigain`. → neues Repo spiegelt das 1:1.

**RapidRAW 1.7.0 hat bereits viel wiederverwendbare GPU-Infra** (verifiziert im Source) —
das macht den v1-Plan deutlich schlanker. Statt Bloom/Blur/Guided selbst zu erfinden,
nutze ich die vorhandenen `ComputeEncoder`-Methoden:

| Vorhanden | Datei | Nutzung im Broadcast-Effekt |
|-----------|-------|------------------------------|
| `ComputeEncoder::blur(src, radius, passes, flags)` | `gpu/compute.rs:700` | Luma-Softness (#1) + Chroma-Low-Pass (#7) |
| `ComputeEncoder::area_down(src, size, flags)` | `gpu/compute.rs:737` | PAL-SD-Resample auf 576-Zeilen (#9) |
| `ComputeEncoder::guided_model(...)` | `gpu/compute.rs:755` | edge-aware Hautglättung (#5) ohne Kanten zu fressen |
| Bloom-Pyramid (`lt_prefilter/lt_down/lt_up`) | `shaders/light_effects.wgsl` + `effects/light.rs` | Vorlage für milchige Highlight-Diffusion (#2) |
| `effects/fog.rs` `bloom()` + `effects/light.rs` `bloom()` | — | zwei Referenz-Implementierungen für Multi-Scale-Glow |

**Overlap-Hinweis / Abgrenzung:** RapidRAW hat schon eigene Adjustments
`saturation, vibrance, clarity, sharpness/sharpnessThreshold, colorNoiseReduction,
lumaNoiseReduction` sowie die Effekte **Glow/Halation/Lens Flare** und **Guided Filter**.
Der Broadcast-Effekt **re-exponiert diese NICHT als Einzelslider** — er ist ein
**ein-Toggle-Look**, der intern eine eigene, auf den TV-Look getunte Pass-Kette fährt
(eigene Parameter, eigener Combine-Shader). So bleibt es für den User eine einzige
„Early 2000s Television Broadcast"-Section statt acht verstreuter Regler. Namespace
`broadcast/interlace/pal` ist im Source komplett frei (geprüft).

**Netto-Neu-Code = im Wesentlichen EIN Combine-Shader** (YCbCr-Rekombination,
Aperture-Overshoot, White-Clip-Knee, Rec.601-Color-Push, optional image-space
Videorauschen + Interlace). Diffusion = Bloom-Pyramid-Pattern aus `light.rs` nachziehen;
Softness/Chroma = `blur`; Skin = `guided_model`; SD = `area_down`.

---

## 1. Ziel-Look → konkrete Operation → Infra

| # | Anforderung | Operation | Umsetzung |
|---|-------------|-----------|-----------|
| 1 | Leicht weich / elektronisch | milder Luma-Tiefpass-Blend | `enc.blur` kleiner Radius |
| 2 | Milchige Highlight-Diffusion | Threshold → Multi-Scale-Blur → screen-add | Bloom-Pyramid aus `light.rs` nachbauen |
| 3 | Highlights komprimieren / White-Clip | Soft-Knee Rolloff gegen Weiß | Combine-WGSL-Kurve |
| 4 | Farben kräftig / fernsehmäßig | Saturation/Vibrance + Rec.601-Primaries-Bias | Combine-WGSL |
| 5 | Hautdetails glätten | edge-aware Low-Pass, maskiert auf Hautton | `enc.guided_model` + YCbCr-Hautmaske |
| 6 | Konturen elektronisch nachschärfen | Aperture-Correction = Luma-Unsharp mit Overshoot | `sharp − lumaBlur` in Combine |
| 7 | Farbdetail < Luma-Detail (4:2:2-Look) | Y scharf, Cb/Cr aus stärker geblurrter Kopie | zweite `enc.blur`-Kopie + YCbCr-Recombine |
| 8a | Dezentes Videorauschen (optional, default aus) | Low-Amp Noise in **Image-Space** gehasht, sRGB→linear | `noise_hash4`-Helper (von Noise-Effekt) |
| 8b | Interlacing (optional, default aus) | subtile Feld-Modulation an 576-Zeilen-Image-Raster | Combine-WGSL, image-space Y |
| 9 | PAL-SD / 720×576-Anmutung | auf 576-Zeilen begrenzen (down+up) | `enc.area_down` + Upscale-Blur |

**Bewusst NICHT** (User: „sauber wie Profikamera"): VHS-Dropouts, Filmkorn, Tracking,
starke RGB-Shifts, CRT-Krümmung, Retro-Overlays. #8a/#8b optional & default aus/niedrig.

---

## 2. User-facing Controls (eine Section „Early 2000s Television Broadcast")

Tool-id `broadcast`, Enable-Key `broadcastEnabled`. Defaults = dezenter, sauberer
Digital-Betacam-Studiolook.

| Feld | Typ | Default | Look |
|------|-----|---------|------|
| `broadcastEnabled` | bool | false | Gate |
| `broadcastAmount` | 0–100 | 100 | Master-Blend |
| `broadcastSoftness` | 0–100 | 35 | #1 |
| `broadcastDetail` | 0–100 | 45 | #6 Aperture/Contour |
| `broadcastChromaReduction` | 0–100 | 50 | #7 |
| `broadcastColorPunch` | 0–100 | 40 | #4 |
| `broadcastHighlightRolloff` | 0–100 | 50 | #3 White-Clip |
| `broadcastDiffusion` | 0–100 | 30 | #2 |
| `broadcastDiffusionThreshold` | 0–100 | 70 | #2 |
| `broadcastSkinSmooth` | 0–100 | 30 | #5 |
| `broadcastVideoNoise` | 0–100 | 0 | #8a |
| `broadcastInterlace` | bool | false | #8b |
| `broadcastInterlaceStrength` | 0–100 | 20 | #8b |
| `broadcastSdLook` | string `'off'\|'pal576'\|'soft576'` | `'off'` | #9 |
| `broadcastPreset` | string `'dvw790'\|'studio'\|'eng'\|'custom'` | `'dvw790'` | setzt Slider atomar |
| `broadcastSeed` | int | 1 | Noise-Reroll-Button |

**String-Felder** (`broadcastSdLook`, `broadcastPreset`) laufen NICHT durch den
numerischen `handleAdjustmentChange`, sondern per rohem atomarem
`setAdjustments((prev)=>({ ...prev, broadcastPreset: value }))` (Skill-Regel). Presets
setzen String + alle Slider in **einem** Update; sobald der User einen Slider anfasst →
`broadcastPreset='custom'`.

Presets: `dvw790` (= Defaults, clean studio), `studio` (mehr Diffusion + Color-Punch,
weniger Detail), `eng` (News: mehr Detail/Contour, wenig Diffusion, leichtes Videorauschen).

---

## 3. GPU-Pipeline (`effects/broadcast.rs`, Multi-Pass)

`prepare(adjustments, (w,h), source_size) -> Option<BroadcastJob>` — liest `broadcast*`
aus losem `serde_json::Value`, gated via `is_effect_enabled(adjustments,"broadcast",
"broadcastEnabled")`. `source_size` wie bei `noise.rs`/`film_noise.rs` durchschleusen.

`encode(enc, job, src, dst)` Pass-Kette (Zwischen-Slots **F32-Scratch**; finaler Blit nach
F16 — Output-Format-Trap: `light_effects.wgsl` nutzt `Out::Both(out_f32,out_f16)`, also
pro Entry prüfen welches `textureStore`-Target geschrieben wird):

1. **lumaBlur** = `enc.blur(src, r_small, …)` → Softness (#1) + Unsharp-Basis (#6).
2. **chromaBlur** = `enc.blur(src, r_chroma≈chromaReduction, …)` → Cb/Cr-Quelle (#7) + Skin-Kopie (#5).
3. **skin** = `enc.guided_model(...)` edge-aware auf Hautton-Maske (#5).
4. **diffusion** = Bloom-Pyramid wie `light.rs::bloom()`: Threshold `> diffusionThreshold`
   → down/up → screen-add (#2). Nur wenn `broadcastDiffusion > 0`.
5. **broadcast_combine** (einziger genuin neuer Entry): pro Pixel
   - Y aus lumaBlur-Mix, Cb/Cr aus chromaBlur → 4:2:2-Look (#7)
   - Aperture-Overshoot `+ detail·(Y_src − Y_lumaBlur)` (#6)
   - Hautmaske → mix zu `skin` (#5)
   - Saturation/Vibrance + Rec.601-Bias (#4)
   - Soft-Knee White-Clip (#3) + Diffusion-Add (#2)
   - optional image-space Videorauschen (#8a), sRGB→linear
   - optional Interlace-Modulation an 576-Zeilen-image-space-Raster (#8b)
   - Master-Blend `broadcastAmount` über Original
6. **sdResample** (wenn `broadcastSdLook != 'off'`): `enc.area_down` auf 576-Zeilen-
   Äquivalent + Upscale-Blur für SD-Weichheit (#9).

**Image-Space-Hashing (Pflicht):** Videorauschen + Interlace über
`image_xy = id.xy·(source_size/working_size)` (Grid.src fädelt `source_size`), damit nichts
beim Zoomen schwimmt und Preview == Export. **Blur/area_down-Radien bleiben in
Preview-Pixeln** (nicht image-space mappen). Neue WGSL-Entries unter `Group::Common` in
`compute.rs` registrieren; mit `naga` gegen Preamble+Shader validieren.

---

## 4. Installer-Patches (modelliert auf Blur-Noise `patches.mjs`, Anker aus 1.7.0-Source)

**COPY_FILES** (`plugin-src/` → Target, verbatim):
- `src-tauri/src/effects/broadcast.rs`
- `src/components/adjustments/sections/BroadcastSection.tsx`
- `src/utils/broadcast.ts` (Clamp-Helfer, Preset-Tabellen)

**TEXT_PATCHES** (jeweils verbatim-Anker aus Live-Source lesen, expliziter `mode`, stabiler `alreadyApplied`):

| id | file | Anker/Zweck |
|----|------|-------------|
| `rust-mod-broadcast` | `src-tauri/src/effects/mod.rs` | nach letztem `pub mod …;` → `pub mod broadcast;` |
| `rust-dispatch-broadcast` | `src-tauri/src/render/source.rs` | nach dem letzten Effekt-Dispatch-Block `broadcast::prepare(adjustments, working_size, source.size)` + `encode` einfügen |
| `rust-register-broadcast-entries` | `src-tauri/src/render/gpu/compute.rs` | neue `broadcast_*`-Entry-Namen unter `Group::Common` registrieren |
| `wgsl-broadcast` | `src-tauri/src/shaders/compute_common.wgsl` | `broadcast_*`-Funktionen/Entry anhängen |
| `ts-effect-enum` | `src/utils/adjustments.ts` | `BroadcastEnabled='broadcastEnabled'` |
| `ts-adjustments-interface` | `src/utils/adjustments.ts` | alle `broadcast*`-Felder (inkl. String-Unions) |
| `ts-merge-defaults` | `src/utils/adjustments.ts` | Reconciliation `?? default` pro Feld |
| `ts-register-effects-tools` | `src/utils/adjustments.ts` | `{ id:'broadcast', label:'editor.broadcast.title' }` in `ADJUSTMENT_SECTION_TOOLS.effects` |
| `ts-adjustment-groups` | `src/utils/adjustments.ts` | `broadcast`-Gruppe in `ADJUSTMENT_GROUPS.effects` (Copy/Paste) |
| `json-default-adjustments` | `src/utils/defaultAdjustments.json` | `broadcast*`-Defaults |
| `tsx-effects-import` + `tsx-effects-render` | `src/components/adjustments/Effects.tsx` | `BroadcastSection` importieren + rendern |

**i18n** (Locale-Deep-Merge, Plugin-Sentinel/Version-Key): Namespace `editor.broadcast.*`
(Title, alle Labels, Dropdown-Optionen, Tooltips) **und** `modals.copyPaste.groups.broadcast`
— in **allen** gepatchten Locales, nicht nur `en`/`editor`.

**Cache (Pflicht):** jedes `broadcast*`-Feld in `calculate_effects_hash` UND
`calculate_transform_hash` (sonst stale Slider / swimming).

Mechanik 1:1 Blur-Noise: COPY_FILES-Mirror, Manifest+Backups, Pre-Overwrite-Hash-Checks,
`--dry-run` Pflicht, fail-closed bei kaputtem Manifest, hash-sicheres Uninstall
(`hashAfter`, `--force`). **LF-Anker:** Tree vor Patch auf CRLF prüfen (`grep -lc $'\r'`)
bzw. mit `core.autocrlf=false` klonen — sonst „Anchor not found".

---

## 5. Repo & Delivery

Neues Repo `rapidraw-broadcast-edition` (nur Plugin, **kein** RapidRAW-Source vendoren),
Owner `whigain`. Git-Identity vor erstem Commit: `359241273+whigain@users.noreply.github.com`,
per Commits-API prüfen (Alt-Account `Bgjulusgb` darf nicht auftauchen). Struktur spiegelt
`rapidraw-blur-noise-edition`. Description enthält „RapidRAW plugin", Homepage →
`/releases/latest`, Topics wie Blur-Noise + `broadcast, pal, standard-definition`.

Zwei Delivery-Pfade strikt getrennt: **Source-Patcher** → RapidRAW-**Source-Checkout**;
**Wrapper-EXE** (`BroadcastPluginInstaller.exe`, MSI+NSIS, signiertes Manifest, Single-EXE)
→ **kompilierte** 1.7.0-Installation. Je unterstützter RapidRAW-Version eine Edition.

---

## 6. Verifikations-Reihenfolge (billig → teuer, Skill-Workflow)

Gegen einen **frischen, separaten** RapidRAW-1.7.0-Checkout (nicht `RapidRAW-main` — der
ist schon mit Blur-Noise gepatcht; zwei Manifeste würden sich layern). Klon mit
`core.autocrlf=false`.

1. Plugin `npm test`.
2. `node installer/install.mjs --rapidraw <checkout> --dry-run`.
3. Real-Install → `cargo check` in `src-tauri`.
4. `naga <scratch.wgsl>` gegen Preamble + aktuellen Shader-String (`Validation successful`).
5. `npx tsc --noEmit` + `npm run build` im RapidRAW-Root.
6. `npm run tauri dev` → warten bis WGPU rendert → GUI-Smoke mit
   `scripts/rapidraw_driver.py` (Py 3.12, native `C:/...`): Section aktivieren, jeden
   Slider + Amount, beide Dropdowns durchschalten, Seed-Reroll, Zoom 25/50/100/200%
   (Black-Frame/Swimming prüfen), Copy/Paste zweimal (alle Felder inkl. Strings; dann
   Gruppe ausschließen + Sentinel). Default-Copy/Paste-Auswahl danach wiederherstellen.
7. `npm run tauri build` erst nach 1–6, Background + Notify; MSI/NSIS-Pfade+Größen prüfen.

Static (cargo/tsc/naga) ist notwendig, nicht hinreichend — echter gerenderter Frame fängt
Cache-Staleness + unwritten-output.

---

## 7. Phasen

- **P0 (v0.1.0 Kern):** Section + `broadcast.rs` mit Softness, Detail, ChromaReduction,
  ColorPunch, HighlightRolloff, Diffusion, SkinSmooth, Amount, Presets (reuse blur/
  guided/bloom). Installer + i18n + Copy/Paste + Cache. Verify 1–6.
- **P1:** optionales Videorauschen + Interlacing + PAL-SD-Resample (`area_down`), Seed-Reroll.
- **P2:** Wrapper-EXE (MSI+NSIS, signiertes Manifest, Single-EXE) + CI-Workflow + GitHub-
  Release unter `whigain`.

Default-Design-Entscheidungen (beim Bau so gelöst, korrigierbar):
- Hautmaske = simples YCbCr-Hue/Sat-Fenster (kein ML, clean-room, billig).
- Diffusion reused das `light.rs`-Bloom-Pattern statt eigener Pyramid-Shader.
