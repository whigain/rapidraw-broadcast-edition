#!/usr/bin/env node
/* eslint-disable no-console */
//
// uninstall.mjs — restore every file touched by install.mjs using the manifest + backups.
//
//   node uninstall.mjs --rapidraw <path> [--dry-run] [--keep-backup] [--force]

import { readFile, copyFile, mkdir, rm, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, isAbsolute, normalize } from 'node:path';
import { BACKUP_DIR, MANIFEST_FILE, PLUGIN_VERSION } from './patches.mjs';

function parseArgs(argv) {
  const out = { rapidraw: null, dryRun: false, keepBackup: false, force: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--rapidraw': out.rapidraw = argv[++i]; break;
      case '--dry-run': out.dryRun = true; break;
      case '--keep-backup': out.keepBackup = true; break;
      case '--force': out.force = true; break;
      case '--help': case '-h': out.help = true; break;
      default:
        if (a.startsWith('--rapidraw=')) out.rapidraw = a.slice('--rapidraw='.length);
        else if (!a.startsWith('--')) out.rapidraw ||= a;
    }
  }
  return out;
}

const C = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
            red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m' };
const log = {
  ok: (m) => console.log(`  ${C.green}✓${C.reset} ${C.dim}${m}${C.reset}`),
  warn: (m) => console.log(`  ${C.yellow}!${C.reset} ${m}`),
  err: (m) => console.log(`  ${C.red}✗${C.reset} ${m}`),
  title: (m) => console.log(`\n${C.bold}${m}${C.reset}`),
  info: (m) => console.log(`  ${m}`),
};

async function exists(p) { try { await access(p); return true; } catch { return false; } }

async function sha256File(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

function isSafeManifestPath(relPath) {
  if (typeof relPath !== 'string' || !relPath || relPath.includes('\0') || isAbsolute(relPath)) return false;
  const normalized = normalize(relPath).replace(/\\/g, '/');
  return normalized === relPath && !relPath.split('/').includes('..');
}

function validateManifestEntries(manifest) {
  if (!manifest || typeof manifest !== 'object' || !manifest.files || typeof manifest.files !== 'object') {
    throw new Error('invalid manifest files map');
  }
  const entries = Object.entries(manifest.files);
  for (const [relPath, info] of entries) {
    if (!isSafeManifestPath(relPath)) throw new Error(`unsafe manifest path: ${relPath}`);
    if (!info || typeof info !== 'object' || !['copy', 'patch', 'i18n'].includes(info.kind)) {
      throw new Error(`invalid manifest entry: ${relPath}`);
    }
  }
  return entries;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.rapidraw) {
    console.log(`Early 2000s Television Broadcast Plugin for RapidRAW — uninstaller v${PLUGIN_VERSION}

Usage:
  node uninstall.mjs --rapidraw <path> [--dry-run] [--keep-backup] [--force]
`);
    process.exit(opts.help ? 0 : 1);
  }
  const root = resolve(opts.rapidraw);
  const manifestPath = join(root, MANIFEST_FILE);
  if (!await exists(manifestPath)) {
    log.err(`No manifest found at ${manifestPath}. Nothing to uninstall — or install was never run.`);
    process.exit(2);
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  console.log(`${C.bold}Uninstalling Early 2000s Television Broadcast Plugin v${manifest.pluginVersion}${C.reset}`);
  log.info(`RapidRAW tree: ${root}`);
  log.info(`Mode: ${opts.dryRun ? C.yellow + 'DRY RUN' + C.reset : 'write'}`);

  log.title('Restoring files');
  const entries = validateManifestEntries(manifest);
  if (entries.length === 0) log.warn('Manifest is empty.');

  for (const [relPath, info] of entries) {
    const target = join(root, relPath);
    const backup = join(root, BACKUP_DIR, relPath);

    if (await exists(target) && info.hashAfter && !opts.force) {
      const currentHash = await sha256File(target);
      if (currentHash !== info.hashAfter) {
        log.err(`${relPath} was modified after install — refusing to overwrite or remove it.`);
        log.info('    rerun with --force only after preserving your changes elsewhere.');
        throw new Error(`hash mismatch for managed file: ${relPath}`);
      }
    }

    if (info.kind === 'copy' && info.addedByPlugin) {
      if (await exists(target)) {
        if (!opts.dryRun) await rm(target);
        log.ok(`removed: ${relPath}`);
      } else {
        log.warn(`already gone: ${relPath}`);
      }
      continue;
    }

    if (!await exists(backup)) {
      log.warn(`no backup for ${relPath} (can't restore)`);
      continue;
    }

    if (!opts.dryRun) {
      await mkdir(dirname(target), { recursive: true });
      await copyFile(backup, target);
    }
    log.ok(`restored: ${relPath}`);
  }

  if (!opts.keepBackup && !opts.dryRun) {
    const backupRoot = join(root, BACKUP_DIR);
    if (await exists(backupRoot)) {
      await rm(backupRoot, { recursive: true, force: true });
      log.ok(`removed ${BACKUP_DIR}/`);
    }
    if (await exists(manifestPath)) {
      await rm(manifestPath);
      log.ok(`removed ${MANIFEST_FILE}`);
    }
  }

  log.title('Done');
  if (opts.dryRun) log.info('Dry run — nothing changed.');
  else log.ok('RapidRAW tree restored.');
}

main().catch((e) => { console.error(e); process.exit(10); });
