import { lift, setBlockType } from "@milkdown/kit/prose/commands";
import type { Node, ResolvedPos } from "@milkdown/kit/prose/model";
import { Fragment } from "@milkdown/kit/prose/model";
import type { Command, EditorState, Plugin, Transaction } from "@milkdown/kit/prose/state";
import { TextSelection } from "@milkdown/kit/prose/state";
import { liftListItem } from "@milkdown/kit/prose/schema-list";
import { $shortcut } from "@milkdown/kit/utils";

type UndoableInputRule = {
  transform: Transaction;
  from: number;
  to: number;
  text: string;
};

function undoInputRule(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  for (const plugin of state.plugins as Array<Plugin & { spec: { isInputRules?: boolean } }>) {
    if (!plugin.spec.isInputRules) continue;
    const undoable = plugin.getState(state) as UndoableInputRule | null;
    if (!undoable) continue;
    if (dispatch) {
      let tr = state.tr;
      for (let index = undoable.transform.steps.length - 1; index >= 0; index -= 1) {
        const step = undoable.transform.steps[index];
        const doc = undoable.transform.docs[index];
        if (!step || !doc) continue;
        tr = tr.step(step.invert(doc));
      }
      if (undoable.text) {
        const marks = tr.doc.resolve(undoable.from).marks();
        tr = tr.replaceWith(undoable.from, undoable.to, state.schema.text(undoable.text, marks));
      } else {
        tr = tr.delete(undoable.from, undoable.to);
      }
      dispatch(tr);
    }
    return true;
  }
  return false;
}

function depthOf($from: ResolvedPos, name: string): number {
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === name) return depth;
  }
  return -1;
}

function applyCommand(
  command: Command,
  state: EditorState,
): Transaction | null {
  let next: Transaction | null = null;
  const applied = command(state, (tr) => {
    next = tr;
  });
  return applied ? next : null;
}

function deleteNode(state: EditorState, pos: number, node: Node): Transaction | null {
  const paragraph = state.schema.nodes.paragraph;
  if (!paragraph) return null;
  const $pos = state.doc.resolve(pos);
  const parent = $pos.parent;
  const index = $pos.index();
  const from = pos;
  const to = pos + node.nodeSize;
  if (parent.canReplace(index, index + 1, Fragment.empty)) {
    const tr = state.tr.delete(from, to);
    if (tr.doc.content.size === 0) return null;
    const cursor = Math.max(0, Math.min(from, tr.doc.content.size));
    const bias = from > 0 ? -1 : 1;
    return tr.setSelection(TextSelection.near(tr.doc.resolve(cursor), bias));
  }
  if (parent.canReplaceWith(index, index + 1, paragraph)) {
    const tr = state.tr.replaceWith(from, to, paragraph.create());
    return tr.setSelection(TextSelection.create(tr.doc, from + 1));
  }
  return null;
}

export function mdLiveBlockBackspace(state: EditorState): Transaction | null {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0 || !$from.parent.isTextblock) return null;
  if (depthOf($from, "table") >= 0) return null;
  if (depthOf($from, "details") >= 0) return null;

  const parent = $from.parent;
  const parentName = parent.type.name;

  if (parentName === "heading" || parentName === "code_block") {
    if (parent.content.size === 0) {
      return deleteNode(state, $from.before($from.depth), parent);
    }
    const paragraph = state.schema.nodes.paragraph;
    if (!paragraph) return null;
    return applyCommand(setBlockType(paragraph), state);
  }

  if (parentName !== "paragraph") return null;

  const listItemDepth = depthOf($from, "list_item");
  if (listItemDepth > 0) {
    const listDepth = listItemDepth - 1;
    const list = $from.node(listDepth);
    if (list.childCount !== 1) return null;
    const listItemType = state.schema.nodes.list_item;
    if (!listItemType) return null;
    if (parent.content.size === 0) {
      return deleteNode(state, $from.before(listDepth), list);
    }
    return applyCommand(liftListItem(listItemType), state);
  }

  const quoteDepth = depthOf($from, "blockquote");
  if (quoteDepth > 0) {
    const quote = $from.node(quoteDepth);
    if (quote.childCount !== 1) return null;
    if (parent.content.size === 0) {
      return deleteNode(state, $from.before(quoteDepth), quote);
    }
    return applyCommand(lift, state);
  }

  return null;
}

const runBlockBackspace: Command = (state, dispatch) => {
  if (undoInputRule(state, dispatch)) return true;
  const tr = mdLiveBlockBackspace(state);
  if (!tr) return false;
  dispatch?.(tr.scrollIntoView());
  return true;
};

export const mdLiveBlockBackspacePlugin = $shortcut(() => ({
  Backspace: { key: "Backspace", priority: 100, onRun: () => runBlockBackspace },
}));
