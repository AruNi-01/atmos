const DEFAULT_ASSETS_BASE_URL = "https://assets.atmos.land";

const isPagesBuild =
  process.env.NEXT_PUBLIC_BUILD_TARGET === "pages" ||
  process.env.BUILD_TARGET === "pages";

function normalizeFilename(filename: string): string {
  return filename
    .replace(/^\/+/, "")
    .replace(/^landing\/videos\//, "")
    .replace(/^videos\//, "");
}

/** Public asset host for landing demo videos/posters (R2 in production). */
export function resolveLandingAssetsBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_ASSETS_BASE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  if (isPagesBuild) {
    return DEFAULT_ASSETS_BASE_URL;
  }
  return "";
}

/** Resolve a landing demo video URL under `landing/videos/` on the assets host. */
export function landingVideoUrl(filename: string): string {
  const name = normalizeFilename(filename);
  const base = resolveLandingAssetsBaseUrl();
  if (!base) {
    return `/videos/${name}`;
  }
  return `${base}/landing/videos/${name}`;
}

/** Resolve a landing demo poster URL (same prefix as videos on R2). */
export function landingPosterUrl(filename: string): string {
  return landingVideoUrl(filename);
}
