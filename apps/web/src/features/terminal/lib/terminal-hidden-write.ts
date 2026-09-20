import type { TerminalWriteChunk } from "./terminal-runtime-utils";

/** Per-pane cap while a terminal is off-screen. Oldest bytes drop first. */
export const HIDDEN_TERMINAL_WRITE_BUFFER_MAX = 1_500_000;

export function terminalWriteChunkByteLength(chunk: TerminalWriteChunk): number {
  return typeof chunk === "string" ? chunk.length : chunk.byteLength;
}

export function shouldPaintTerminalSurface(input: {
  visuallyActiveWorkspace: boolean;
  keepAlivePanel: boolean;
}): boolean {
  return input.visuallyActiveWorkspace && !input.keepAlivePanel;
}

export function isTerminalKeepAlivePanel(el: Element | null): boolean {
  return Boolean(el?.closest(".atmos-terminal-panel-keepalive"));
}

export function trimHiddenTerminalWriteBuffer(
  chunks: TerminalWriteChunk[],
  maxBytes = HIDDEN_TERMINAL_WRITE_BUFFER_MAX,
): TerminalWriteChunk[] {
  let total = 0;
  for (const chunk of chunks) {
    total += terminalWriteChunkByteLength(chunk);
  }
  if (total <= maxBytes) return chunks;

  let drop = total - maxBytes;
  let start = 0;
  while (start < chunks.length && drop > 0) {
    drop -= terminalWriteChunkByteLength(chunks[start]!);
    start += 1;
  }
  return start === 0 ? chunks : chunks.slice(start);
}
