import {
  MD_LIVE_MUTATING_TOOLS,
  MD_LIVE_READ_TOOLS,
  type MdLiveEditContext,
  type MdLiveEditOp,
} from "./types";

export function isMdLiveMutatingTool(tool: string): boolean {
  return (MD_LIVE_MUTATING_TOOLS as readonly string[]).includes(tool);
}

export function isMdLiveReadTool(tool: string): boolean {
  return (MD_LIVE_READ_TOOLS as readonly string[]).includes(tool);
}

export function isMdLiveDocumentTool(tool: string): boolean {
  return isMdLiveMutatingTool(tool) || isMdLiveReadTool(tool);
}

/** Pure string apply for tests. Live host streams through Milkdown instead. */
export function applyMdLiveEditOp(ctx: MdLiveEditContext, op: MdLiveEditOp): string {
  const from = Math.max(0, Math.min(ctx.selectionStart, ctx.selectionEnd, ctx.markdown.length));
  const to = Math.max(
    from,
    Math.min(Math.max(ctx.selectionStart, ctx.selectionEnd), ctx.markdown.length),
  );
  switch (op.type) {
    case "replace_document":
      return op.markdown;
    case "insert":
      return ctx.markdown.slice(0, to) + op.markdown + ctx.markdown.slice(to);
    case "replace_selection":
      return ctx.markdown.slice(0, from) + op.markdown + ctx.markdown.slice(to);
  }
}

export function splitMarkdownStreamChunks(markdown: string, size = 48): string[] {
  if (markdown.length === 0) return [];
  const chunks: string[] = [];
  for (let i = 0; i < markdown.length; i += size) {
    chunks.push(markdown.slice(i, i + size));
  }
  return chunks;
}
