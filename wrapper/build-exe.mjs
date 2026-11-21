#!/usr/bin/env node
/* eslint-disable no-console */
//
// build-exe.mjs — Package broadcastinstaller.mjs into a self-contained
// Windows `.exe` via Node.js Single Executable Applications (SEA).
//
// Requirements on this machine:
//   - Node 22+ (SEA is stable there; our local node is v24 → ok).
//   - npx with internet access for `esbuild` and `postject` (run once).
//
// Steps mirror Press Plugin's wrapper 1:1 — only the file/exe names differ.

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadVerifiedRelease } from './release-bundle.mjs';
import { RELEASE_PUBLIC_KEY_PEM } from './release-public-key.mjs';
import { createSeaAssetMap } from './single-exe-assets.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const WRAPPER_DIR = __dirname;
const DIST = resolve(ROOT, 'dist');

const C = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
            red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m' };
const log = {
  title: (m) => console.log(`\n${C.bold}${m}${C.reset}`),
  step: (m) => console.log(`${C.cyan}▸${C.reset} ${m}`),
  ok: (m) => console.log(`  ${C.green}✓${C.reset} ${C.dim}${m}${C.reset}`),
  warn: (m) => console.log(`  ${C.yellow}!${C.reset} ${m}`),
  err: (m) => console.log(`  ${C.red}✗${C.reset} ${m}`),
  info: (m) => console.log(`  ${m}`),
};

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited with ${result.status}`);
  }
}

function runAllowFail(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  return result.status ?? 1;
}

async function main() {
  if (process.platform !== 'win32') {
    log.err('build-exe.mjs is Windows-only (produces a .exe via Node SEA).');
    process.exit(1);
  }

  mkdirSync(DIST, { recursive: true });
  const manifest = await loadVerifiedRelease(DIST, RELEASE_PUBLIC_KEY_PEM);
  const seaAssets = createSeaAssetMap(manifest);
  for (const assetPath of Object.values(seaAssets)) {
    if (!existsSync(resolve(WRAPPER_DIR, assetPath))) {
      throw new Error(`Single-EXE asset is missing: ${assetPath}`);
    }
  }
  const bundleName = 'broadcastinstaller.bundle.cjs';
  const blobName = 'broadcastinstaller.blob';
  const seaConfigName = 'sea-config.json';
  const bundlePath = join(WRAPPER_DIR, bundleName);
  const blobPath = join(WRAPPER_DIR, blobName);
  const seaConfigPath = join(WRAPPER_DIR, seaConfigName);
  const exePath = join(DIST, 'BroadcastPluginInstaller.exe');

  // 1. Bundle the .mjs to a single-file CJS with esbuild.
  log.title('1. Bundling broadcastinstaller.mjs with esbuild');
  run('npx', ['--no-install', 'esbuild',
    'broadcastinstaller.mjs',
    '--bundle',
    '--platform=node',
    '--target=node20',
    '--format=cjs',
    `--outfile=${bundleName}`,
  ], { cwd: WRAPPER_DIR });
  log.ok(`Bundle: ${bundlePath}`);

  // 2. Write the SEA config.
  log.title('2. Writing SEA config');
  const seaConfig = {
    main: bundleName,
    output: blobName,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: true,
    assets: seaAssets,
  };
  writeFileSync(seaConfigPath, JSON.stringify(seaConfig, null, 2));
  log.ok(seaConfigPath);

  // 3. Produce the SEA blob.
  log.title('3. Building SEA blob');
  run(process.execPath, ['--experimental-sea-config', seaConfigName], { cwd: WRAPPER_DIR });
  log.ok(blobPath);

  // 4. Copy node.exe → BroadcastPluginInstaller.exe
  log.title('4. Copying node.exe as installer host');
  if (existsSync(exePath)) rmSync(exePath);
  copyFileSync(process.execPath, exePath);
  log.ok(exePath);

  // 5. Remove Microsoft's Authenticode signature (best effort).
  log.title('5. Removing existing signature (best effort)');
  const sigStatus = runAllowFail('signtool', ['remove', '/s', `"${exePath}"`]);
  if (sigStatus !== 0) {
    log.warn('signtool not available — skipping signature removal (not fatal).');
  } else {
    log.ok('Stripped original signature.');
  }

  // 6. Inject the blob with postject.
  log.title('6. Injecting SEA blob with postject');
  run('npx', ['--no-install', 'postject',
    `"${exePath}"`,
    'NODE_SEA_BLOB',
    blobName,
    '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ], { cwd: WRAPPER_DIR });
  log.ok(`Injected ${blobName} into ${exePath}`);

  // 7. Clean up intermediates.
  log.title('7. Cleaning up');
  try { rmSync(bundlePath); } catch {}
  try { rmSync(blobPath); } catch {}
  try { rmSync(seaConfigPath); } catch {}
  log.ok('Intermediates removed.');

  log.title('Done');
  log.ok(`Single-file EXE ready: ${exePath}`);
  log.info(`Embedded RapidRAW ${manifest.rapidrawVersion}: MSI + NSIS + signed manifest + notices.`);
  log.info(`Publish only ${C.bold}dist/BroadcastPluginInstaller.exe${C.reset}.`);
}

main().catch((e) => { console.error(e); process.exit(10); });
