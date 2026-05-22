import type { Chunk } from '@codemirror/merge';
import { Text } from '@codemirror/state';

export const DIFF_CFG = { scanLimit: 3000, timeout: 400 } as const;

export type GitChunkKind = 'added' | 'deleted' | 'modified';

/**
 * Inclusive 1-based line range in the **current document** covered by this chunk.
 * Draws one vertical bar per line in this range in the change gutter.
 */
export function chunkDocLineRange(chunk: Chunk, doc: Text): { from: number; to: number } | null {
  if (doc.lines === 0) return null;
  if (chunk.fromB < chunk.toB) {
    const fromPos = Math.min(chunk.fromB, doc.length);
    const endPos = Math.max(chunk.toB - 1, chunk.fromB);
    const from = doc.lineAt(fromPos).number;
    const to = doc.lineAt(Math.min(endPos, doc.length)).number;
    return { from, to };
  }
  // Pure deletion in B: anchor at the insertion point (one logical line).
  const pos =
    chunk.fromB <= 0 ? 1 : Math.min(Math.max(chunk.fromB, 1), Math.max(doc.length, 1));
  const ln = doc.lineAt(pos).number;
  return { from: ln, to: ln };
}

export function classifyChunkKind(chunk: Chunk): GitChunkKind {
  const oldEmpty = chunk.fromA === chunk.toA;
  const newEmpty = chunk.fromB === chunk.toB;
  if (oldEmpty && !newEmpty) return 'added';
  if (!oldEmpty && newEmpty) return 'deleted';
  return 'modified';
}

/** Start position of the first line in doc B for this chunk — expanded panel sits above it. */
export function chunkFirstLineFrom(chunk: Chunk, doc: Text): number {
  if (doc.length === 0) return 0;
  const pos =
    chunk.fromB < chunk.toB
      ? Math.min(chunk.fromB, doc.length)
      : Math.min(Math.max(chunk.fromB, 1), doc.length);
  return doc.lineAt(pos).from;
}

export function textFromStringContent(s: string): Text {
  if (!s) return Text.empty;
  return Text.of(s.replace(/\r\n/g, '\n').split('\n'));
}

/**
 * Line backgrounds when a hunk is expanded: document B is always the **new** side → green tint.
 * The gutter bar for `modified` stays yellow; only the in-text highlight follows “latest = green”.
 */
export function lineBgClassForChunk(expanded: boolean): string {
  const base = 'cm-git-line-bg-added';
  return expanded ? `${base} cm-git-line-bg-expanded cm-git-active-hunk-target` : base;
}
