import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PLUGIN_VERSION,
  BACKUP_DIR,
  MANIFEST_FILE,
  COPY_FILES,
  TEXT_PATCHES,
  I18N_PATCHES,
} from '../installer/patches.mjs';
import {
  BROADCAST_PRESETS,
  rollBroadcastSeed,
} from '../plugin-src/src/utils/broadcast.ts';

test('plugin metadata is well formed', () => {
  assert.match(PLUGIN_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(BACKUP_DIR, '.broadcast-plugin-backup');
  assert.equal(MANIFEST_FILE, '.broadcast-plugin-manifest.json');
});

test('COPY_FILES point at the four new plugin files', () => {
  const targets = COPY_FILES.map((f) => f.to);
  assert.deepEqual(targets.sort(), [
    'src-tauri/src/effects/broadcast.rs',
    'src-tauri/src/shaders/broadcast.wgsl',
    'src/components/adjustments/sections/BroadcastSection.tsx',
    'src/utils/broadcast.ts',
  ].sort());
});

test('every text patch has the required fields and a unique id', () => {
  const ids = new Set();
  for (const p of TEXT_PATCHES) {
    assert.ok(p.file, 'file');
    assert.ok(p.id, 'id');
    assert.ok(p.anchor && p.anchor.length > 0, `anchor for ${p.id}`);
    assert.ok(['insertAfter', 'insertBefore', 'replace'].includes(p.mode), `mode for ${p.id}`);
    assert.ok(typeof p.payload === 'string' && p.payload.length > 0, `payload for ${p.id}`);
    assert.ok(p.alreadyApplied && p.alreadyApplied.length > 0, `alreadyApplied for ${p.id}`);
    assert.ok(!ids.has(p.id), `duplicate id ${p.id}`);
    ids.add(p.id);
  }
});

test('replace/insertAfter payloads re-contain their anchor or marker (idempotency sanity)', () => {
  for (const p of TEXT_PATCHES) {
    if (p.mode === 'replace') {
      // A replace payload must still contain the alreadyApplied marker so a
      // second run detects it and skips.
      assert.ok(
        p.payload.includes(p.alreadyApplied),
        `replace payload for ${p.id} must contain its alreadyApplied marker`,
      );
    } else {
      assert.ok(
        p.payload.includes(p.alreadyApplied),
        `insert payload for ${p.id} must contain its alreadyApplied marker`,
      );
    }
  }
});

test('i18n patches cover en + de with the broadcast namespace and sentinel', () => {
  for (const lang of ['en', 'de']) {
    const entry = I18N_PATCHES[lang];
    assert.ok(entry, `${lang} present`);
    assert.match(entry.path, /locales\/.+\.json$/);
    assert.equal(entry.editor._broadcastPluginInstalled, PLUGIN_VERSION);
    assert.ok(entry.editor.broadcast.title, `${lang} title`);
    assert.ok(entry.editor.broadcast.presets.dvw790, `${lang} preset label`);
    assert.ok(entry.editor.broadcast.sd.pal576, `${lang} sd label`);
    assert.equal(entry.modals.copyPaste.groups.broadcast, 'Broadcast');
  }
});

test('presets are internally consistent and in range', () => {
  const ids = BROADCAST_PRESETS.map((p) => p.id);
  assert.deepEqual(ids, ['dvw790', 'studio', 'eng']);
  for (const preset of BROADCAST_PRESETS) {
    assert.equal(preset.values.broadcastPreset, preset.id);
    for (const [key, value] of Object.entries(preset.values)) {
      if (typeof value === 'number') {
        assert.ok(value >= 0 && value <= 100, `${preset.id}.${key} in 0..100`);
      }
    }
    assert.ok(['off', 'pal576', 'soft576'].includes(preset.values.broadcastSdLook));
  }
});

test('rollBroadcastSeed returns a positive 32-bit-ish integer', () => {
  for (let i = 0; i < 50; i++) {
    const s = rollBroadcastSeed();
    assert.ok(Number.isInteger(s) && s > 0 && s < 2 ** 31);
  }
});
