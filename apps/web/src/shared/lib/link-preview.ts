export const LINK_OG_CARD_WIDTH = 400;
export const LINK_OG_CARD_HEIGHT = 268;

export const URL_TOKEN_PREFIX = "[#url:";
export const URL_TOKEN_SOURCE = String.raw`\[#url:[^\]]+\]`;
export const URL_TOKEN_PATTERN = /\[#url:([^\]]+)\]/g;

const HTTP_URL_RE = /^https?:\/\/[^\s<>"'`\\]+$/i;
const INLINE_HTTP_URL_RE = /https?:\/\/[^\s<>"'`\\]+/gi;
const TRAILING_PUNCT_RE = /[),.;:!?]+$/;

export type LinkPreviewPayload = {
  url: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  favicon_url: string | null;
  site_name: string | null;
};

export type TextOrUrlSegment =
  | { type: "text"; value: string }
  | { type: "url"; url: string };

export function isHttpUrl(value: string | null | undefined): boolean {
  return Boolean(normalizeHttpUrl(value));
}

export function normalizeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = stripTrailingUrlPunct(value.trim());
  if (!HTTP_URL_RE.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function parsePastedHttpUrl(text: string): string | null {
  const trimmed = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!trimmed || trimmed.includes("\n")) return null;
  return normalizeHttpUrl(trimmed);
}

export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "") || url;
  } catch {
    return url;
  }
}

export function googleFaviconUrl(url: string, size = 32): string {
  const host = hostnameFromUrl(url);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
}

export function localLinkPreviewFallback(url: string): LinkPreviewPayload {
  const normalized = normalizeHttpUrl(url) ?? url;
  const host = hostnameFromUrl(normalized);
  return {
    url: normalized,
    title: host,
    description: null,
    image_url: null,
    favicon_url: googleFaviconUrl(normalized),
    site_name: host,
  };
}

export function formatUrlToken(url: string): string {
  return `${URL_TOKEN_PREFIX}${encodeURIComponent(url)}]`;
}

export function parseUrlToken(token: string): string | null {
  if (!token.startsWith(URL_TOKEN_PREFIX) || !token.endsWith("]")) return null;
  const encoded = token.slice(URL_TOKEN_PREFIX.length, -1);
  if (!encoded) return null;
  try {
    return normalizeHttpUrl(decodeURIComponent(encoded));
  } catch {
    return null;
  }
}

export function expandUrlTokens(text: string): string {
  URL_TOKEN_PATTERN.lastIndex = 0;
  if (!URL_TOKEN_PATTERN.test(text)) return text;
  URL_TOKEN_PATTERN.lastIndex = 0;
  return text.replace(URL_TOKEN_PATTERN, (match, encoded: string) => {
    try {
      return normalizeHttpUrl(decodeURIComponent(encoded)) ?? match;
    } catch {
      return match;
    }
  });
}

export function splitTextWithHttpUrls(text: string): TextOrUrlSegment[] {
  const segments: TextOrUrlSegment[] = [];
  INLINE_HTTP_URL_RE.lastIndex = 0;
  let last = 0;
  for (const match of text.matchAll(new RegExp(INLINE_HTTP_URL_RE.source, "gi"))) {
    const raw = match[0] ?? "";
    const index = match.index ?? 0;
    const stripped = stripTrailingUrlPunct(raw);
    const url = normalizeHttpUrl(stripped);
    if (!url) continue;
    if (index > last) {
      segments.push({ type: "text", value: text.slice(last, index) });
    }
    segments.push({ type: "url", url });
    last = index + stripped.length;
  }
  if (last < text.length) {
    segments.push({ type: "text", value: text.slice(last) });
  }
  if (segments.length === 0 && text) {
    segments.push({ type: "text", value: text });
  }
  return segments;
}

export function applyLinkPreviewToChip(chip: HTMLElement, preview: LinkPreviewPayload): void {
  const icon = chip.querySelector("[data-url-chip-icon]") as HTMLImageElement | null;
  const label = chip.querySelector("[data-url-chip-label]") as HTMLElement | null;
  const favicon = preview.favicon_url || googleFaviconUrl(preview.url);
  if (icon && icon.src !== favicon) icon.src = favicon;
  const title = (preview.title || hostnameFromUrl(preview.url)).trim();
  if (label && title && label.textContent !== title) label.textContent = title;
  chip.dataset.tooltip = preview.url;
}

function stripTrailingUrlPunct(value: string): string {
  return value.replace(TRAILING_PUNCT_RE, "");
}
