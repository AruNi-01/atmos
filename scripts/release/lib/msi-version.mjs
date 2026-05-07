/**
 * Derive a Windows MSI-compatible wix version from a SemVer string.
 *
 * Tauri's MSI bundler only accepts `major.minor.patch[.build]` with all
 * numeric segments (build <= 65535). SemVer pre-release tags like
 * `1.1.0-rc.1` fail with `optional pre-release identifier in app version
 * must be numeric-only`.
 *
 * Mapping:
 *   - stable `X.Y.Z`                -> null (no override; MSI uses top-level)
 *   - pre-release `X.Y.Z-...N`      -> `X.Y.Z.N`
 *   - anything else                 -> throws
 *
 * @param {string} version semver version to translate
 * @param {string} [label] optional label used in error messages
 * @returns {string | null} MSI wix version, or null for stable releases
 */
export function computeMsiWixVersion(version, label = "version") {
  const stableMatch = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (stableMatch) {
    return null;
  }

  const preMatch = version.match(
    /^(\d+)\.(\d+)\.(\d+)-(?:[0-9A-Za-z-]+\.)*?(\d+)(?:\+[0-9A-Za-z.-]+)?$/,
  );

  if (!preMatch) {
    throw new Error(
      `Cannot derive MSI wix.version from "${version}" for ${label}. ` +
        `Expected either X.Y.Z or a pre-release ending with a numeric segment, ` +
        `e.g. 1.1.0-rc.1 or 1.1.0-beta.2.`,
    );
  }

  const [, major, minor, patch, build] = preMatch;

  const buildNumber = Number(build);
  if (buildNumber > 65535) {
    throw new Error(
      `MSI build segment ${buildNumber} exceeds 65535 (for ${label}, version "${version}"). ` +
        `Reduce the pre-release counter or change the pre-release format.`,
    );
  }

  return `${major}.${minor}.${patch}.${build}`;
}
