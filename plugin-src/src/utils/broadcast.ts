// Early 2000s Television Broadcast — frontend helpers (presets, constants).
//
// Mirrors the field names consumed by src-tauri/src/effects/broadcast.rs.
// String-valued fields (broadcastSdLook, broadcastPreset) must be written with
// the raw `setAdjustments` setter, never the numeric handleAdjustmentChange.

import type { Adjustments } from './adjustments';

export type BroadcastSdLook = 'off' | 'pal576' | 'soft576';
export type BroadcastPreset = 'dvw790' | 'studio' | 'eng' | 'custom';

export const BROADCAST_AMOUNT_MIN = 0;
export const BROADCAST_AMOUNT_MAX = 100;

// Fields a preset writes (everything except the enable toggle and the seed).
type BroadcastPresetValues = Pick<
  Adjustments,
  | 'broadcastPreset'
  | 'broadcastAmount'
  | 'broadcastSoftness'
  | 'broadcastDetail'
  | 'broadcastChromaReduction'
  | 'broadcastColorPunch'
  | 'broadcastHighlightRolloff'
  | 'broadcastDiffusion'
  | 'broadcastDiffusionThreshold'
  | 'broadcastSkinSmooth'
  | 'broadcastWarmth'
  | 'broadcastVideoNoise'
  | 'broadcastInterlace'
  | 'broadcastInterlaceStrength'
  | 'broadcastSdLook'
>;

export const BROADCAST_PRESETS: Array<{ id: BroadcastPreset; values: BroadcastPresetValues }> = [
  {
    // Clean, cosy Digital-Betacam studio look — the default: soft, warm, with
    // a milky highlight diffusion (think an early-2000s Christmas broadcast).
    id: 'dvw790',
    values: {
      broadcastPreset: 'dvw790',
      broadcastAmount: 100,
      broadcastSoftness: 40,
      broadcastDetail: 30,
      broadcastChromaReduction: 50,
      broadcastColorPunch: 52,
      broadcastHighlightRolloff: 55,
      broadcastDiffusion: 55,
      broadcastDiffusionThreshold: 55,
      broadcastSkinSmooth: 45,
      broadcastWarmth: 45,
      broadcastVideoNoise: 0,
      broadcastInterlace: false,
      broadcastInterlaceStrength: 20,
      broadcastSdLook: 'off',
    },
  },
  {
    // Warm, glowy studio look: heavy milky diffusion, warm colour, smooth skin.
    id: 'studio',
    values: {
      broadcastPreset: 'studio',
      broadcastAmount: 100,
      broadcastSoftness: 50,
      broadcastDetail: 25,
      broadcastChromaReduction: 55,
      broadcastColorPunch: 55,
      broadcastHighlightRolloff: 62,
      broadcastDiffusion: 70,
      broadcastDiffusionThreshold: 48,
      broadcastSkinSmooth: 55,
      broadcastWarmth: 62,
      broadcastVideoNoise: 0,
      broadcastInterlace: false,
      broadcastInterlaceStrength: 20,
      broadcastSdLook: 'soft576',
    },
  },
  {
    // ENG / news field look: crisp contour correction, little diffusion, cooler,
    // a hint of clean video noise and interlacing.
    id: 'eng',
    values: {
      broadcastPreset: 'eng',
      broadcastAmount: 100,
      broadcastSoftness: 25,
      broadcastDetail: 62,
      broadcastChromaReduction: 45,
      broadcastColorPunch: 45,
      broadcastHighlightRolloff: 45,
      broadcastDiffusion: 20,
      broadcastDiffusionThreshold: 72,
      broadcastSkinSmooth: 20,
      broadcastWarmth: 18,
      broadcastVideoNoise: 12,
      broadcastInterlace: true,
      broadcastInterlaceStrength: 25,
      broadcastSdLook: 'pal576',
    },
  },
];

export function rollBroadcastSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000) + 1;
}
