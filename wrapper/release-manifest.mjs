import { parseBundleVersion } from './install-selection.mjs';

const SHA256_RE = /^[a-f0-9]{64}$/i;
const REQUIRED_KINDS = new Set(['msi', 'nsis']);

function fail(message) {
  throw new Error(`Invalid release manifest: ${message}`);
}

export function validateReleaseManifest(value) {
  if (!value || typeof value !== 'object') fail('manifest must be an object');
  if (value.schemaVersion !== 1) fail('unsupported schema version');
  if (typeof value.pluginVersion !== 'string' || !value.pluginVersion) fail('pluginVersion is required');
  if (typeof value.rapidrawVersion !== 'string' || !value.rapidrawVersion) fail('rapidrawVersion is required');
  if (!Array.isArray(value.artifacts)) fail('artifacts must be an array');

  const kinds = new Set();
  const artifacts = value.artifacts.map((artifact) => {
    if (!artifact || typeof artifact !== 'object') fail('artifact must be an object');
    if (!REQUIRED_KINDS.has(artifact.kind)) fail(`unsupported artifact kind: ${artifact.kind}`);
    if (kinds.has(artifact.kind)) fail(`duplicate artifact kind: ${artifact.kind}`);
    kinds.add(artifact.kind);
    if (typeof artifact.file !== 'string' || !artifact.file || artifact.file.includes('/') || artifact.file.includes('\\')) {
      fail('artifact filename must be a bare filename');
    }
    const version = parseBundleVersion(artifact.file);
    if (!version || version !== value.rapidrawVersion) fail(`artifact filename does not match RapidRAW ${value.rapidrawVersion}`);
    if (!SHA256_RE.test(artifact.sha256 ?? '')) fail('artifact SHA-256 must be a 64-character hexadecimal digest');
    return { file: artifact.file, kind: artifact.kind, sha256: artifact.sha256.toLowerCase() };
  });

  if (kinds.size !== REQUIRED_KINDS.size || ![...REQUIRED_KINDS].every((kind) => kinds.has(kind))) {
    fail('both MSI and NSIS artifacts are required');
  }

  return {
    schemaVersion: 1,
    pluginVersion: value.pluginVersion,
    rapidrawVersion: value.rapidrawVersion,
    artifacts,
  };
}
