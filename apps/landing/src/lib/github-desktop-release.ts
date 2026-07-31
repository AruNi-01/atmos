export const GITHUB_REPO_PATH = "/AruNi-01/atmos";
export const GITHUB_RELEASES_URL = `https://github.com${GITHUB_REPO_PATH}/releases`;

/** Production Electron desktop tag prefix. */
export const DESKTOP_RELEASE_TAG_PREFIX = "desktop-electron-";
/** Legacy Tauri desktop tag prefix (emergency rebuilds only). */
export const DESKTOP_TAURI_RELEASE_TAG_PREFIX = "desktop-";

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
