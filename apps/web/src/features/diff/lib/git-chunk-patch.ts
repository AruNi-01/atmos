import type { Chunk } from '@codemirror/merge';
import type { Text } from '@codemirror/state';

/** Normalize to forward slashes for unified diff paths. */
export function normalizeGitFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

/** Lines fully covered by [from, to) in CodeMirror Text coordinates. */
export function sliceLines(text: Text, from: number, to: number): string[] {
  if (from >= to) return [];
  const safeFrom = Math.min(Math.max(from, 0), text.length);
  const safeTo = Math.min(Math.max(to, 0), text.length);
  if (safeFrom >= safeTo) return [];
  const first = text.lineAt(safeFrom);
  const last = text.lineAt(Math.max(safeTo - 1, safeFrom));
  const out: string[] = [];
  for (let n = first.number; n <= last.number; n++) {
    out.push(text.line(n).text);
  }
  return out;
}

function classifyChunk(chunk: Chunk): 'insert' | 'delete' | 'modify' {
  const oldEmpty = chunk.fromA === chunk.toA;
  const newEmpty = chunk.fromB === chunk.toB;
  if (oldEmpty && !newEmpty) return 'insert';
  if (!oldEmpty && newEmpty) return 'delete';
  return 'modify';
}

/**
 * Build a minimal unified diff for one chunk (unidiff-zero friendly).
 * `original` is index/HEAD side; `current` is working tree (what the editor shows).
 */
export function buildUnifiedPatchForChunk(
  filePath: string,
  original: Text,
  current: Text,
  chunk: Chunk,
  isNewFile: boolean,
): string {
  const path = normalizeGitFilePath(filePath);
  const oldLines = sliceLines(original, chunk.fromA, chunk.toA);
  const newLines = sliceLines(current, chunk.fromB, chunk.toB);
  const kind = classifyChunk(chunk);

  const lines: string[] = [`diff --git a/${path} b/${path}`];

  if (isNewFile) {
    lines.push('new file mode 100644');
    lines.push('--- /dev/null');
    lines.push(`+++ b/${path}`);
    lines.push(`@@ -0,0 +1,${newLines.length} @@`);
    for (const l of newLines) lines.push(`+${l}`);
    return `${lines.join('\n')}\n`;
  }

  lines.push(`--- a/${path}`);
  lines.push(`+++ b/${path}`);

  let oldStart: number;
  let oldCount: number;
  let newStart: number;
  let newCount: number;

  if (kind === 'insert') {
    oldCount = 0;
    oldStart = chunk.fromA === 0 ? 0 : original.lineAt(chunk.fromA).number - 1;
    newCount = newLines.length;
    newStart = chunk.fromB === 0 ? 1 : current.lineAt(chunk.fromB).number;
  } else if (kind === 'delete') {
    oldCount = oldLines.length;
    oldStart = oldLines.length === 0 ? 0 : original.lineAt(chunk.fromA).number;
    newCount = 0;
    newStart =
      current.length === 0 || chunk.fromB >= current.length
        ? Math.max(1, current.lines)
        : current.lineAt(chunk.fromB).number;
  } else {
    oldCount = oldLines.length;
    oldStart = original.lineAt(chunk.fromA).number;
    newCount = newLines.length;
    newStart = current.lineAt(chunk.fromB).number;
  }

  lines.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);

  for (const l of oldLines) lines.push(`-${l}`);
  for (const l of newLines) lines.push(`+${l}`);

  return `${lines.join('\n')}\n`;
}
