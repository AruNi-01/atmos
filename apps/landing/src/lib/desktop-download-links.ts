import {
  desktopTagVersion,
  fetchLatestStableDesktopTag,
  GITHUB_RELEASES_URL,
} from "@/lib/github-desktop-release";

/**
 * Public R2 mirror (Cloudflare custom domain).
 * sync-r2.yml publishes stable desktop installers under desktop/latest/.
 *
 * Naming (Electron production channel):
 * - Unversioned (mac shell installer path): Atmos_aarch64.zip, Atmos_x64.zip
 * - Versioned installers: Atmos_<version>_<arch>.dmg|.zip|.AppImage,
 *   Atmos_<version>_x64-setup.exe
 *
 * Platform download buttons must point at these direct files — only the
 * explicit "View GitHub Releases" menu item goes to the releases page.
 */
export const R2_DESKTOP_LATEST = "https://install.atmos.land/desktop/latest";

export type DownloadLinks = {
  macAppleSilicon: string;
  macIntel: string;
  windows: string;
  linux: string;
  /** Latest stable desktop tag when resolved (e.g. desktop-electron-2026.7.29). */
  tag: string | null;
  /** Calendar version when resolved (e.g. 2026.7.29). */
  version: string | null;
  /** Only for the explicit "View on GitHub" entry. */
  githubReleases: string;
};

/** R2 links that do not require a calendar version (mac zip always mirrored). */
export function createUnversionedR2Links(): Pick<DownloadLinks, "macAppleSilicon" | "macIntel"> {
  return {
    macAppleSilicon: `${R2_DESKTOP_LATEST}/Atmos_aarch64.zip`,
    macIntel: `${R2_DESKTOP_LATEST}/Atmos_x64.zip`,
  };
}

/** Preferred direct download URLs under desktop/latest/ for a known stable version. */
export function createVersionedR2DownloadLinks(
  version: string,
  tag: string | null = null,
): DownloadLinks {
  return {
    macAppleSilicon: `${R2_DESKTOP_LATEST}/Atmos_${version}_aarch64.dmg`,
    macIntel: `${R2_DESKTOP_LATEST}/Atmos_${version}_x64.dmg`,
    windows: `${R2_DESKTOP_LATEST}/Atmos_${version}_x64-setup.exe`,
    linux: `${R2_DESKTOP_LATEST}/Atmos_${version}_x64.AppImage`,
    tag,
    version,
    githubReleases: GITHUB_RELEASES_URL,
  };
}

/**
 * Resolve latest stable desktop download links from install.atmos.land (R2).
 * Version comes from GitHub API when available, otherwise releases.atom (no rate limit).
 */
export async function resolveDesktopDownloadLinks(): Promise<DownloadLinks> {
  const unversioned = createUnversionedR2Links();
  const githubReleases = GITHUB_RELEASES_URL;

  try {
    const tag = await fetchLatestStableDesktopTag();
    if (!tag) {
      return {
        ...unversioned,
        // Win/Linux installers are versioned on R2; without a tag we cannot invent a filename.
        windows: githubReleases,
        linux: githubReleases,
        tag: null,
        version: null,
        githubReleases,
      };
    }

    const version = desktopTagVersion(tag);
    return createVersionedR2DownloadLinks(version, tag);
  } catch {
    return {
      ...unversioned,
      windows: githubReleases,
      linux: githubReleases,
      tag: null,
      version: null,
      githubReleases,
    };
  }
}
