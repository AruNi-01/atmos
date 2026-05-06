export const GITHUB_REPO_PATH = "/AruNi-01/atmos";
export const GITHUB_RELEASES_URL = `https://github.com${GITHUB_REPO_PATH}/releases`;
export const DESKTOP_RELEASE_TAG_PREFIX = "desktop-v";

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
  release.tag_name.startsWith(DESKTOP_RELEASE_TAG_PREFIX) && !release.draft && !release.prerelease && Boolean(release.published_at);

export async function fetchLatestDesktopRelease(): Promise<GitHubRelease | null> {
  const res = await fetch(GITHUB_RELEASES_API_URL, {
    next: { revalidate: 3600 },
    headers: createGithubHeaders(),
  });

  if (!res.ok) {
    return null;
  }

  const releases = (await res.json()) as GitHubRelease[];

  return releases
    .filter(isPublishedDesktopRelease)
    .sort((a, b) => new Date(b.published_at ?? 0).getTime() - new Date(a.published_at ?? 0).getTime())[0] ?? null;
}
