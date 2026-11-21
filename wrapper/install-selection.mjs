const BUNDLE_VERSION_RE = /^RapidRAW_(\d+(?:\.\d+){1,3})_(?:x64|x86|aarch64)(?:_[A-Za-z-]+)?(?:-setup)?\.(?:msi|exe)$/i;

export function parseBundleVersion(fileName) {
  return BUNDLE_VERSION_RE.exec(fileName)?.[1] ?? null;
}

export function compareVersions(left, right) {
  const lhs = left.split('.').map(Number);
  const rhs = right.split('.').map(Number);
  const length = Math.max(lhs.length, rhs.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (lhs[index] ?? 0) - (rhs[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function shouldAllowInstall(installedVersion, bundleVersion) {
  const normalizedInstalledVersion = installedVersion?.trim().toLowerCase();
  if (!normalizedInstalledVersion || normalizedInstalledVersion === 'unknown' || normalizedInstalledVersion === 'unbekannt' || !bundleVersion) {
    return true;
  }
  return compareVersions(bundleVersion, normalizedInstalledVersion) >= 0;
}

function bundleFileName(bundle) {
  return bundle.path ?? bundle.file ?? '';
}

export function selectBundle(bundles, installedChannel = null) {
  const channelBundles = installedChannel
    ? bundles.filter((bundle) => bundle.kind === installedChannel)
    : bundles;
  if (!channelBundles.length) return null;

  const pool = channelBundles.filter((bundle) => parseBundleVersion(bundleFileName(bundle).split(/[\\/]/).at(-1)));
  if (!pool.length) return null;

  return pool.reduce((newest, candidate) => {
    if (!newest) return candidate;
    const newestVersion = parseBundleVersion(bundleFileName(newest).split(/[\\/]/).at(-1));
    const candidateVersion = parseBundleVersion(bundleFileName(candidate).split(/[\\/]/).at(-1));
    if (compareVersions(candidateVersion, newestVersion) > 0) return candidate;
    return newest;
  }, null);
}
