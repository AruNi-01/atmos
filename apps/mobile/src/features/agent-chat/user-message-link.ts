/**
 * Web user text uses `HttpTextLink`: the full URL, a dashed underline, and
 * `decoration-foreground/40`. Trailing punctuation stays outside the link.
 * The hover wash stays off.
 */

const TRAILING_PUNCT_RE = /[),.;:!?]+$/;
const HTTP_URL_RE = /^https?:\/\/[^\s<>"'`\\]+$/i;
const INLINE_HTTP_URL_RE = /https?:\/\/[^\s<>"'`\\]+/gi;

export const USER_LINK_DECORATION_LIGHT = "rgba(9, 9, 11, 0.4)";
export const USER_LINK_DECORATION_DARK = "rgba(250, 250, 250, 0.4)";

export type UserMessageTextSegment = { type: "text"; value: string } | { type: "url"; url: string };

export function userMessageLinkDecoration(isDark: boolean): string {
  return isDark ? USER_LINK_DECORATION_DARK : USER_LINK_DECORATION_LIGHT;
}

export function splitUserMessageHttpUrls(text: string): UserMessageTextSegment[] {
  const segments: UserMessageTextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(new RegExp(INLINE_HTTP_URL_RE.source, "gi"))) {
    const raw = match[0] ?? "";
    const index = match.index ?? 0;
    const stripped = raw.replace(TRAILING_PUNCT_RE, "");
    const url = normalizeUserMessageUrl(stripped);
    if (!url) continue;
    if (index > last) segments.push({ type: "text", value: text.slice(last, index) });
    segments.push({ type: "url", url });
    last = index + stripped.length;
  }
  if (last < text.length) segments.push({ type: "text", value: text.slice(last) });
  if (segments.length === 0 && text) segments.push({ type: "text", value: text });
  return segments;
}

function normalizeUserMessageUrl(value: string): string | null {
  const trimmed = value.trim().replace(TRAILING_PUNCT_RE, "");
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
