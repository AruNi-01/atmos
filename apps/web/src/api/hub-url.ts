/** Production Hub origin. Same default as mobile and desktop static export. */
export const DEFAULT_WEB_HUB_URL = "https://hub.atmos.land";

/** `off` disables Hub. Unset falls back to production Hub (not an empty URL). */
export function resolveWebHubUrl(
  nextPublicHubUrl = process.env.NEXT_PUBLIC_ATMOS_HUB_URL,
  atmosHubUrl = process.env.ATMOS_HUB_URL,
): string {
  const raw = nextPublicHubUrl?.trim() || atmosHubUrl?.trim() || "";
  if (raw.toLowerCase() === "off") return "";
  return raw || DEFAULT_WEB_HUB_URL;
}
