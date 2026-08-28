import type { Ctx } from "@milkdown/kit/ctx";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import { lift, setBlockType, wrapIn } from "@milkdown/kit/prose/commands";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { TextSelection } from "@milkdown/kit/prose/state";
import { liftListItem } from "@milkdown/kit/prose/schema-list";
import {
  createCodeBlockCommand,
  wrapInHeadingCommand,
} from "@milkdown/kit/preset/commonmark";
import type { MdLiveBlockAction } from "./types";
import { mdLiveTaskMarkerOf } from "./task-list";
import { insertMdLiveToggle } from "./toggle";

export const MD_LIVE_TOOLBAR_CONVERT_IDS = [
  "paragraph",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "quote",
  "ul",
  "ol",
  "todo",
  "toggle",
  "code",
] as const;

function ancestorName(state: EditorState, name: string): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === name) return true;
  }
  return false;
}

export function mdLiveVisibleConvertIds(state: EditorState): string[] {
  if (
    ancestorName(state, "table")
    || ancestorName(state, "table_cell")
    || ancestorName(state, "table_header")
    || ancestorName(state, "details_summary")
  ) {
    return [];
  }
  const { $from, $to } = state.selection;
  const single = $from.parent === $to.parent && $from.parent.isTextblock;
  return MD_LIVE_TOOLBAR_CONVERT_IDS.filter((id) => {
    if (id === "toggle" && !single) return false;
    return true;
  });
}

export function isolateSelectedTextblock(state: EditorState): Transaction | null {
  const sel = state.selection;
  if (!(sel instanceof TextSelection) || sel.empty) return null;
  const { $from, $to, from, to } = sel;

  if ($from.parent === $to.parent && $from.parent.isTextblock) {
    const start = $from.start();
    const end = $from.end();
    if (from <= start && to >= end) return null;
    let tr = state.tr;
    if (to < end) tr = tr.split(to);
    const mappedFrom = tr.mapping.map(from);
    const mappedStart = tr.doc.resolve(mappedFrom).start();
    if (mappedFrom > mappedStart) tr = tr.split(mappedFrom);
    const mid = tr.mapping.map(from);
    const $mid = tr.doc.resolve(mid);
    if (!$mid.parent.isTextblock) return tr;
    return tr.setSelection(TextSelection.create(tr.doc, $mid.start(), $mid.end()));
  }

  let tr = state.tr;
  let changed = false;
  if ($to.parent.isTextblock && $to.parentOffset < $to.parent.content.size) {
    tr = tr.split(to);
    changed = true;
  }
  const mappedFrom = tr.mapping.map(from);
  const $mappedFrom = tr.doc.resolve(mappedFrom);
  if ($mappedFrom.parent.isTextblock && $mappedFrom.parentOffset > 0) {
    tr = tr.split(mappedFrom);
    changed = true;
  }
  if (!changed) return null;
  const a = tr.mapping.map(from);
  const b = tr.mapping.map(to);
  const $a = tr.doc.resolve(Math.min(a, b));
  const $b = tr.doc.resolve(Math.max(a, b));
  const selFrom = $a.parent.isTextblock ? $a.start() : Math.min(a, b);
  const selTo = $b.parent.isTextblock ? $b.end() : Math.max(a, b);
  return tr.setSelection(TextSelection.create(tr.doc, selFrom, selTo));
}

function inList(state: EditorState): boolean {
  return ancestorName(state, "list_item");
}

function liftOutOfList(view: { state: EditorState; dispatch: (tr: Transaction) => void }): void {
  const listItem = view.state.schema.nodes.list_item;
  if (!listItem) return;
  const liftItem = liftListItem(listItem);
  for (let i = 0; i < 8 && inList(view.state); i += 1) {
    if (!liftItem(view.state, (tr) => view.dispatch(tr))) break;
  }
}

function liftOutOfQuote(view: { state: EditorState; dispatch: (tr: Transaction) => void }): void {
  if (!ancestorName(view.state, "blockquote")) return;
  lift(view.state, (tr) => view.dispatch(tr));
}

function setParagraph(view: { state: EditorState; dispatch: (tr: Transaction) => void }): void {
  const paragraph = view.state.schema.nodes.paragraph;
  if (!paragraph) return;
  const parent = view.state.selection.$from.parent;
  if (parent.type === paragraph) return;
  setBlockType(paragraph)(view.state, (tr) => view.dispatch(tr));
}

function replaceWrapper(
  view: { state: EditorState; dispatch: (tr: Transaction) => void },
  fromName: string,
  toName: string,
): boolean {
  const { state } = view;
  const type = state.schema.nodes[toName];
  if (!type) return false;
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== fromName && node.type.name !== toName) continue;
    if (node.type.name === toName) return true;
    view.dispatch(state.tr.setNodeMarkup($from.before(depth), type, node.attrs));
    return true;
  }
  return false;
}

function setTaskMarker(
  view: { state: EditorState; dispatch: (tr: Transaction) => void },
  marker: " " | null,
): void {
  const { state } = view;
  const { from, to, $from, $to } = state.selection;
  const seen = new Set<number>();
  let tr: Transaction | null = null;
  const visit = (pos: number, node: { attrs: Record<string, unknown> }) => {
    if (seen.has(pos)) return;
    seen.add(pos);
    const current = mdLiveTaskMarkerOf(node.attrs);
    if (marker == null && current == null) return;
    if (marker != null && current === marker && node.attrs.taskMarker === marker) return;
    tr ??= state.tr;
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      checked: false,
      taskMarker: marker,
    });
  };
  for (const $pos of [$from, $to]) {
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      if ($pos.node(depth).type.name !== "list_item") continue;
      visit($pos.before(depth), $pos.node(depth));
      break;
    }
  }
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === "list_item") visit(pos, node);
    return true;
  });
  if (tr) view.dispatch(tr);
}

function wrapBullet(view: { state: EditorState; dispatch: (tr: Transaction) => void }): boolean {
  const bullet = view.state.schema.nodes.bullet_list;
  if (!bullet) return false;
  if (ancestorName(view.state, "bullet_list")) return true;
  if (replaceWrapper(view, "ordered_list", "bullet_list")) return true;
  setParagraph(view);
  return wrapIn(bullet)(view.state, (tr) => view.dispatch(tr));
}

function wrapOrdered(view: { state: EditorState; dispatch: (tr: Transaction) => void }): boolean {
  const ordered = view.state.schema.nodes.ordered_list;
  if (!ordered) return false;
  if (ancestorName(view.state, "ordered_list")) return true;
  if (replaceWrapper(view, "bullet_list", "ordered_list")) return true;
  setParagraph(view);
  return wrapIn(ordered)(view.state, (tr) => view.dispatch(tr));
}

export function applyMdLiveBlockConvert(ctx: Ctx, action: MdLiveBlockAction): void {
  const view = ctx.get(editorViewCtx);
  const isolated = isolateSelectedTextblock(view.state);
  if (isolated) view.dispatch(isolated);

  const commands = ctx.get(commandsCtx);

  switch (action.type) {
    case "paragraph":
      liftOutOfList(view);
      liftOutOfQuote(view);
      setParagraph(view);
      return;
    case "heading":
      liftOutOfList(view);
      liftOutOfQuote(view);
      commands.call(wrapInHeadingCommand.key, action.level);
      return;
    case "bullet-list":
      wrapBullet(view);
      setTaskMarker(view, null);
      return;
    case "ordered-list":
      wrapOrdered(view);
      setTaskMarker(view, null);
      return;
    case "task-list":
      wrapBullet(view);
      setTaskMarker(view, " ");
      return;
    case "quote": {
      if (ancestorName(view.state, "blockquote")) return;
      const quote = view.state.schema.nodes.blockquote;
      if (quote) wrapIn(quote)(view.state, (tr) => view.dispatch(tr));
      return;
    }
    case "toggle":
      liftOutOfList(view);
      insertMdLiveToggle(ctx);
      return;
    case "code":
      liftOutOfList(view);
      liftOutOfQuote(view);
      commands.call(createCodeBlockCommand.key);
      return;
    default:
      return;
  }
}
