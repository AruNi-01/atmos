import { calendarVersionToMsiVersion } from "./calendar-version.mjs";

function validateMsiSegments(segments, label, version) {
  const [major, minor, build, revision] = segments.map(Number);

  if (major > 255) {
    throw new Error(
      `MSI major segment ${major} exceeds 255 (for ${label}, version "${version}").`,
    );
  }

  if (minor > 255) {
    throw new Error(
      `MSI minor segment ${minor} exceeds 255 (for ${label}, version "${version}").`,
    );
  }

  if (build > 65535) {
    throw new Error(
      `MSI build segment ${build} exceeds 65535 (for ${label}, version "${version}").`,
    );
  }

  if (revision !== undefined && revision > 65535) {
    throw new Error(
      `MSI revision segment ${revision} exceeds 65535 (for ${label}, version "${version}").`,
    );
  }
}

/**
 * Derive a Windows MSI-compatible wix version from an app version string.
 *
 * Tauri's MSI bundler only accepts `major.minor.patch[.build]` with all
 * numeric segments. Windows Installer ProductVersion also limits the first
 * segment to 255, so calendar versions use a YY.M.D MSI override.
 *
 * Mapping:
 *   - stable calendar `2026.7.2`    -> `26.7.2`
 *   - prerelease calendar `2026.7.2-rc.1` -> `26.7.2.1`
 *   - stable non-calendar `X.Y.Z`   -> null (no override; MSI uses top-level)
 *   - pre-release `X.Y.Z-...N`      -> `X.Y.Z.N`
 *   - anything else                 -> throws
 *
 * @param {string} version app version to translate
 * @param {string} [label] optional label used in error messages
 * @returns {string | null} MSI wix version, or null for stable releases
 */
export function computeMsiWixVersion(version, label = "version") {
  const normalized = String(version || "").trim();

  if (/^\d{4}\./.test(normalized)) {
    return calendarVersionToMsiVersion(normalized, label);
  }

  const stableMatch = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (stableMatch) {
    validateMsiSegments(stableMatch.slice(1), label, version);
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
  validateMsiSegments([major, minor, patch, build], label, version);

  return `${major}.${minor}.${patch}.${build}`;
}
