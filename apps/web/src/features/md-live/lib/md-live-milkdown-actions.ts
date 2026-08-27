import type { Ctx } from "@milkdown/kit/ctx";
import {
  commandsCtx,
  editorViewCtx,
  parserCtx,
  serializerCtx,
} from "@milkdown/kit/core";
import { Slice } from "@milkdown/kit/prose/model";
import {
  createCodeBlockCommand,
  insertHrCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark";
import { insertTableCommand } from "@milkdown/kit/preset/gfm";
import {
  abortStreamingCmd,
  endStreamingCmd,
  pushChunkCmd,
  startStreamingCmd,
  streamingPluginKey,
} from "@milkdown/kit/plugin/streaming";
import {
  acceptAllDiffsCmd,
  clearDiffReviewCmd,
} from "@milkdown/kit/plugin/diff";
import type { MdLiveBlockAction } from "./md-live-editor-registry";

export function getEditorMarkdown(ctx: Ctx): string {
  const view = ctx.get(editorViewCtx);
  return ctx.get(serializerCtx)(view.state.doc);
}

export function getSelectionMarkdown(ctx: Ctx): string {
  const view = ctx.get(editorViewCtx);
  const { from, to, empty } = view.state.selection;
  if (empty) return "";
  return view.state.doc.textBetween(from, to, "\n\n");
}

export function deleteSlashQuery(ctx: Ctx): void {
  const view = ctx.get(editorViewCtx);
  const { $from } = view.state.selection;
  const text = $from.parent.textBetween(0, $from.parentOffset);
  const idx = text.lastIndexOf("/");
  if (idx < 0) return;
  const from = $from.start() + idx;
  const to = $from.pos;
  if (to < from) return;
  view.dispatch(view.state.tr.delete(from, to));
}

export function insertMarkdown(ctx: Ctx, markdown: string, replaceSlash = false): void {
  if (replaceSlash) deleteSlashQuery(ctx);
  const view = ctx.get(editorViewCtx);
  const parsed = ctx.get(parserCtx)(markdown);
  if (!parsed) return;
  const { from, to } = view.state.selection;
  view.dispatch(view.state.tr.replaceRange(from, to, new Slice(parsed.content, 0, 0)));
}

export function runBlockAction(ctx: Ctx, action: MdLiveBlockAction, replaceSlash = false): void {
  if (replaceSlash) deleteSlashQuery(ctx);
  const commands = ctx.get(commandsCtx);
  switch (action.type) {
    case "heading":
      commands.call(wrapInHeadingCommand.key, action.level);
      return;
    case "bullet-list":
      commands.call(wrapInBulletListCommand.key);
      return;
    case "ordered-list":
      commands.call(wrapInOrderedListCommand.key);
      return;
    case "quote":
      commands.call(wrapInBlockquoteCommand.key);
      return;
    case "code":
      commands.call(createCodeBlockCommand.key);
      return;
    case "table":
      commands.call(insertTableCommand.key);
      return;
    case "divider":
      commands.call(insertHrCommand.key);
      return;
  }
}

export function startStream(ctx: Ctx, insertAt: "cursor" | "selection"): boolean {
  const view = ctx.get(editorViewCtx);
  const existing = streamingPluginKey.getState(view.state);
  if (existing?.active) return false;
  return ctx.get(commandsCtx).call(startStreamingCmd.key, { insertAt });
}

export function pushStreamChunk(ctx: Ctx, token: string): void {
  ctx.get(commandsCtx).call(pushChunkCmd.key, token);
}

export function endStream(ctx: Ctx, diffReview = true): void {
  ctx.get(commandsCtx).call(endStreamingCmd.key, { diffReview });
}

export function abortStream(ctx: Ctx, keep = false): void {
  ctx.get(commandsCtx).call(abortStreamingCmd.key, { keep });
}

export function acceptAllDiffs(ctx: Ctx): void {
  ctx.get(commandsCtx).call(acceptAllDiffsCmd.key);
}

export function clearDiffReview(ctx: Ctx): void {
  ctx.get(commandsCtx).call(clearDiffReviewCmd.key);
}
