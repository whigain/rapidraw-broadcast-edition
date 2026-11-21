import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function decodeSignature(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || !BASE64_RE.test(normalized)) return null;
  return Buffer.from(normalized, 'base64');
}

export function signReleaseManifest(manifestBytes, privateKeyPem) {
  return sign(null, manifestBytes, createPrivateKey(privateKeyPem)).toString('base64');
}

export function verifyReleaseManifestSignature(manifestBytes, signatureText, publicKeyPem) {
  try {
    const signature = decodeSignature(signatureText);
    if (!signature) return false;
    return verify(null, manifestBytes, createPublicKey(publicKeyPem), signature);
  } catch {
    return false;
  }
}
