import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { validateReleaseManifest } from './release-manifest.mjs';
import { verifyReleaseManifestSignature } from './release-signature.mjs';

export const EMBEDDED_MANIFEST_ASSET = 'release-manifest.json';
export const EMBEDDED_SIGNATURE_ASSET = 'release-manifest.sig';
export const EMBEDDED_NOTICES_ASSET = 'THIRD_PARTY_NOTICES.txt';

function assetBuffer(getAsset, name) {
  try {
    return Buffer.from(getAsset(name));
  } catch (error) {
    throw new Error(`Embedded release asset is missing: ${name} (${error.message})`);
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function loadVerifiedEmbeddedRelease(getAsset, publicKeyPem) {
  const manifestBytes = assetBuffer(getAsset, EMBEDDED_MANIFEST_ASSET);
  const signatureText = assetBuffer(getAsset, EMBEDDED_SIGNATURE_ASSET).toString('utf8');
  if (!verifyReleaseManifestSignature(manifestBytes, signatureText, publicKeyPem)) {
    throw new Error('Embedded release manifest signature verification failed');
  }

  let manifest;
  try {
    manifest = validateReleaseManifest(JSON.parse(manifestBytes.toString('utf8')));
  } catch (error) {
    throw new Error(`Embedded release manifest is invalid: ${error.message}`);
  }

  const artifacts = new Map();
  for (const descriptor of manifest.artifacts) {
    const bytes = assetBuffer(getAsset, descriptor.file);
    if (sha256(bytes) !== descriptor.sha256) {
      throw new Error(`SHA-256 verification failed for embedded asset: ${descriptor.file}`);
    }
    artifacts.set(descriptor.kind, { ...descriptor, bytes });
  }

  return {
    manifest,
    artifacts,
    notices: assetBuffer(getAsset, EMBEDDED_NOTICES_ASSET),
  };
}

export async function extractEmbeddedInstaller(artifact, tempRoot) {
  if (!artifact?.file || !Buffer.isBuffer(artifact.bytes)) {
    throw new Error('A verified embedded installer artifact is required');
  }
  const dir = await mkdtemp(join(tempRoot, 'rapidraw-broadcast-'));
  const path = join(dir, artifact.file);
  await writeFile(path, artifact.bytes, { mode: 0o700, flag: 'wx' });
  return {
    path,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
