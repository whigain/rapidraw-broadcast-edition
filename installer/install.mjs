#!/usr/bin/env node
/* eslint-disable no-console */
//
// install.mjs — Blur Noise Plugin installer for RapidRAW
//
//   node install.mjs --rapidraw <path> [--dry-run] [--build] [--force]
//
// Flags
//   --rapidraw <path>   REQUIRED. Path to the RapidRAW source tree (contains package.json
//                       with name=="rapidraw" and src-tauri/).
//   --dry-run           Show what would happen, change nothing.
//   --build             After patching, run `npm install && npm run tauri build`.
//                       Default is "patches only"; you build when you want.
//   --force             Overwrite files that were manually modified since install.
//                       Normally install aborts if a target file's hash doesn't match
//                       what was recorded in the manifest.
//   --help              Show usage.
//
// Idempotency
//   Every patch has an "alreadyApplied" marker — re-running is safe.
//
// Rollback
//   Originals are copied to <rapidraw>/.blur-noise-plugin-backup/ with full paths preserved.
//   The manifest (.blur-noise-plugin-manifest.json) tracks every touched file plus its
//   SHA-256 before/after. uninstall.mjs reads this manifest.
//
// NOTE: unlike the Press Plugin, this installer also patches src-tauri/ (Rust +
// WGSL). A `cargo check` in src-tauri/ after install is strongly recommended
// before the full `npm run tauri build` — see ../PLAN.md "Verifikations-Workflow".

import { readFile, writeFile, mkdir, copyFile, access, rm } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  PLUGIN_VERSION,
  BACKUP_DIR,
  MANIFEST_FILE,
  COPY_FILES,
  TEXT_PATCHES,
  I18N_PATCHES,
} from './patches.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_SRC_ROOT = resolve(__dirname, '..', 'plugin-src');

// --------------------------------------------------------------------
// CLI parsing (no deps on purpose)
// --------------------------------------------------------------------
function parseArgs(argv) {
  const out = { rapidraw: null, dryRun: false, build: false, force: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--rapidraw': out.rapidraw = argv[++i]; break;
      case '--dry-run': out.dryRun = true; break;
      case '--build': out.build = true; break;
      case '--force': out.force = true; break;
      case '--help':
      case '-h': out.help = true; break;
      default:
        if (a.startsWith('--rapidraw=')) out.rapidraw = a.slice('--rapidraw='.length);
        else if (!a.startsWith('--')) out.rapidraw ||= a;
        else console.warn(`Unknown flag: ${a}`);
    }
  }
  return out;
}

function printUsage() {
  console.log(`Early 2000s Television Broadcast Plugin for RapidRAW — installer v${PLUGIN_VERSION}

Usage:
  node install.mjs --rapidraw <path-to-RapidRAW> [options]

Options:
  --dry-run       Show what would change, write nothing.
  --build         After patching, run npm install + tauri build (takes minutes).
  --force         Ignore hash mismatches on already-tracked files.
  -h, --help      Show this message.

Example:
  node install.mjs --rapidraw "C:/Users/benja/Documents/Press Plugin for Rapidraw/RapidRAW-main"
`);
}

// --------------------------------------------------------------------
// Logging + colors (basic ANSI)
// --------------------------------------------------------------------
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m',
};
const log = {
  step: (m) => console.log(`${C.cyan}▸${C.reset} ${m}`),
  ok: (m) => console.log(`  ${C.green}✓${C.reset} ${C.dim}${m}${C.reset}`),
  skip: (m) => console.log(`  ${C.yellow}·${C.reset} ${C.dim}${m}${C.reset}`),
  warn: (m) => console.log(`  ${C.yellow}!${C.reset} ${m}`),
  err: (m) => console.log(`  ${C.red}✗${C.reset} ${m}`),
  info: (m) => console.log(`  ${m}`),
  title: (m) => console.log(`\n${C.bold}${m}${C.reset}`),
};

// --------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------
async function exists(p) { try { await access(p); return true; } catch { return false; } }

async function sha256(content) {
  const h = createHash('sha256');
  h.update(typeof content === 'string' ? content : Buffer.from(content));
  return h.digest('hex');
}

async function safeRead(path) {
  return readFile(path, 'utf8');
}

async function safeWrite(path, content, dryRun) {
  if (dryRun) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}

async function backupFile(rapidrawRoot, relPath, dryRun) {
  const src = join(rapidrawRoot, relPath);
  const dst = join(rapidrawRoot, BACKUP_DIR, relPath);
  if (!await exists(src)) return null;
  if (dryRun) return dst;
  await mkdir(dirname(dst), { recursive: true });
  // Only backup once — never overwrite an existing backup.
  if (!await exists(dst)) await copyFile(src, dst);
  return dst;
}

async function loadManifest(rapidrawRoot) {
  const p = join(rapidrawRoot, MANIFEST_FILE);
  if (!await exists(p)) {
    return { pluginVersion: PLUGIN_VERSION, installedAt: null, files: {} };
  }
  try {
    const manifest = JSON.parse(await safeRead(p));
    if (!manifest || typeof manifest !== 'object' || !manifest.files || typeof manifest.files !== 'object') {
      throw new Error('missing files map');
    }
    return manifest;
  } catch (error) {
    throw new Error(`Cannot parse existing ${MANIFEST_FILE}; refusing to continue: ${error.message}`);
  }
}

async function saveManifest(rapidrawRoot, manifest, dryRun) {
  manifest.pluginVersion = PLUGIN_VERSION;
  manifest.installedAt ||= new Date().toISOString();
  await safeWrite(join(rapidrawRoot, MANIFEST_FILE), JSON.stringify(manifest, null, 2), dryRun);
}

// --------------------------------------------------------------------
// Validation: is this really a RapidRAW source tree?
// --------------------------------------------------------------------
async function validateRapidRawTree(root) {
  const errors = [];
  if (!existsSync(root)) {
    errors.push(`Path does not exist: ${root}`);
    return errors;
  }
  if (!statSync(root).isDirectory()) {
    errors.push(`Not a directory: ${root}`);
    return errors;
  }
  const pkgPath = join(root, 'package.json');
  if (!existsSync(pkgPath)) {
    errors.push(`package.json not found at ${pkgPath}`);
    return errors;
  }
  try {
    const pkg = JSON.parse(await safeRead(pkgPath));
    if (pkg.name !== 'rapidraw') {
      errors.push(`package.json name is "${pkg.name}", expected "rapidraw". Wrong folder?`);
    }
  } catch (e) {
    errors.push(`Cannot parse package.json: ${e.message}`);
  }
  for (const p of ['src/utils/adjustments.ts', 'src/components/adjustments/Effects.tsx',
                   'src-tauri/src/effects/mod.rs', 'src-tauri/src/render/source.rs',
                   'src-tauri/src/render/gpu/compute.rs', 'src-tauri/src/shaders/compute_common.wgsl',
                   'src/i18n/locales/en.json', 'src/i18n/locales/de.json']) {
    if (!existsSync(join(root, p))) errors.push(`Expected file missing: ${p}`);
  }
  return errors;
}

// --------------------------------------------------------------------
// Copy plugin-src files into the tree
// --------------------------------------------------------------------
async function doCopy(rapidrawRoot, manifest, { dryRun, force }) {
  log.title('1. Copying plugin files');
  for (const entry of COPY_FILES) {
    const srcAbs = join(PLUGIN_SRC_ROOT, entry.from);
    const dstAbs = join(rapidrawRoot, entry.to);
    const dstRel = entry.to.replace(/\\/g, '/');

    if (!await exists(srcAbs)) {
      log.warn(`missing source (skipped): ${entry.from}`);
      continue;
    }
    const srcContent = await safeRead(srcAbs);
    const srcHash = await sha256(srcContent);

    if (await exists(dstAbs)) {
      const dstContent = await safeRead(dstAbs);
      const dstHash = await sha256(dstContent);
      const tracked = manifest.files[dstRel];

      if (dstHash === srcHash) {
        log.skip(`${dstRel} (already up to date)`);
        manifest.files[dstRel] = {
          kind: 'copy',
          hashAfter: dstHash,
          addedByPlugin: tracked?.addedByPlugin ?? false,
        };
        continue;
      }

      if (tracked && tracked.hashAfter && dstHash !== tracked.hashAfter && !force) {
        log.err(`${dstRel} was modified after install — refusing to overwrite.`);
        log.info(`    rerun with --force to overwrite, or copy your changes elsewhere first.`);
        throw new Error(`hash mismatch for tracked file: ${dstRel}`);
      }
    }

    const existedBefore = await exists(dstAbs);
    const tracked = manifest.files[dstRel];
    const addedByPlugin = tracked?.addedByPlugin ?? !existedBefore;

    if (existedBefore && !addedByPlugin) await backupFile(rapidrawRoot, entry.to, dryRun);
    await safeWrite(dstAbs, srcContent, dryRun);
    manifest.files[dstRel] = {
      kind: 'copy',
      hashAfter: srcHash,
      addedByPlugin,
    };
    log.ok(`copied → ${dstRel}`);
  }
}

// --------------------------------------------------------------------
// Apply text patches (idempotent)
// --------------------------------------------------------------------
async function doTextPatches(rapidrawRoot, manifest, { dryRun, force }) {
  log.title('2. Patching RapidRAW source files');

  // Group patches by file so we only read/write each file once.
  const byFile = new Map();
  for (const p of TEXT_PATCHES) {
    if (!byFile.has(p.file)) byFile.set(p.file, []);
    byFile.get(p.file).push(p);
  }

  for (const [relFile, patches] of byFile) {
    const absFile = join(rapidrawRoot, relFile);
    if (!await exists(absFile)) {
      throw new Error(`patch target missing: ${relFile}`);
    }
    const original = await safeRead(absFile);
    const originalHash = await sha256(original);
    const tracked = manifest.files[relFile];

    // Guard against external modification.
    if (tracked?.hashAfter && originalHash !== tracked.hashAfter && !force) {
      log.err(`${relFile} was modified since last install — refusing to patch.`);
      log.info(`    rerun with --force to continue.`);
      throw new Error(`hash mismatch for tracked file: ${relFile}`);
    }

    await backupFile(rapidrawRoot, relFile, dryRun);

    let text = original;
    for (const patch of patches) {
      if (text.includes(patch.alreadyApplied)) {
        log.skip(`${relFile} [${patch.id}] (already applied)`);
        continue;
      }
      const idx = text.indexOf(patch.anchor);
      if (idx === -1) {
        throw new Error(
          `Anchor not found in ${relFile} for patch "${patch.id}". ` +
          `RapidRAW may have changed. Please report the plugin version.`);
      }
      switch (patch.mode) {
        case 'insertAfter':
          text = text.slice(0, idx + patch.anchor.length) + patch.payload + text.slice(idx + patch.anchor.length);
          break;
        case 'insertBefore':
          text = text.slice(0, idx) + patch.payload + text.slice(idx);
          break;
        case 'replace':
          text = text.slice(0, idx) + patch.payload + text.slice(idx + patch.anchor.length);
          break;
        default:
          throw new Error(`Unknown patch mode: ${patch.mode}`);
      }
      log.ok(`${relFile} [${patch.id}]`);
    }

    if (text !== original) {
      await safeWrite(absFile, text, dryRun);
      manifest.files[relFile] = {
        kind: 'patch',
        hashBefore: originalHash,
        hashAfter: await sha256(text),
        backedUp: true,
      };
    } else {
      manifest.files[relFile] ||= {
        kind: 'patch',
        hashBefore: originalHash,
        hashAfter: originalHash,
        backedUp: true,
      };
    }
  }
}

// --------------------------------------------------------------------
// i18n merge (JSON-safe, deep merge, keeps key order mostly stable)
// --------------------------------------------------------------------
function deepMergeKeys(target, source) {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) return source;
  if (typeof target !== 'object' || target === null || Array.isArray(target)) return { ...source };
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === 'object' && !Array.isArray(v) &&
        target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      target[k] = deepMergeKeys(target[k], v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

async function doI18nPatches(rapidrawRoot, manifest, { dryRun, force }) {
  log.title('3. Merging i18n translations');
  for (const [lang, entry] of Object.entries(I18N_PATCHES)) {
    const absFile = join(rapidrawRoot, entry.path);
    if (!await exists(absFile)) {
      log.warn(`missing locale (skipped): ${entry.path}`);
      continue;
    }
    const raw = await safeRead(absFile);
    const rawHash = await sha256(raw);
    const tracked = manifest.files[entry.path];
    if (tracked?.hashAfter && rawHash !== tracked.hashAfter && !force) {
      log.err(`${entry.path} was modified since last install — refusing to merge.`);
      log.info(`    rerun with --force to continue.`);
      throw new Error(`hash mismatch for tracked file: ${entry.path}`);
    }

    const json = JSON.parse(raw);
    if (json?.editor?._broadcastPluginInstalled === PLUGIN_VERSION) {
      log.skip(`${entry.path} (already applied)`);
      manifest.files[entry.path] ||= { kind: 'i18n', hashAfter: rawHash, backedUp: true };
      continue;
    }

    await backupFile(rapidrawRoot, entry.path, dryRun);
    // Merge every non-path namespace (editor, modals, ...) so the installer
    // can touch more than one i18n root per locale when needed.
    for (const [ns, payload] of Object.entries(entry)) {
      if (ns === 'path') continue;
      json[ns] = deepMergeKeys(json[ns] || {}, payload);
    }
    const nextRaw = JSON.stringify(json, null, 2) + '\n';
    await safeWrite(absFile, nextRaw, dryRun);

    manifest.files[entry.path] = {
      kind: 'i18n',
      hashBefore: rawHash,
      hashAfter: await sha256(nextRaw),
      backedUp: true,
    };
    log.ok(`${entry.path} (+ broadcast keys)`);
  }
}

// --------------------------------------------------------------------
// Optional build step
// --------------------------------------------------------------------
function runBuild(rapidrawRoot) {
  log.title('4. Building RapidRAW');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  log.step('npm install');
  const install = spawnSync(npmCmd, ['install'], { cwd: rapidrawRoot, stdio: 'inherit' });
  if (install.status !== 0) {
    log.err(`npm install exited with code ${install.status}`);
    throw new Error('npm install failed');
  }

  log.step('npm run tauri build');
  const build = spawnSync(npmCmd, ['run', 'tauri', 'build'], { cwd: rapidrawRoot, stdio: 'inherit' });
  if (build.status !== 0) {
    log.err(`tauri build exited with code ${build.status}`);
    throw new Error('tauri build failed');
  }
  log.ok('build finished');
}

// --------------------------------------------------------------------
// Main
// --------------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.rapidraw) {
    printUsage();
    process.exit(opts.help ? 0 : 1);
  }
  const root = resolve(opts.rapidraw);

  console.log(`${C.bold}Early 2000s Television Broadcast Plugin for RapidRAW v${PLUGIN_VERSION}${C.reset}`);
  log.info(`RapidRAW tree: ${root}`);
  log.info(`Mode: ${opts.dryRun ? C.yellow + 'DRY RUN' + C.reset : 'write'}` +
           (opts.build ? ' · will build' : '') +
           (opts.force ? ' · force' : ''));

  log.title('0. Validating RapidRAW tree');
  const errors = await validateRapidRawTree(root);
  if (errors.length) {
    for (const e of errors) log.err(e);
    process.exit(2);
  }
  log.ok('looks like a RapidRAW source tree');

  const manifest = await loadManifest(root);

  try {
    await doCopy(root, manifest, opts);
    await doTextPatches(root, manifest, opts);
    await doI18nPatches(root, manifest, opts);
    await saveManifest(root, manifest, opts.dryRun);
  } catch (e) {
    log.err(`Install aborted: ${e.message}`);
    log.info(`Your working tree may be partially patched. Run uninstall.mjs to roll back,`);
    log.info(`or restore from ${BACKUP_DIR}/.`);
    process.exit(3);
  }

  log.title('Done');
  if (opts.dryRun) {
    log.info('Dry run complete — no files written.');
  } else {
    log.ok(`Manifest written: ${MANIFEST_FILE}`);
    log.ok(`Backups in: ${BACKUP_DIR}/`);
    log.info('');
    log.info(`${C.bold}Next — Rust touches src-tauri/, so check before the full build:${C.reset}`);
    log.info(`  cd "${root}/src-tauri" && cargo check`);
    if (opts.build) {
      try { runBuild(root); }
      catch { process.exit(4); }
    } else {
      log.info(`Then build RapidRAW:`);
      log.info(`  cd "${root}"`);
      log.info(`  npm install`);
      log.info(`  npm run tauri build`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(10);
});
