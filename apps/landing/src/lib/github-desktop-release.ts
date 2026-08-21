export const GITHUB_REPO_PATH = "/AruNi-01/atmos";
export const GITHUB_REPO_URL = `https://github.com${GITHUB_REPO_PATH}`;
export const GITHUB_RELEASES_URL = `https://github.com${GITHUB_REPO_PATH}/releases`;
export const GITHUB_RELEASES_ATOM_URL = `https://github.com${GITHUB_REPO_PATH}/releases.atom`;

/** Production Electron desktop tag prefix. */
export const DESKTOP_RELEASE_TAG_PREFIX = "desktop-electron-";
/** Legacy Tauri desktop tag prefix (emergency rebuilds only). */
export const DESKTOP_TAURI_RELEASE_TAG_PREFIX = "desktop-";

const DESKTOP_ELECTRON_STABLE_TAG_RE = /^desktop-electron-\d{4}\.\d{1,2}\.\d{1,2}$/;
const DESKTOP_TAURI_STABLE_TAG_RE = /^desktop-\d{4}\.\d{1,2}\.\d{1,2}$/;

const DESKTOP_ELECTRON_RELEASE_TAG_RE =
  /^desktop-electron-\d{4}\.\d{1,2}\.\d{1,2}(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/;
const DESKTOP_TAURI_RELEASE_TAG_RE =
  /^desktop-\d{4}\.\d{1,2}\.\d{1,2}(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/;

const GITHUB_RELEASES_API_URL = `https://api.github.com/repos${GITHUB_REPO_PATH}/releases?per_page=100`;

export type GitHubReleaseAsset = {
  name: string;
  browser_download_url: string;
};

export type GitHubRelease = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  assets: GitHubReleaseAsset[];
};

const createGithubHeaders = (): HeadersInit => {
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "User-Agent": "atmos-landing",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
};

const isPublishedDesktopRelease = (release: GitHubRelease): boolean =>
  !release.draft && !release.prerelease && Boolean(release.published_at);

const isElectronDesktopRelease = (release: GitHubRelease): boolean =>
  isPublishedDesktopRelease(release) && DESKTOP_ELECTRON_RELEASE_TAG_RE.test(release.tag_name);

const isLegacyTauriDesktopRelease = (release: GitHubRelease): boolean =>
  isPublishedDesktopRelease(release) &&
  DESKTOP_TAURI_RELEASE_TAG_RE.test(release.tag_name) &&
  !release.tag_name.startsWith("desktop-electron-");

const byNewest = (a: GitHubRelease, b: GitHubRelease): number =>
  new Date(b.published_at ?? 0).getTime() - new Date(a.published_at ?? 0).getTime();

/** Calendar version segment from a desktop release tag (no prefix). */
export function desktopTagVersion(tag: string): string {
  if (tag.startsWith(DESKTOP_RELEASE_TAG_PREFIX)) {
    return tag.slice(DESKTOP_RELEASE_TAG_PREFIX.length);
  }
  if (tag.startsWith(DESKTOP_TAURI_RELEASE_TAG_PREFIX)) {
    return tag.slice(DESKTOP_TAURI_RELEASE_TAG_PREFIX.length);
  }
  return tag;
}

/**
 * Resolve the latest stable desktop release tag.
 * Prefers GitHub API (when not rate-limited / token present), then Atom feed.
 * Stable only: no draft/prerelease and no `-beta` / `-rc` suffix.
 */
export async function fetchLatestStableDesktopTag(): Promise<string | null> {
  try {
    const release = await fetchLatestDesktopRelease();
    if (release?.tag_name) {
      const tag = release.tag_name;
      if (DESKTOP_ELECTRON_STABLE_TAG_RE.test(tag) || DESKTOP_TAURI_STABLE_TAG_RE.test(tag)) {
        return tag;
      }
    }
  } catch {
    // Fall through to Atom.
  }

  return fetchLatestStableDesktopTagFromAtom();
}

async function fetchLatestStableDesktopTagFromAtom(): Promise<string | null> {
  try {
    const res = await fetch(GITHUB_RELEASES_ATOM_URL, {
      next: { revalidate: 3600 },
      headers: { "User-Agent": "atmos-landing", Accept: "application/atom+xml" },
    });

    if (!res.ok) {
      return null;
    }

    const xml = await res.text();
    // Atom entry order is newest-first. Prefer production Electron, then legacy Tauri.
    const tags = Array.from(xml.matchAll(/desktop-electron-[0-9A-Za-z.-]+|desktop-[0-9A-Za-z.-]+/g)).map(
      (match) => match[0],
    );

    const electron = tags.find((tag) => DESKTOP_ELECTRON_STABLE_TAG_RE.test(tag));
    if (electron) {
      return electron;
    }

    return tags.find((tag) => DESKTOP_TAURI_STABLE_TAG_RE.test(tag)) ?? null;
  } catch {
    return null;
  }
}

export async function fetchLatestDesktopRelease(): Promise<GitHubRelease | null> {
  const res = await fetch(GITHUB_RELEASES_API_URL, {
    next: { revalidate: 3600 },
    headers: createGithubHeaders(),
  });

  if (!res.ok) {
    return null;
  }

  const releases = (await res.json()) as GitHubRelease[];

  const electron = releases.filter(isElectronDesktopRelease).sort(byNewest)[0] ?? null;
  if (electron) {
    return electron;
  }

  return releases.filter(isLegacyTauriDesktopRelease).sort(byNewest)[0] ?? null;
}
