import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { Node } from "@milkdown/kit/prose/model";
import { $prose } from "@milkdown/kit/utils";
import { isMdLiveComposing, mdLiveCompositionDomHandlers } from "./composing";

export const MD_LIVE_INLINE_CODE_ZWSP = "\u200B";
const EMPTY_INLINE_CODE = `${MD_LIVE_INLINE_CODE_ZWSP}${MD_LIVE_INLINE_CODE_ZWSP}`;

function inlineCodeMarkType(state: { schema: EditorState["schema"] }) {
  return state.schema.marks.inlineCode ?? state.schema.marks.code ?? null;
}

function visibleInlineCodeText(text: string): string {
  return text.replaceAll(MD_LIVE_INLINE_CODE_ZWSP, "");
}

export function mdLiveInlineCodeRange(doc: Node, pos: number): { from: number; to: number } | null {
  const type = doc.type.schema.marks.inlineCode ?? doc.type.schema.marks.code;
  if (!type) return null;
  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  const $pos = doc.resolve(clamped);
  if (!$pos.parent.isTextblock) return null;
  const parentStart = $pos.start();
  const ranges: Array<{ from: number; to: number }> = [];
  let offset = 0;
  $pos.parent.forEach((child) => {
    const from = parentStart + offset;
    const to = from + child.nodeSize;
    if (child.isText && type.isInSet(child.marks)) {
      const last = ranges[ranges.length - 1];
      if (last && last.to === from) last.to = to;
      else ranges.push({ from, to });
    }
    offset += child.nodeSize;
  });
  return ranges.find((range) => pos >= range.from && pos <= range.to) ?? null;
}

export function mdLiveInsertEmptyInlineCode(state: EditorState): Transaction | null {
  const markType = inlineCodeMarkType(state);
  if (!markType || !state.schema.text) return null;
  const mark = markType.create();
  const { from, to } = state.selection;
  const tr = state.tr.replaceWith(from, to, state.schema.text(EMPTY_INLINE_CODE, [mark]));
  return tr.setSelection(TextSelection.create(tr.doc, from + 1)).setStoredMarks([mark]);
}

export function mdLiveInlineCodeDelete(state: EditorState, direction: -1 | 1): Transaction | null {
  const markType = inlineCodeMarkType(state);
  if (!markType) return null;
  const { empty, from, to, $from } = state.selection;
  const probe = empty
    ? (direction < 0 ? Math.max($from.start(), from - 1) : from)
    : from;
  const range = mdLiveInlineCodeRange(state.doc, probe);
  if (!range) return null;

  if (!empty) {
    if (from <= range.from && to >= range.to) {
      const visible = visibleInlineCodeText(state.doc.textBetween(range.from, range.to));
      if (visible.length === 0) {
        const tr = state.tr.delete(range.from, range.to);
        return tr.setSelection(TextSelection.create(tr.doc, range.from));
      }
    }
    if (from >= range.from && to <= range.to) {
      const remaining = visibleInlineCodeText(
        state.doc.textBetween(range.from, from) + state.doc.textBetween(to, range.to),
      );
      if (remaining.length === 0) {
        const mark = markType.create();
        const tr = state.tr.replaceWith(range.from, range.to, state.schema.text(EMPTY_INLINE_CODE, [mark]));
        return tr.setSelection(TextSelection.create(tr.doc, range.from + 1)).setStoredMarks([mark]);
      }
    }
    return null;
  }

  const visible = visibleInlineCodeText(state.doc.textBetween(range.from, range.to));
  if (visible.length === 0) {
    if (from < range.from || from > range.to) return null;
    const tr = state.tr.delete(range.from, range.to);
    return tr.setSelection(TextSelection.create(tr.doc, range.from));
  }
  if (direction < 0 && (from <= range.from || from > range.to)) return null;
  if (direction > 0 && (from < range.from || from >= range.to)) return null;
  if (visible.length === 1) {
    const mark = markType.create();
    const tr = state.tr.replaceWith(range.from, range.to, state.schema.text(EMPTY_INLINE_CODE, [mark]));
    return tr.setSelection(TextSelection.create(tr.doc, range.from + 1)).setStoredMarks([mark]);
  }
  return null;
}

export function mdLiveInlineCodeTypeOverPlaceholder(
  state: EditorState,
  from: number,
  to: number,
  text: string,
): Transaction | null {
  if (!text) return null;
  const markType = inlineCodeMarkType(state);
  if (!markType) return null;
  const range = mdLiveInlineCodeRange(state.doc, from) ?? mdLiveInlineCodeRange(state.doc, to);
  if (!range) return null;
  if (from < range.from || to > range.to) return null;
  const existing = visibleInlineCodeText(state.doc.textBetween(range.from, range.to));
  if (existing.length > 0) return null;
  const mark = markType.create();
  const tr = state.tr.replaceWith(range.from, range.to, state.schema.text(text, [mark]));
  return tr.setSelection(TextSelection.create(tr.doc, range.from + text.length)).setStoredMarks([mark]);
}

function stripZwspFromNonEmptyInlineCode(state: EditorState): Transaction | null {
  const markType = inlineCodeMarkType(state);
  if (!markType) return null;
  let tr: Transaction | null = null;
  state.doc.descendants((node, pos) => {
    if (!node.isText || !markType.isInSet(node.marks)) return;
    const text = node.text ?? "";
    if (!text.includes(MD_LIVE_INLINE_CODE_ZWSP)) return;
    const next = visibleInlineCodeText(text);
    if (!next || next === text) return;
    tr ??= state.tr;
    const mapped = tr.mapping.map(pos);
    tr = tr.replaceWith(mapped, mapped + node.nodeSize, state.schema.text(next, node.marks));
  });
  return tr;
}

export function mdLiveStripUnmarkedZwsp(state: EditorState): Transaction | null {
  const markType = inlineCodeMarkType(state);
  let tr: Transaction | null = null;
  state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    const text = node.text ?? "";
    if (!text.includes(MD_LIVE_INLINE_CODE_ZWSP)) return;
    if (markType && markType.isInSet(node.marks)) return;
    const next = visibleInlineCodeText(text);
    tr ??= state.tr;
    const mapped = tr.mapping.map(pos);
    if (!next) tr.delete(mapped, mapped + node.nodeSize);
    else tr.replaceWith(mapped, mapped + node.nodeSize, state.schema.text(next, node.marks));
  });
  return tr;
}

export const mdLiveInlineCodePlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey("mdLiveInlineCode"),
    props: {
      handleDOMEvents: mdLiveCompositionDomHandlers,
      handleKeyDown(view, event) {
        if (isMdLiveComposing(view)) return false;
        if (event.key !== "Backspace" && event.key !== "Delete") return false;
        const tr = mdLiveInlineCodeDelete(view.state, event.key === "Backspace" ? -1 : 1);
        if (!tr) return false;
        event.preventDefault();
        view.dispatch(tr.scrollIntoView());
        return true;
      },
      handleTextInput(view, from, to, text) {
        if (isMdLiveComposing(view)) return false;
        const tr = mdLiveInlineCodeTypeOverPlaceholder(view.state, from, to, text);
        if (!tr) return false;
        view.dispatch(tr.scrollIntoView());
        return true;
      },
    },
    appendTransaction(transactions, _old, state) {
      if (isMdLiveComposing()) return null;
      if (!transactions.some((transaction) => transaction.docChanged)) return null;
      return stripZwspFromNonEmptyInlineCode(state) ?? mdLiveStripUnmarkedZwsp(state);
    },
  });
});
