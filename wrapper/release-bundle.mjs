import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { validateReleaseManifest } from './release-manifest.mjs';
import { verifyReleaseManifestSignature } from './release-signature.mjs';

export const RELEASE_MANIFEST_NAME = 'release-manifest.json';
export const RELEASE_SIGNATURE_NAME = 'release-manifest.sig';

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

export async function loadVerifiedRelease(dir, publicKeyPem) {
  const manifestPath = join(dir, RELEASE_MANIFEST_NAME);
  const signaturePath = join(dir, RELEASE_SIGNATURE_NAME);
  if (!existsSync(manifestPath) || !existsSync(signaturePath)) {
    throw new Error(`Release manifest or signature is missing (${RELEASE_MANIFEST_NAME}, ${RELEASE_SIGNATURE_NAME})`);
  }

  const manifestBytes = await readFile(manifestPath);
  const signatureText = await readFile(signaturePath, 'utf8');
  if (!verifyReleaseManifestSignature(manifestBytes, signatureText, publicKeyPem)) {
    throw new Error('Release manifest signature verification failed');
  }

  let manifest;
  try {
    manifest = validateReleaseManifest(JSON.parse(manifestBytes.toString('utf8')));
  } catch (error) {
    throw new Error(`Release manifest is invalid: ${error.message}`);
  }

  for (const artifact of manifest.artifacts) {
    const artifactPath = join(dir, artifact.file);
    if (!existsSync(artifactPath)) throw new Error(`Release artifact is missing: ${artifact.file}`);
    if (await sha256(artifactPath) !== artifact.sha256) {
      throw new Error(`SHA-256 verification failed: ${artifact.file}`);
    }
  }

  return manifest;
}
