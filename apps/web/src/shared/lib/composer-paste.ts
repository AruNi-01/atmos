import { displayTextWithUrlTokens } from "@/shared/lib/link-preview";

/**
 * Large plain-text paste → Composer chip protocol.
 *
 * Pastes over {@link PASTE_LINE_THRESHOLD} lines serialize as `[#paste:{id}]`.
 * The body lives in an in-memory (sessionStorage-backed) registry so the
 * contenteditable editor never has to layout the full paste. On send, tokens
 * expand back to the exact body. If the composer still held chips at send
 * time, the expanded user message can be rendered back as chips.
 */

export const PASTE_LINE_THRESHOLD = 10;
export const USER_MESSAGE_COLLAPSE_LINES = 3;
/** Extra visual line used for the collapsed fade (line 4). */
export const USER_MESSAGE_COLLAPSE_FADE_LINES = 1;
export const PASTE_PREVIEW_HEAD_LINES = 3;
export const PASTE_PREVIEW_TAIL_LINES = 3;
export const PASTE_TOKEN_PREFIX = "[#paste:";
export const PASTE_TOKEN_SOURCE = String.raw`\[#paste:[a-zA-Z0-9_-]+\]`;
export const PASTE_TOKEN_PATTERN = /\[#paste:([a-zA-Z0-9_-]+)\]/g;

export type ComposerPastePayload = {
  text: string;
  lineCount: number;
};

export type ComposerPastePreview = {
  head: string[];
  more: number;
  tail: string[];
};

export type ComposerDisplaySegment =
  | { type: "text"; value: string }
  | { type: "paste"; token: string; text: string; lineCount: number };

type StoredPayload = ComposerPastePayload & { seq: number };

const STORAGE_KEY = "atmos:composer-paste:v1";
const MAX_ENTRIES = 64;

const PAYLOADS = new Map<string, StoredPayload>();
/** expanded message text hash → composer text that still contains paste tokens */
const DISPLAYS = new Map<string, string>();
let seq = 0;
let hydrated = false;

export function normalizePasteNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function splitPasteLines(text: string): string[] {
  const normalized = normalizePasteNewlines(text);
  if (normalized.length === 0) return [];
  const trimmed = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  return trimmed.split("\n");
}

export function countPasteLines(text: string): number {
  return splitPasteLines(text).length;
}

export function shouldChipPlainPaste(text: string): boolean {
  return countPasteLines(text) > PASTE_LINE_THRESHOLD;
}

export function buildPastePreview(
  text: string,
  headLines = PASTE_PREVIEW_HEAD_LINES,
  tailLines = PASTE_PREVIEW_TAIL_LINES,
): ComposerPastePreview {
  const lines = splitPasteLines(text);
  if (lines.length <= headLines + tailLines) {
    return { head: lines, more: 0, tail: [] };
  }
  return {
    head: lines.slice(0, headLines),
    more: lines.length - headLines - tailLines,
    tail: lines.slice(-tailLines),
  };
}

export function formatPasteToken(id: string): string {
  return `${PASTE_TOKEN_PREFIX}${id}]`;
}

export function parsePasteToken(token: string): string | null {
  if (!token.startsWith(PASTE_TOKEN_PREFIX) || !token.endsWith("]")) return null;
  const id = token.slice(PASTE_TOKEN_PREFIX.length, -1);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  return id;
}

export function registerComposerPaste(text: string): string {
  hydrate();
  const body = normalizePasteNewlines(text);
  const id = createOpaqueId();
  const lineCount = countPasteLines(body);
  seq += 1;
  PAYLOADS.set(id, { text: body, lineCount, seq });
  evictOldest();
  persist();
  return formatPasteToken(id);
}

export function resolveComposerPaste(tokenOrId: string): ComposerPastePayload | null {
  hydrate();
  const id = parsePasteToken(tokenOrId) ?? tokenOrId;
  const stored = PAYLOADS.get(id);
  if (!stored) return null;
  return { text: stored.text, lineCount: stored.lineCount };
}

export function expandPasteTokens(text: string): string {
  hydrate();
  PASTE_TOKEN_PATTERN.lastIndex = 0;
  if (!PASTE_TOKEN_PATTERN.test(text)) return text;
  PASTE_TOKEN_PATTERN.lastIndex = 0;
  const expanded = text.replace(PASTE_TOKEN_PATTERN, (match, id: string) => {
    return PAYLOADS.get(id)?.text ?? match;
  });
  if (expanded !== text) {
    rememberPasteDisplay(expanded, text);
  }
  return expanded;
}

export function displayTextForSentMessage(expandedText: string): string {
  hydrate();
  const withUrls = displayTextWithUrlTokens(expandedText);
  return DISPLAYS.get(hashText(withUrls)) ?? DISPLAYS.get(hashText(expandedText)) ?? withUrls;
}

export function sentMessageHasPasteChips(expandedText: string): boolean {
  hydrate();
  const display = displayTextForSentMessage(expandedText);
  PASTE_TOKEN_PATTERN.lastIndex = 0;
  return PASTE_TOKEN_PATTERN.test(display);
}

export function splitComposerDisplaySegments(displayText: string): ComposerDisplaySegment[] {
  hydrate();
  const segments: ComposerDisplaySegment[] = [];
  PASTE_TOKEN_PATTERN.lastIndex = 0;
  let last = 0;
  const matches = displayText.matchAll(new RegExp(PASTE_TOKEN_PATTERN.source, "g"));
  for (const match of matches) {
    const index = match.index ?? 0;
    if (index > last) {
      segments.push({ type: "text", value: displayText.slice(last, index) });
    }
    const token = match[0];
    const payload = resolveComposerPaste(token);
    if (payload) {
      segments.push({
        type: "paste",
        token,
        text: payload.text,
        lineCount: payload.lineCount,
      });
    } else {
      segments.push({ type: "text", value: token });
    }
    last = index + token.length;
  }
  if (last < displayText.length) {
    segments.push({ type: "text", value: displayText.slice(last) });
  }
  if (segments.length === 0 && displayText) {
    segments.push({ type: "text", value: displayText });
  }
  return segments;
}

export function userMessageNeedsCollapse(expandedText: string): boolean {
  if (sentMessageHasPasteChips(expandedText)) return false;
  return countPasteLines(expandedText) > USER_MESSAGE_COLLAPSE_LINES;
}

export function collapsedUserMessageText(expandedText: string): string {
  const lines = splitPasteLines(expandedText);
  if (lines.length <= USER_MESSAGE_COLLAPSE_LINES) return expandedText;
  return lines.slice(0, USER_MESSAGE_COLLAPSE_LINES).join("\n");
}

/** Test-only: clear the in-memory + session registries. */
export function __resetComposerPasteForTests(): void {
  PAYLOADS.clear();
  DISPLAYS.clear();
  seq = 0;
  hydrated = true;
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function rememberPasteDisplay(expandedText: string, composerText: string): void {
  DISPLAYS.set(hashText(expandedText), composerText);
  const trimmed = expandedText.trim();
  if (trimmed !== expandedText) {
    DISPLAYS.set(hashText(trimmed), composerText.trim());
  }
  persist();
}

function evictOldest(): void {
  if (PAYLOADS.size <= MAX_ENTRIES) return;
  const ordered = [...PAYLOADS.entries()].sort((a, b) => a[1].seq - b[1].seq);
  const remove = PAYLOADS.size - MAX_ENTRIES;
  for (let i = 0; i < remove; i += 1) {
    const id = ordered[i]?.[0];
    if (!id) continue;
    PAYLOADS.delete(id);
    const token = formatPasteToken(id);
    for (const [hash, composerText] of DISPLAYS) {
      if (composerText.includes(token)) DISPLAYS.delete(hash);
    }
  }
}

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  if (typeof sessionStorage === "undefined") return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      payloads?: Record<string, { text?: string; lineCount?: number; seq?: number }>;
      displays?: Record<string, string>;
      seq?: number;
    };
    if (parsed.payloads) {
      for (const [id, value] of Object.entries(parsed.payloads)) {
        if (!value?.text) continue;
        PAYLOADS.set(id, {
          text: value.text,
          lineCount: value.lineCount ?? countPasteLines(value.text),
          seq: value.seq ?? 0,
        });
      }
    }
    if (parsed.displays) {
      for (const [hash, composerText] of Object.entries(parsed.displays)) {
        if (composerText) DISPLAYS.set(hash, composerText);
      }
    }
    seq = typeof parsed.seq === "number" ? parsed.seq : seq;
  } catch {
    // ignore corrupt storage
  }
}

function persist(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const payloads: Record<string, { text: string; lineCount: number; seq: number }> = {};
    for (const [id, payload] of PAYLOADS) {
      payloads[id] = payload;
    }
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        payloads,
        displays: Object.fromEntries(DISPLAYS),
        seq,
      }),
    );
  } catch {
    // quota / private mode
  }
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${value.length.toString(36)}:${(hash >>> 0).toString(36)}`;
}

function createOpaqueId(): string {
  const globalCrypto = globalThis.crypto;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID().replace(/-/g, "").slice(0, 16);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
