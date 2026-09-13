export const LINK_OG_CARD_WIDTH = 400;
export const LINK_OG_CARD_HEIGHT = 268;

export const HTTP_TEXT_LINK_DECORATION_CLASSNAME =
  "break-all text-foreground underline decoration-dashed decoration-foreground/40 underline-offset-4";

export const HTTP_TEXT_LINK_CLASSNAME =
  `cursor-pointer rounded-sm px-0.5 -mx-0.5 ${HTTP_TEXT_LINK_DECORATION_CLASSNAME} hover:bg-muted hover:decoration-foreground`;

export const COMPOSER_HTTP_TEXT_CLASSNAME = `cursor-text ${HTTP_TEXT_LINK_DECORATION_CLASSNAME}`;

export const URL_CHIP_CLASSNAME =
  "inline-flex h-[18px] max-w-[min(100%,16rem)] cursor-pointer select-none items-center gap-1 box-border rounded-full border border-border/70 bg-muted/60 px-1.5 align-top text-[12px] font-medium leading-none text-foreground overflow-hidden mx-[1px]";

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

const URL_DISPLAYS = new Map<string, string>();

function hashDisplayText(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${value.length.toString(36)}:${(hash >>> 0).toString(36)}`;
}

export function expandUrlTokens(text: string): string {
  URL_TOKEN_PATTERN.lastIndex = 0;
  if (!URL_TOKEN_PATTERN.test(text)) return text;
  URL_TOKEN_PATTERN.lastIndex = 0;
  const expanded = text.replace(URL_TOKEN_PATTERN, (match, encoded: string) => {
    try {
      return normalizeHttpUrl(decodeURIComponent(encoded)) ?? match;
    } catch {
      return match;
    }
  });
  if (expanded !== text) {
    URL_DISPLAYS.set(hashDisplayText(expanded), text);
    const trimmed = expanded.trim();
    if (trimmed !== expanded) {
      URL_DISPLAYS.set(hashDisplayText(trimmed), text.trim());
    }
  }
  return expanded;
}

export function displayTextWithUrlTokens(expandedText: string): string {
  return URL_DISPLAYS.get(hashDisplayText(expandedText)) ?? expandedText;
}

export type UrlDisplaySegment =
  | { type: "text"; value: string }
  | { type: "url-chip"; url: string };

export function splitTextWithUrlTokens(text: string): UrlDisplaySegment[] {
  const segments: UrlDisplaySegment[] = [];
  const pattern = new RegExp(URL_TOKEN_SOURCE, "g");
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const token = match[0] ?? "";
    const index = match.index ?? 0;
    if (index > last) {
      segments.push({ type: "text", value: text.slice(last, index) });
    }
    const url = parseUrlToken(token);
    if (url) {
      segments.push({ type: "url-chip", url });
    } else {
      segments.push({ type: "text", value: token });
    }
    last = index + token.length;
  }
  if (last < text.length) {
    segments.push({ type: "text", value: text.slice(last) });
  }
  if (segments.length === 0 && text) {
    segments.push({ type: "text", value: text });
  }
  return segments;
}

export function isCompletePreviewUrl(value: string | null | undefined): boolean {
  if (!value || value === "streamdown:incomplete-link") return false;
  const url = normalizeHttpUrl(value);
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    if (!host) return false;
    if (host === "localhost" || host.endsWith(".localhost")) return true;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return true;
    return host.includes(".");
  } catch {
    return false;
  }
}

export function __resetUrlDisplaysForTests(): void {
  URL_DISPLAYS.clear();
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
  if (icon && favicon && icon.src !== favicon) {
    const current = icon.src;
    const probe = new Image();
    probe.referrerPolicy = "no-referrer";
    probe.onload = () => {
      if (icon.src === current || icon.src === favicon) icon.src = favicon;
    };
    probe.src = favicon;
  }
  const title = (preview.title || hostnameFromUrl(preview.url)).trim();
  if (label && title && label.textContent !== title) label.textContent = title;
  chip.dataset.tooltip = preview.url;
}

function stripTrailingUrlPunct(value: string): string {
  return value.replace(TRAILING_PUNCT_RE, "");
}
