// patches.mjs — Early 2000s Television Broadcast plugin for RapidRAW.
//
// Declarative patch set consumed by install.mjs / uninstall.mjs. Built against
// RapidRAW v1.7.0 ("Furka Rendering Engine"). Every anchor was read verbatim
// from the v1.7.0 source tree.
//
// Each TEXT_PATCHES entry:
//   - file: path relative to RapidRAW root
//   - id: short identifier used in logs
//   - anchor: verbatim LF string that must exist in the current source
//   - mode: 'insertAfter' | 'insertBefore' | 'replace'
//   - payload: text to insert/replace with
//   - alreadyApplied: string proving the patch is already present (idempotency)

export const PLUGIN_VERSION = '0.1.1';
export const BACKUP_DIR = '.broadcast-plugin-backup';
export const MANIFEST_FILE = '.broadcast-plugin-manifest.json';

const BROADCAST_KEY_LIST =
  '                "broadcastAmount",\n' +
  '                "broadcastSoftness",\n' +
  '                "broadcastDetail",\n' +
  '                "broadcastChromaReduction",\n' +
  '                "broadcastColorPunch",\n' +
  '                "broadcastHighlightRolloff",\n' +
  '                "broadcastDiffusion",\n' +
  '                "broadcastDiffusionThreshold",\n' +
  '                "broadcastSkinSmooth",\n' +
  '                "broadcastWarmth",\n' +
  '                "broadcastVideoNoise",\n' +
  '                "broadcastInterlace",\n' +
  '                "broadcastInterlaceStrength",\n' +
  '                "broadcastSdLook",\n' +
  '                "broadcastSeed",\n';

const cacheHashBlock = (marker) =>
  `    // ${marker}\n` +
  '    let broadcast_enabled = is_effect_enabled(adjustments, "broadcast", "broadcastEnabled");\n' +
  '    broadcast_enabled.hash(&mut hasher);\n' +
  '    if broadcast_enabled {\n' +
  '        hash_effect_keys(\n' +
  '            adjustments,\n' +
  '            &[\n' +
  BROADCAST_KEY_LIST +
  '            ],\n' +
  '            &mut hasher,\n' +
  '        );\n' +
  '    }\n';

// --------------------------------------------------------------------
// New files copied verbatim into the tree.
// --------------------------------------------------------------------
export const COPY_FILES = [
  {
    from: 'src-tauri/src/effects/broadcast.rs',
    to: 'src-tauri/src/effects/broadcast.rs',
  },
  {
    from: 'src-tauri/src/shaders/broadcast.wgsl',
    to: 'src-tauri/src/shaders/broadcast.wgsl',
  },
  {
    from: 'src/components/adjustments/sections/BroadcastSection.tsx',
    to: 'src/components/adjustments/sections/BroadcastSection.tsx',
  },
  {
    from: 'src/utils/broadcast.ts',
    to: 'src/utils/broadcast.ts',
  },
];

// --------------------------------------------------------------------
// Anchored text patches.
// --------------------------------------------------------------------
export const TEXT_PATCHES = [
  // ---- Rust: register the effect module -----------------------------
  {
    file: 'src-tauri/src/effects/mod.rs',
    id: 'rust-mod-broadcast',
    anchor: 'pub mod relight;',
    mode: 'insertAfter',
    alreadyApplied: 'pub mod broadcast;',
    payload: '\npub mod broadcast;',
  },

  // ---- Rust: add Group::Broadcast to the compute pipeline -----------
  {
    file: 'src-tauri/src/render/gpu/compute.rs',
    id: 'rust-group-enum',
    anchor: '    LensBlur,\n    Light,\n}',
    mode: 'replace',
    alreadyApplied: '    Broadcast,\n}',
    payload: '    LensBlur,\n    Light,\n    Broadcast,\n}',
  },
  {
    file: 'src-tauri/src/render/gpu/compute.rs',
    id: 'rust-group-all',
    anchor:
      '    const ALL: [Group; 6] = [\n' +
      '        Group::Common,\n' +
      '        Group::Transform,\n' +
      '        Group::Relight,\n' +
      '        Group::Fog,\n' +
      '        Group::LensBlur,\n' +
      '        Group::Light,\n' +
      '    ];',
    mode: 'replace',
    alreadyApplied: '[Group; 7]',
    payload:
      '    const ALL: [Group; 7] = [\n' +
      '        Group::Common,\n' +
      '        Group::Transform,\n' +
      '        Group::Relight,\n' +
      '        Group::Fog,\n' +
      '        Group::LensBlur,\n' +
      '        Group::Light,\n' +
      '        Group::Broadcast,\n' +
      '    ];',
  },
  {
    file: 'src-tauri/src/render/gpu/compute.rs',
    id: 'rust-group-array-size',
    anchor: '    groups: [OnceLock<HashMap<&\'static str, wgpu::ComputePipeline>>; 6],',
    mode: 'replace',
    alreadyApplied: 'wgpu::ComputePipeline>>; 7]',
    payload: '    groups: [OnceLock<HashMap<&\'static str, wgpu::ComputePipeline>>; 7],',
  },
  {
    file: 'src-tauri/src/render/gpu/compute.rs',
    id: 'rust-group-source',
    anchor:
      '                    "lt_flare",\n' +
      '                ],\n' +
      '            ),\n' +
      '        }\n' +
      '    }',
    mode: 'replace',
    alreadyApplied: 'Group::Broadcast => (',
    payload:
      '                    "lt_flare",\n' +
      '                ],\n' +
      '            ),\n' +
      '            Group::Broadcast => (\n' +
      '                include_str!("../../shaders/broadcast.wgsl"),\n' +
      '                &["bc_bright", "bc_combine"],\n' +
      '            ),\n' +
      '        }\n' +
      '    }',
  },

  // ---- Rust: dispatch the effect in the render pipeline -------------
  {
    file: 'src-tauri/src/render/source.rs',
    id: 'rust-dispatch-broadcast',
    anchor:
      '            if let Some(job) = crate::effects::lens_blur::prepare(\n' +
      '                adjustments,\n' +
      '                transform.warp.as_ref(),\n' +
      '                working_size,\n' +
      '            ) {\n' +
      '                stage(enc, &mut current, working_size, &|enc, src, dst| {\n' +
      '                    crate::effects::lens_blur::encode(enc, &job, src, dst)\n' +
      '                });\n' +
      '            }',
    mode: 'insertAfter',
    alreadyApplied: 'crate::effects::broadcast::prepare',
    payload:
      '\n            if let Some(job) =\n' +
      '                crate::effects::broadcast::prepare(adjustments, working_size, source.size)\n' +
      '            {\n' +
      '                stage(enc, &mut current, working_size, &|enc, src, dst| {\n' +
      '                    crate::effects::broadcast::encode(enc, &job, src, dst)\n' +
      '                });\n' +
      '            }',
  },

  // ---- Rust: cache hashing so sliders invalidate the preview --------
  {
    file: 'src-tauri/src/render/cache_utils.rs',
    id: 'rust-cache-effects-hash',
    anchor:
      '        hash_orientation(adjustments, &mut hasher);\n' +
      '    }\n' +
      '\n' +
      '    hasher.finish()\n' +
      '}\n' +
      '\n' +
      'pub fn calculate_thumbnail_source_hash',
    mode: 'replace',
    alreadyApplied: '// broadcast-plugin:cache-effects',
    payload:
      '        hash_orientation(adjustments, &mut hasher);\n' +
      '    }\n' +
      '\n' +
      cacheHashBlock('broadcast-plugin:cache-effects') +
      '\n' +
      '    hasher.finish()\n' +
      '}\n' +
      '\n' +
      'pub fn calculate_thumbnail_source_hash',
  },
  {
    file: 'src-tauri/src/render/cache_utils.rs',
    id: 'rust-cache-transform-hash',
    anchor:
      '    hash_ai_patches(adjustments, &mut hasher);\n' +
      '    hash_ai_denoise(adjustments, &mut hasher);\n' +
      '    hash_negative_conversion(adjustments, &mut hasher);\n' +
      '\n' +
      '    hasher.finish()\n' +
      '}\n' +
      '\n' +
      'pub fn calculate_full_job_hash',
    mode: 'replace',
    alreadyApplied: '// broadcast-plugin:cache-transform',
    payload:
      '    hash_ai_patches(adjustments, &mut hasher);\n' +
      '    hash_ai_denoise(adjustments, &mut hasher);\n' +
      '    hash_negative_conversion(adjustments, &mut hasher);\n' +
      '\n' +
      cacheHashBlock('broadcast-plugin:cache-transform') +
      '\n' +
      '    hasher.finish()\n' +
      '}\n' +
      '\n' +
      'pub fn calculate_full_job_hash',
  },

  // ---- TS: Effect enum ----------------------------------------------
  {
    file: 'src/utils/adjustments.ts',
    id: 'ts-effect-enum',
    anchor: "  MotionBlurType = 'motionBlurType',",
    mode: 'insertAfter',
    alreadyApplied: "BroadcastEnabled = 'broadcastEnabled'",
    payload:
      '\n  /* broadcast-plugin */\n' +
      "  BroadcastEnabled = 'broadcastEnabled',\n" +
      "  BroadcastAmount = 'broadcastAmount',\n" +
      "  BroadcastSoftness = 'broadcastSoftness',\n" +
      "  BroadcastDetail = 'broadcastDetail',\n" +
      "  BroadcastChromaReduction = 'broadcastChromaReduction',\n" +
      "  BroadcastColorPunch = 'broadcastColorPunch',\n" +
      "  BroadcastHighlightRolloff = 'broadcastHighlightRolloff',\n" +
      "  BroadcastDiffusion = 'broadcastDiffusion',\n" +
      "  BroadcastDiffusionThreshold = 'broadcastDiffusionThreshold',\n" +
      "  BroadcastSkinSmooth = 'broadcastSkinSmooth',\n" +
      "  BroadcastWarmth = 'broadcastWarmth',\n" +
      "  BroadcastVideoNoise = 'broadcastVideoNoise',\n" +
      "  BroadcastInterlace = 'broadcastInterlace',\n" +
      "  BroadcastInterlaceStrength = 'broadcastInterlaceStrength',\n" +
      "  BroadcastSdLook = 'broadcastSdLook',\n" +
      "  BroadcastPreset = 'broadcastPreset',\n" +
      "  BroadcastSeed = 'broadcastSeed',",
  },

  // ---- TS: Adjustments interface ------------------------------------
  {
    file: 'src/utils/adjustments.ts',
    id: 'ts-adjustments-interface',
    anchor: '  motionBlurType: MotionBlurType;\n  fogAmount: number;',
    mode: 'replace',
    alreadyApplied: 'broadcastEnabled: boolean;',
    payload:
      '  motionBlurType: MotionBlurType;\n' +
      '  broadcastEnabled: boolean;\n' +
      '  broadcastAmount: number;\n' +
      '  broadcastSoftness: number;\n' +
      '  broadcastDetail: number;\n' +
      '  broadcastChromaReduction: number;\n' +
      '  broadcastColorPunch: number;\n' +
      '  broadcastHighlightRolloff: number;\n' +
      '  broadcastDiffusion: number;\n' +
      '  broadcastDiffusionThreshold: number;\n' +
      '  broadcastSkinSmooth: number;\n' +
      '  broadcastWarmth: number;\n' +
      '  broadcastVideoNoise: number;\n' +
      '  broadcastInterlace: boolean;\n' +
      '  broadcastInterlaceStrength: number;\n' +
      "  broadcastSdLook: 'off' | 'pal576' | 'soft576';\n" +
      "  broadcastPreset: 'dvw790' | 'studio' | 'eng' | 'custom';\n" +
      '  broadcastSeed: number;\n' +
      '  fogAmount: number;',
  },

  // ---- TS: normalizeLoadedAdjustments reconciliation ----------------
  {
    file: 'src/utils/adjustments.ts',
    id: 'ts-merge-defaults',
    anchor: '    fogTint: loadedAdjustments.fogTint ?? INITIAL_ADJUSTMENTS.fogTint,',
    mode: 'insertAfter',
    alreadyApplied: 'broadcastEnabled: loadedAdjustments.broadcastEnabled',
    payload:
      '\n    broadcastEnabled: loadedAdjustments.broadcastEnabled ?? INITIAL_ADJUSTMENTS.broadcastEnabled,\n' +
      '    broadcastAmount: loadedAdjustments.broadcastAmount ?? INITIAL_ADJUSTMENTS.broadcastAmount,\n' +
      '    broadcastSoftness: loadedAdjustments.broadcastSoftness ?? INITIAL_ADJUSTMENTS.broadcastSoftness,\n' +
      '    broadcastDetail: loadedAdjustments.broadcastDetail ?? INITIAL_ADJUSTMENTS.broadcastDetail,\n' +
      '    broadcastChromaReduction: loadedAdjustments.broadcastChromaReduction ?? INITIAL_ADJUSTMENTS.broadcastChromaReduction,\n' +
      '    broadcastColorPunch: loadedAdjustments.broadcastColorPunch ?? INITIAL_ADJUSTMENTS.broadcastColorPunch,\n' +
      '    broadcastHighlightRolloff: loadedAdjustments.broadcastHighlightRolloff ?? INITIAL_ADJUSTMENTS.broadcastHighlightRolloff,\n' +
      '    broadcastDiffusion: loadedAdjustments.broadcastDiffusion ?? INITIAL_ADJUSTMENTS.broadcastDiffusion,\n' +
      '    broadcastDiffusionThreshold: loadedAdjustments.broadcastDiffusionThreshold ?? INITIAL_ADJUSTMENTS.broadcastDiffusionThreshold,\n' +
      '    broadcastSkinSmooth: loadedAdjustments.broadcastSkinSmooth ?? INITIAL_ADJUSTMENTS.broadcastSkinSmooth,\n' +
      '    broadcastWarmth: loadedAdjustments.broadcastWarmth ?? INITIAL_ADJUSTMENTS.broadcastWarmth,\n' +
      '    broadcastVideoNoise: loadedAdjustments.broadcastVideoNoise ?? INITIAL_ADJUSTMENTS.broadcastVideoNoise,\n' +
      '    broadcastInterlace: loadedAdjustments.broadcastInterlace ?? INITIAL_ADJUSTMENTS.broadcastInterlace,\n' +
      '    broadcastInterlaceStrength: loadedAdjustments.broadcastInterlaceStrength ?? INITIAL_ADJUSTMENTS.broadcastInterlaceStrength,\n' +
      '    broadcastSdLook: loadedAdjustments.broadcastSdLook ?? INITIAL_ADJUSTMENTS.broadcastSdLook,\n' +
      '    broadcastPreset: loadedAdjustments.broadcastPreset ?? INITIAL_ADJUSTMENTS.broadcastPreset,\n' +
      '    broadcastSeed: loadedAdjustments.broadcastSeed ?? INITIAL_ADJUSTMENTS.broadcastSeed,',
  },

  // ---- TS: register the section tool --------------------------------
  {
    file: 'src/utils/adjustments.ts',
    id: 'ts-register-effects-tools',
    anchor:
      "    { id: 'grain', label: 'adjustments.effects.grain' },\n" +
      '  ],\n' +
      '};',
    mode: 'replace',
    alreadyApplied: "{ id: 'broadcast', label: 'editor.broadcast.title' }",
    payload:
      "    { id: 'grain', label: 'adjustments.effects.grain' },\n" +
      "    { id: 'broadcast', label: 'editor.broadcast.title' },\n" +
      '  ],\n' +
      '};',
  },

  // ---- TS: copy/paste group -----------------------------------------
  {
    file: 'src/utils/adjustments.ts',
    id: 'ts-register-copy-groups',
    anchor:
      "    { label: 'modals.copyPaste.groups.grain', keys: [Effect.GrainAmount, Effect.GrainRoughness, Effect.GrainSize] },",
    mode: 'insertAfter',
    alreadyApplied: "'modals.copyPaste.groups.broadcast'",
    payload:
      '\n    {\n' +
      "      label: 'modals.copyPaste.groups.broadcast',\n" +
      '      keys: [\n' +
      '        Effect.BroadcastEnabled,\n' +
      '        Effect.BroadcastAmount,\n' +
      '        Effect.BroadcastSoftness,\n' +
      '        Effect.BroadcastDetail,\n' +
      '        Effect.BroadcastChromaReduction,\n' +
      '        Effect.BroadcastColorPunch,\n' +
      '        Effect.BroadcastHighlightRolloff,\n' +
      '        Effect.BroadcastDiffusion,\n' +
      '        Effect.BroadcastDiffusionThreshold,\n' +
      '        Effect.BroadcastSkinSmooth,\n' +
      '        Effect.BroadcastWarmth,\n' +
      '        Effect.BroadcastVideoNoise,\n' +
      '        Effect.BroadcastInterlace,\n' +
      '        Effect.BroadcastInterlaceStrength,\n' +
      '        Effect.BroadcastSdLook,\n' +
      '        Effect.BroadcastPreset,\n' +
      '        Effect.BroadcastSeed,\n' +
      '      ],\n' +
      '    },',
  },

  // ---- JSON: default adjustments ------------------------------------
  {
    file: 'src/utils/defaultAdjustments.json',
    id: 'json-default-adjustments',
    anchor: '  "grainSize": 25,',
    mode: 'insertAfter',
    alreadyApplied: '"broadcastEnabled"',
    payload:
      '\n  "broadcastEnabled": false,\n' +
      '  "broadcastAmount": 100,\n' +
      '  "broadcastSoftness": 40,\n' +
      '  "broadcastDetail": 30,\n' +
      '  "broadcastChromaReduction": 50,\n' +
      '  "broadcastColorPunch": 52,\n' +
      '  "broadcastHighlightRolloff": 55,\n' +
      '  "broadcastDiffusion": 55,\n' +
      '  "broadcastDiffusionThreshold": 55,\n' +
      '  "broadcastSkinSmooth": 45,\n' +
      '  "broadcastWarmth": 45,\n' +
      '  "broadcastVideoNoise": 0,\n' +
      '  "broadcastInterlace": false,\n' +
      '  "broadcastInterlaceStrength": 20,\n' +
      '  "broadcastSdLook": "off",\n' +
      '  "broadcastPreset": "dvw790",\n' +
      '  "broadcastSeed": 1,',
  },

  // ---- TSX: import the section --------------------------------------
  {
    file: 'src/components/adjustments/Effects.tsx',
    id: 'tsx-effects-import',
    anchor: "import AdjustmentSubSection from './AdjustmentSubSection';",
    mode: 'insertAfter',
    alreadyApplied: "import BroadcastSection from './sections/BroadcastSection';",
    payload:
      '\n/* broadcast-plugin:import */\n' +
      "import BroadcastSection from './sections/BroadcastSection';",
  },

  // ---- TSX: mount the section after Grain ----------------------------
  {
    file: 'src/components/adjustments/Effects.tsx',
    id: 'tsx-effects-mount',
    anchor:
      '                value={adjustments.grainRoughness}\n' +
      '                onDragStateChange={onDragStateChange}\n' +
      '                fillOrigin="min"\n' +
      '              />\n' +
      '            </AdjustmentSubSection>\n' +
      '          )}\n' +
      '        </>',
    mode: 'replace',
    alreadyApplied: '/* broadcast-plugin:section */',
    payload:
      '                value={adjustments.grainRoughness}\n' +
      '                onDragStateChange={onDragStateChange}\n' +
      '                fillOrigin="min"\n' +
      '              />\n' +
      '            </AdjustmentSubSection>\n' +
      '          )}\n' +
      '\n' +
      '          {/* broadcast-plugin:section */}\n' +
      '          <BroadcastSection\n' +
      '            adjustments={adjustments}\n' +
      '            hiddenTools={hiddenTools}\n' +
      '            onDragStateChange={onDragStateChange}\n' +
      '            setAdjustments={setAdjustments}\n' +
      '            toolOrder={toolOrder}\n' +
      '          />\n' +
      '        </>',
  },
];

// --------------------------------------------------------------------
// i18n deep-merge (editor.broadcast.* + copy/paste group label).
// --------------------------------------------------------------------
const EDITOR_EN = {
  _broadcastPluginInstalled: PLUGIN_VERSION,
  broadcast: {
    title: 'Early 2000s Broadcast',
    enable: 'Enable',
    preset: 'Preset',
    amount: 'Amount',
    softness: 'Electronic Softness',
    detail: 'Contour Correction',
    chromaReduction: 'Chroma Reduction',
    colorPunch: 'Colour Punch',
    highlightRolloff: 'Highlight Roll-off',
    diffusion: 'Highlight Diffusion',
    diffusionThreshold: 'Diffusion Threshold',
    skinSmooth: 'Skin Smoothing',
    warmth: 'Warmth',
    videoNoise: 'Video Noise',
    interlace: 'Interlacing',
    interlaceStrength: 'Interlace Strength',
    sdLook: 'PAL-SD Look',
    rerollSeed: 'Reroll',
    rerollSeedTitle: 'Reroll the video-noise seed',
    presets: {
      dvw790: 'DVW-790 Studio',
      studio: 'Studio',
      eng: 'ENG / News',
      custom: 'Custom',
    },
    sd: {
      off: 'Off',
      pal576: 'PAL 576',
      soft576: 'PAL 576 (soft)',
    },
  },
};

const EDITOR_DE = {
  _broadcastPluginInstalled: PLUGIN_VERSION,
  broadcast: {
    title: 'Early 2000s Broadcast',
    enable: 'Aktivieren',
    preset: 'Vorlage',
    amount: 'Stärke',
    softness: 'Elektronische Weichheit',
    detail: 'Konturschärfung',
    chromaReduction: 'Farbdetail-Reduktion',
    colorPunch: 'Farbkraft',
    highlightRolloff: 'Lichter-Kompression',
    diffusion: 'Lichter-Diffusion',
    diffusionThreshold: 'Diffusions-Schwelle',
    skinSmooth: 'Hautglättung',
    warmth: 'Wärme',
    videoNoise: 'Videorauschen',
    interlace: 'Interlacing',
    interlaceStrength: 'Interlace-Stärke',
    sdLook: 'PAL-SD-Look',
    rerollSeed: 'Neu',
    rerollSeedTitle: 'Videorausch-Seed neu würfeln',
    presets: {
      dvw790: 'DVW-790 Studio',
      studio: 'Studio',
      eng: 'ENG / News',
      custom: 'Benutzerdefiniert',
    },
    sd: {
      off: 'Aus',
      pal576: 'PAL 576',
      soft576: 'PAL 576 (weich)',
    },
  },
};

const MODALS_GROUP = { copyPaste: { groups: { broadcast: 'Broadcast' } } };

export const I18N_PATCHES = {
  en: {
    path: 'src/i18n/locales/en.json',
    editor: EDITOR_EN,
    modals: MODALS_GROUP,
  },
  de: {
    path: 'src/i18n/locales/de.json',
    editor: EDITOR_DE,
    modals: MODALS_GROUP,
  },
};
