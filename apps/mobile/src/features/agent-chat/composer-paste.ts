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
