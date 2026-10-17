import { copy, fillTemplate } from "./copy";

/** Plain-text insertions longer than this become a removable paste chip. */
export const PASTE_LINE_THRESHOLD = 10;

export type ComposerPasteChip = {
  id: string;
  body: string;
  lineCount: number;
};

export type ComposerPasteApply = {
  draft: string;
  chip: ComposerPasteChip | null;
};

export function pasteToken(id: string): string {
  return `[#paste:${id}]`;
}

export function pasteChipLabel(lineCount: number): string {
  return fillTemplate(copy.pasteChip, { count: lineCount });
}

/**
 * Web paste chip: `h-5`, `gap-1`, `rounded-full`, `px-1.5`, `text-[12px]`
 * `font-medium`, `border-border/70`, `bg-muted/60`. The glyph is 12px.
 */
export const PASTE_CHIP_HEIGHT = 20;
export const PASTE_CHIP_FONT = 12;
export const PASTE_CHIP_PAD_X = 6;
export const PASTE_CHIP_GAP = 4;
export const PASTE_CHIP_ICON = 12;
export const PASTE_CHIP_FILL_LIGHT = "rgba(222, 222, 224, 0.6)";
export const PASTE_CHIP_FILL_DARK = "rgba(39, 39, 42, 0.6)";
export const PASTE_CHIP_BORDER_LIGHT = "rgba(0, 0, 0, 0.07)";
export const PASTE_CHIP_BORDER_DARK = "rgba(255, 255, 255, 0.07)";

export function pasteChipFill(isDark: boolean): string {
  return isDark ? PASTE_CHIP_FILL_DARK : PASTE_CHIP_FILL_LIGHT;
}

export function pasteChipBorder(isDark: boolean): string {
  return isDark ? PASTE_CHIP_BORDER_DARK : PASTE_CHIP_BORDER_LIGHT;
}

export type SentPasteSegment =
  | { type: "text"; value: string }
  | { type: "paste"; token: string; text: string; lineCount: number };

type SentPasteRecord = {
  composerText: string;
  chips: ComposerPasteChip[];
};

const SENT_PASTE = new Map<string, SentPasteRecord>();
const SENT_PASTE_LIMIT = 64;

/** Drops the in-memory map. Tests call this so one case cannot see another. */
export function resetSentPasteForTests(): void {
  SENT_PASTE.clear();
}

/**
 * Web remembers the composer form when a send expands paste tokens, so the
 * same session can draw the chip again. The phone keeps that map for the
 * process. A message from another device has no entry and stays full text.
 */
export function rememberSentPaste(
  expanded: string,
  composerText: string,
  chips: readonly ComposerPasteChip[],
): void {
  if (chips.length === 0 || expanded === composerText || !composerText.includes("[#paste:")) {
    return;
  }
  const record: SentPasteRecord = {
    composerText,
    chips: chips.map((chip) => ({ ...chip })),
  };
  storeSentPaste(hashText(expanded), record);
  const trimmed = expanded.trim();
  if (trimmed !== expanded) {
    storeSentPaste(hashText(trimmed), {
      composerText: composerText.trim(),
      chips: record.chips,
    });
  }
}

export function sentPasteDisplay(expanded: string): {
  composerText: string;
  segments: SentPasteSegment[];
} | null {
  const record = SENT_PASTE.get(hashText(expanded)) ?? SENT_PASTE.get(hashText(expanded.trim()));
  if (!record) return null;
  const segments = sentPasteSegments(record.composerText, record.chips);
  if (!segments.some((segment) => segment.type === "paste")) return null;
  return { composerText: record.composerText, segments };
}

export function sentPasteSegments(
  composerText: string,
  chips: readonly ComposerPasteChip[],
): SentPasteSegment[] {
  const byId = new Map(chips.map((chip) => [chip.id, chip]));
  const segments: SentPasteSegment[] = [];
  const pattern = /\[#paste:([a-zA-Z0-9_-]+)\]/g;
  let last = 0;
  for (const match of composerText.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ type: "text", value: composerText.slice(last, index) });
    const token = match[0];
    const chip = byId.get(match[1] ?? "");
    if (chip) {
      segments.push({ type: "paste", token, text: chip.body, lineCount: chip.lineCount });
    } else {
      segments.push({ type: "text", value: token });
    }
    last = index + token.length;
  }
  if (last < composerText.length) {
    segments.push({ type: "text", value: composerText.slice(last) });
  }
  return segments;
}

function storeSentPaste(key: string, record: SentPasteRecord): void {
  if (SENT_PASTE.has(key)) SENT_PASTE.delete(key);
  SENT_PASTE.set(key, record);
  while (SENT_PASTE.size > SENT_PASTE_LIMIT) {
    const oldest = SENT_PASTE.keys().next().value;
    if (oldest == null) return;
    SENT_PASTE.delete(oldest);
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

/**
 * When one text change inserts more than {@link PASTE_LINE_THRESHOLD} lines,
 * the inserted body moves onto a chip and the draft keeps `[#paste:<id>]`.
 */
export function applyComposerPaste(previous: string, next: string): ComposerPasteApply {
  if (previous === next) return { draft: next, chip: null };
  const inserted = insertedSpan(previous, next);
  const lineCount = countPasteLines(inserted.text);
  if (lineCount <= PASTE_LINE_THRESHOLD) return { draft: next, chip: null };
  const id = createPasteId();
  const draft = `${next.slice(0, inserted.start)}${pasteToken(id)}${next.slice(inserted.end)}`;
  return { draft, chip: { id, body: inserted.text, lineCount } };
}

/** Puts chip bodies back in place of their tokens before send, queue, or steer. */
export function expandComposerPaste(draft: string, chips: readonly ComposerPasteChip[]): string {
  if (chips.length === 0 || !draft.includes("[#paste:")) return draft;
  const bodies = new Map(chips.map((chip) => [chip.id, chip.body]));
  return draft.replace(
    /\[#paste:([a-zA-Z0-9_-]+)\]/g,
    (match, id: string) => bodies.get(id) ?? match,
  );
}

export function removeComposerPaste(
  draft: string,
  chips: readonly ComposerPasteChip[],
  id: string,
): { draft: string; chips: ComposerPasteChip[] } {
  return {
    draft: draft.split(pasteToken(id)).join(""),
    chips: chips.filter((chip) => chip.id !== id),
  };
}

/** Drops chips whose token is gone and appends a chip created by the latest change. */
export function retainComposerPasteChips(
  draft: string,
  chips: readonly ComposerPasteChip[],
  added: ComposerPasteChip | null,
): ComposerPasteChip[] {
  const withAdded = added ? [...chips, added] : chips;
  let removed = false;
  const retained: ComposerPasteChip[] = [];
  for (const chip of withAdded) {
    if (draft.includes(pasteToken(chip.id))) retained.push(chip);
    else removed = true;
  }
  if (!added && !removed) return chips as ComposerPasteChip[];
  return retained;
}

function countPasteLines(text: string): number {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (normalized.length === 0) return 0;
  const trimmed = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  return trimmed.split("\n").length;
}

function insertedSpan(
  previous: string,
  next: string,
): { text: string; start: number; end: number } {
  let start = 0;
  const maxStart = Math.min(previous.length, next.length);
  while (start < maxStart && previous.charCodeAt(start) === next.charCodeAt(start)) start += 1;
  let endPrev = previous.length;
  let endNext = next.length;
  while (
    endPrev > start &&
    endNext > start &&
    previous.charCodeAt(endPrev - 1) === next.charCodeAt(endNext - 1)
  ) {
    endPrev -= 1;
    endNext -= 1;
  }
  return { text: next.slice(start, endNext), start, end: endNext };
}

function createPasteId(): string {
  const cryptoApi = globalThis.crypto as { randomUUID?: () => string } | undefined;
  const uuid = cryptoApi?.randomUUID?.();
  const raw = uuid
    ? uuid.replace(/-/g, "")
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return raw
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 16)
    .padEnd(16, "0");
}
