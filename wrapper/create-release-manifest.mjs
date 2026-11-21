#!/usr/bin/env node
/* eslint-disable no-console */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseBundleVersion } from './install-selection.mjs';
import { RELEASE_MANIFEST_NAME, RELEASE_SIGNATURE_NAME } from './release-bundle.mjs';
import { validateReleaseManifest } from './release-manifest.mjs';
import { signReleaseManifest } from './release-signature.mjs';

const WRAPPER_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(WRAPPER_DIR, '..');
const DIST = resolve(ROOT, 'dist');
const NOTICES_NAME = 'THIRD_PARTY_NOTICES.txt';

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

function findArtifacts() {
  if (!existsSync(DIST)) throw new Error(`Release directory not found: ${DIST}`);

  const artifacts = [];
  for (const file of readdirSync(DIST)) {
    const version = parseBundleVersion(file);
    if (!version) continue;
    artifacts.push({
      file,
      kind: file.toLowerCase().endsWith('.msi') ? 'msi' : 'nsis',
      version,
    });
  }

  const versions = new Set(artifacts.map((artifact) => artifact.version));
  if (versions.size !== 1) throw new Error('dist must contain exactly one RapidRAW version across MSI and NSIS artifacts');
  if (artifacts.length !== 2 || new Set(artifacts.map((artifact) => artifact.kind)).size !== 2) {
    throw new Error('dist must contain exactly one matching MSI and one matching NSIS setup artifact');
  }
  return artifacts;
}

async function main() {
  const packageJson = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  const artifacts = await Promise.all(findArtifacts().map(async (artifact) => ({
    file: artifact.file,
    kind: artifact.kind,
    sha256: await sha256(join(DIST, artifact.file)),
  })));

  const manifest = validateReleaseManifest({
    schemaVersion: 1,
    pluginVersion: packageJson.version,
    rapidrawVersion: parseBundleVersion(artifacts[0].file),
    artifacts,
  });

  const signingKeyPath = process.env.RAPIDRAW_RELEASE_SIGNING_KEY;
  if (!signingKeyPath) {
    throw new Error('RAPIDRAW_RELEASE_SIGNING_KEY must point to the offline Ed25519 private key');
  }
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const signature = signReleaseManifest(manifestBytes, await readFile(signingKeyPath, 'utf8'));
  await writeFile(join(DIST, RELEASE_MANIFEST_NAME), manifestBytes);
  await writeFile(join(DIST, RELEASE_SIGNATURE_NAME), `${signature}\n`, 'utf8');
  await copyFile(join(WRAPPER_DIR, NOTICES_NAME), join(DIST, NOTICES_NAME));
  console.log(`Wrote ${RELEASE_MANIFEST_NAME}, ${RELEASE_SIGNATURE_NAME}, and ${NOTICES_NAME} to ${DIST}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
