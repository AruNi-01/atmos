/**
 * Preview element selection → Composer chip protocol.
 *
 * Clipboard shape (first line is the protocol marker):
 * ```
 * atmos://preview-element
 * ## Preview element
 * ...
 * ```
 *
 * The body after the first line is the exact AI prompt that must be restored on
 * send. Chips store a short token `[#preview-element:{id}]` plus an in-memory
 * payload registry so multi-line markdown never has to live inside data-token.
 */

export const PREVIEW_ELEMENT_PROTOCOL = "atmos://preview-element";
export const PREVIEW_ELEMENT_TOKEN_PREFIX = "[#preview-element:";
export const PREVIEW_ELEMENT_TOKEN_PATTERN = /\[#preview-element:([a-zA-Z0-9_-]+)\]/g;

const PREVIEW_ELEMENT_PAYLOADS = new Map<string, string>();

/** First-line titles used by formatPreviewSelectionForAI / desktop runtime (en + zh). */
const LEGACY_SINGLE_HEADINGS = new Set([
  "## Preview Element",
  "## Preview element",
  "## 预览元素",
]);

/** Multi-annotation titles from formatPreviewAnnotationsForAI (en + zh). */
const LEGACY_MULTI_HEADINGS = new Set([
  "# Browser Element Annotations",
  "# 浏览器元素标注",
]);

export type ParsedPreviewElementProtocol = {
  promptText: string;
};

export function wrapPreviewElementClipboardText(promptText: string): string {
  const body = normalizeNewlines(promptText).trimEnd();
  if (!body) return body;
  if (body === PREVIEW_ELEMENT_PROTOCOL || body.startsWith(`${PREVIEW_ELEMENT_PROTOCOL}\n`)) {
    return body;
  }
  return `${PREVIEW_ELEMENT_PROTOCOL}\n${body}`;
}

export function parsePreviewElementProtocol(text: string): ParsedPreviewElementProtocol | null {
  const normalized = normalizeNewlines(text);
  const trimmed = normalized.trim();
  if (!trimmed) return null;

  const firstLineEnd = trimmed.indexOf("\n");
  const firstLine = (firstLineEnd === -1 ? trimmed : trimmed.slice(0, firstLineEnd)).trim();
  const rest = firstLineEnd === -1 ? "" : trimmed.slice(firstLineEnd + 1).trimEnd();

  if (firstLine === PREVIEW_ELEMENT_PROTOCOL) {
    if (!rest.trim()) return null;
    return { promptText: rest.trimEnd() };
  }

  if (looksLikePreviewElementPrompt(firstLine, trimmed)) {
    return { promptText: trimmed };
  }

  return null;
}

export function registerPreviewElementPrompt(promptText: string): string {
  const body = normalizeNewlines(promptText).trimEnd();
  const id = createPreviewElementId();
  PREVIEW_ELEMENT_PAYLOADS.set(id, body);
  return formatPreviewElementToken(id);
}

export function resolvePreviewElementPrompt(tokenOrId: string): string | null {
  const id = parsePreviewElementToken(tokenOrId)?.id ?? tokenOrId;
  if (!id) return null;
  return PREVIEW_ELEMENT_PAYLOADS.get(id) ?? null;
}

export function formatPreviewElementToken(id: string): string {
  return `${PREVIEW_ELEMENT_TOKEN_PREFIX}${id}]`;
}

export function parsePreviewElementToken(token: string): { id: string } | null {
  if (!token.startsWith(PREVIEW_ELEMENT_TOKEN_PREFIX) || !token.endsWith("]")) {
    return null;
  }
  const id = token.slice(PREVIEW_ELEMENT_TOKEN_PREFIX.length, -1);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  return { id };
}

export function expandPreviewElementTokens(text: string): string {
  return text.replace(PREVIEW_ELEMENT_TOKEN_PATTERN, (match, id: string) => {
    return PREVIEW_ELEMENT_PAYLOADS.get(id) ?? match;
  });
}

export function previewElementChipLabel(promptText: string): string {
  const selector = promptText.match(/\*\*(?:Selector|选择器)\*\*:\s*`([^`]+)`/);
  if (selector?.[1]?.trim()) {
    return truncateLabel(selector[1].trim(), 28);
  }
  const tag = promptText.match(/\*\*(?:Tag|标签)\*\*:\s*`([^`]+)`/);
  if (tag?.[1]?.trim()) {
    return truncateLabel(tag[1].trim(), 28);
  }
  return "Element";
}

export function previewElementChipTooltip(promptText: string): string {
  const selector = promptText.match(/\*\*(?:Selector|选择器)\*\*:\s*`([^`]+)`/);
  if (selector?.[1]?.trim()) return selector[1].trim();
  const page = promptText.match(/\*\*(?:Page|页面)\*\*:\s*`([^`]+)`/);
  if (page?.[1]?.trim()) return page[1].trim();
  const firstContent = promptText
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));
  return firstContent || "Browser element selection";
}

/** Test-only: clear the in-memory payload registry. */
export function __resetPreviewElementPayloadsForTests(): void {
  PREVIEW_ELEMENT_PAYLOADS.clear();
}

function looksLikePreviewElementPrompt(firstLine: string, fullText: string): boolean {
  if (LEGACY_SINGLE_HEADINGS.has(firstLine)) return true;
  if (LEGACY_MULTI_HEADINGS.has(firstLine)) return true;
  // Single-element body sometimes appears after a blank line; still require a
  // known heading somewhere near the top so we don't chip arbitrary markdown.
  const head = fullText.slice(0, 240);
  for (const heading of LEGACY_SINGLE_HEADINGS) {
    if (head.includes(heading)) return true;
  }
  for (const heading of LEGACY_MULTI_HEADINGS) {
    if (head.includes(heading)) return true;
  }
  return false;
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function createPreviewElementId(): string {
  const globalCrypto = globalThis.crypto;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID().replace(/-/g, "").slice(0, 16);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function truncateLabel(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
