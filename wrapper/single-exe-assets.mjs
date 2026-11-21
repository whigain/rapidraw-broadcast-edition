import { validateReleaseManifest } from './release-manifest.mjs';
import {
  EMBEDDED_MANIFEST_ASSET,
  EMBEDDED_NOTICES_ASSET,
  EMBEDDED_SIGNATURE_ASSET,
} from './embedded-release.mjs';

export function createSeaAssetMap(value) {
  const manifest = validateReleaseManifest(value);
  return {
    [EMBEDDED_MANIFEST_ASSET]: `../dist/${EMBEDDED_MANIFEST_ASSET}`,
    [EMBEDDED_SIGNATURE_ASSET]: `../dist/${EMBEDDED_SIGNATURE_ASSET}`,
    [EMBEDDED_NOTICES_ASSET]: `../dist/${EMBEDDED_NOTICES_ASSET}`,
    ...Object.fromEntries(manifest.artifacts.map((artifact) => [artifact.file, `../dist/${artifact.file}`])),
  };
}
