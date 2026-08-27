import { InputRule } from "@milkdown/kit/prose/inputrules";
import type { Node } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, type Transaction } from "@milkdown/kit/prose/state";
import { findWrapping } from "@milkdown/kit/prose/transform";
import { bulletListSchema, listItemSchema } from "@milkdown/kit/preset/commonmark";
import { $inputRule, $prose, $remark } from "@milkdown/kit/utils";
import type { MdLiveTaskMarker } from "./types";

const TASK_MARKERS: MdLiveTaskMarker[] = [" ", "/", "x", "-"];
const MARKER_RE = /^\[([ xX/\-])\]\s+/;
const TYPED_TASK_RE = /^\[([ xX/\-])\](?:\s+|$)/;

export function normalizeMdLiveTaskMarker(raw: string | null | undefined): MdLiveTaskMarker | null {
  if (raw == null) return null;
  if (raw === "X" || raw === "x") return "x";
  if (raw === "/") return "/";
  if (raw === "-") return "-";
  if (raw === " " || raw === "") return " ";
  return null;
}

export function mdLiveTaskMarkerOf(attrs: {
  taskMarker?: unknown;
  checked?: unknown;
}): MdLiveTaskMarker | null {
  const fromAttr = normalizeMdLiveTaskMarker(typeof attrs.taskMarker === "string" ? attrs.taskMarker : null);
  if (fromAttr != null) return fromAttr;
  if (attrs.checked === true) return "x";
  if (attrs.checked === false) return " ";
  return null;
}

export function cycleMdLiveTaskMarker(marker: MdLiveTaskMarker): MdLiveTaskMarker {
  const index = TASK_MARKERS.indexOf(marker);
  return TASK_MARKERS[(index + 1) % TASK_MARKERS.length] ?? " ";
}

export function matchTypedTaskMarker(text: string): { marker: MdLiveTaskMarker; length: number } | null {
  const match = text.match(TYPED_TASK_RE);
  if (!match) return null;
  const marker = normalizeMdLiveTaskMarker(match[1]);
  if (marker == null) return null;
  return { marker, length: match[0].length };
}

function firstTextNode(node: { type?: string; value?: string; children?: unknown[] }): { value: string } | null {
  if (node.type === "text" && typeof node.value === "string") return node as { value: string };
  const children = node.children;
  if (!Array.isArray(children)) return null;
  for (const child of children) {
    if (child && typeof child === "object") {
      const found = firstTextNode(child as { type?: string; value?: string; children?: unknown[] });
      if (found) return found;
    }
  }
  return null;
}

export function remarkMdLiveTasks() {
  return (tree: { type?: string; children?: unknown[] }) => {
    const walk = (node: { type?: string; checked?: unknown; children?: unknown[]; taskMarker?: string }) => {
      if (node.type === "listItem") {
        if (node.checked === true) node.taskMarker = "x";
        else if (node.checked === false) node.taskMarker = " ";
        else {
          const text = firstTextNode(node);
          const match = text?.value.match(MARKER_RE);
          if (text && match) {
            const marker = normalizeMdLiveTaskMarker(match[1]);
            if (marker === "/" || marker === "-") {
              node.taskMarker = marker;
              text.value = text.value.slice(match[0].length);
            }
          }
        }
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          if (child && typeof child === "object") walk(child as typeof node);
        }
      }
    };
    walk(tree);
  };
}

export const mdLiveTaskRemark = $remark("mdLiveTasks", () => remarkMdLiveTasks);

export const mdLiveTaskListItem = listItemSchema.extendSchema((prev) => {
  return (ctx) => {
    const base = prev(ctx);
    return {
      ...base,
      attrs: {
        ...base.attrs,
        taskMarker: { default: null },
        spread: { default: false, validate: "boolean" },
      },
      parseMarkdown: {
        match: ({ type }) => type === "listItem",
        runner: (state, node, type) => {
          const marker = normalizeMdLiveTaskMarker(
            (node as { taskMarker?: string }).taskMarker
              ?? (node.checked === true ? "x" : node.checked === false ? " " : null),
          );
          const spread = node.spread ?? false;
          const label = node.label != null ? `${node.label}.` : "•";
          const listType = node.label != null ? "ordered" : "bullet";
          if (marker == null) {
            state.openNode(type, { label, listType, spread });
            state.next(node.children);
            state.closeNode();
            return;
          }
          state.openNode(type, {
            label,
            listType,
            spread,
            checked: marker === "x",
            taskMarker: marker,
          });
          state.next(node.children);
          state.closeNode();
        },
      },
      toMarkdown: {
        match: (node) => node.type.name === "list_item",
        runner: (state, node) => {
          const marker = mdLiveTaskMarkerOf(node.attrs);
          if (marker == null) {
            base.toMarkdown.runner(state, node);
            return;
          }
          if (marker === "x" || marker === " ") {
            state.openNode("listItem", undefined, {
              label: node.attrs.label,
              listType: node.attrs.listType,
              spread: node.attrs.spread,
              checked: marker === "x",
            });
            state.next(node.content);
            state.closeNode();
            return;
          }
          state.openNode("listItem", undefined, {
            label: node.attrs.label,
            listType: node.attrs.listType,
            spread: node.attrs.spread,
          });
          const first = node.content.firstChild;
          if (first?.type.name === "paragraph") {
            state.openNode("paragraph");
            state.addNode("text", undefined, `[${marker}] `);
            state.next(first.content);
            state.closeNode();
            for (let i = 1; i < node.content.childCount; i++) {
              state.next(node.content.child(i));
            }
          } else {
            state.next(node.content);
          }
          state.closeNode();
        },
      },
      toDOM: (node) => {
        const marker = mdLiveTaskMarkerOf(node.attrs);
        if (marker == null && base.toDOM) return base.toDOM(node);
        if (marker == null) return ["li", 0];
        return [
          "li",
          {
            "data-item-type": "task",
            "data-task-marker": marker,
            "data-checked": marker === "x" ? "true" : "false",
            class: "md-live-task-item",
          },
          0,
        ];
      },
    };
  };
});

function applyTaskMarkerNear(tr: Transaction, around: number, marker: MdLiveTaskMarker): Transaction {
  const $pos = tr.doc.resolve(Math.min(Math.max(around, 1), tr.doc.content.size));
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name !== "list_item") continue;
    tr.setNodeMarkup($pos.before(depth), undefined, {
      ...$pos.node(depth).attrs,
      checked: marker === "x",
      taskMarker: marker,
    });
    break;
  }
  return tr;
}

export const mdLiveTaskFromParagraphRule = $inputRule((ctx) => {
  return new InputRule(/^[-*]\s+\[([ xX/\-])\](?:\s|$)/, (state, match, start, end) => {
    const marker = normalizeMdLiveTaskMarker(match[1]);
    if (marker == null) return null;
    const $start = state.doc.resolve(start);
    const range = $start.blockRange();
    if (!range) return null;
    const wrapping = findWrapping(range, bulletListSchema.type(ctx));
    if (!wrapping) return null;
    const tr = state.tr.delete(start, end);
    const nextRange = tr.doc.resolve(start).blockRange();
    if (!nextRange) return null;
    tr.wrap(nextRange, wrapping);
    return applyTaskMarkerNear(tr, start, marker);
  });
});

export const mdLiveTaskMarkerRule = $inputRule(() => {
  return new InputRule(/^\[([ xX/\-])\](?:\s|$)/, (state, match, start, end) => {
    const marker = normalizeMdLiveTaskMarker(match[1]);
    if (marker == null) return null;
    const pos = state.doc.resolve(start);
    let depth = pos.depth;
    while (depth > 0 && pos.node(depth).type.name !== "list_item") depth -= 1;
    const item = depth > 0 ? pos.node(depth) : null;
    if (!item) return null;
    const tr = state.tr.delete(start, end);
    tr.setNodeMarkup(pos.before(depth), undefined, {
      ...item.attrs,
      checked: marker === "x",
      taskMarker: marker,
    });
    return tr;
  });
});

export function mdLiveTaskToneClass(marker: MdLiveTaskMarker): string {
  if (marker === "/") return "md-live-task-check--progress";
  if (marker === "x") return "md-live-task-check--done";
  if (marker === "-") return "md-live-task-check--cancelled";
  return "md-live-task-check--todo";
}

const TASK_ICON_SVGS: Record<MdLiveTaskMarker, string> = {
  " ": '<svg viewBox="0 0 16 16" fill="none" data-icon="todo" class="md-live-task-icon"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/></svg>',
  "/": '<svg viewBox="0 0 16 16" fill="none" data-icon="progress" class="md-live-task-icon"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5" opacity="0.3"/><path d="M8 1.5 A6.5 6.5 0 0 1 14.5 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  x: '<svg viewBox="0 0 16 16" fill="none" data-icon="done" class="md-live-task-icon"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 8L7.2 9.7L10.5 6.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  "-": '<svg viewBox="0 0 16 16" fill="none" data-icon="cancelled" class="md-live-task-icon"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/><path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
};

function taskIconStack(): string {
  return `<span class="md-live-task-icons">${TASK_ICON_SVGS[" "]}${TASK_ICON_SVGS["/"]}${TASK_ICON_SVGS.x}${TASK_ICON_SVGS["-"]}</span>`;
}

function activateTaskIcon(button: HTMLElement, marker: MdLiveTaskMarker): void {
  const active =
    marker === "/" ? "progress" : marker === "x" ? "done" : marker === "-" ? "cancelled" : "todo";
  button.querySelectorAll(".md-live-task-icon").forEach((icon) => {
    icon.classList.toggle("is-active", icon.getAttribute("data-icon") === active);
  });
}

export const mdLiveTaskTypedDetect = $prose(() => {
  return new Plugin({
    key: new PluginKey("md-live-task-typed-detect"),
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((transaction) => transaction.docChanged)) return null;
      let tr: Transaction | null = null;
      const apply = () => {
        tr ??= newState.tr;
        return tr;
      };
      newState.doc.descendants((node, pos) => {
        if (node.type.name !== "list_item") return;
        const mappedPos = tr ? tr.mapping.map(pos) : pos;
        const current = (tr ?? newState).doc.nodeAt(mappedPos);
        if (!current || current.type.name !== "list_item") return;
        const existing = mdLiveTaskMarkerOf(current.attrs);
        if (existing != null && typeof current.attrs.taskMarker === "string") return;
        if (existing != null && current.attrs.taskMarker == null) {
          apply().setNodeMarkup(mappedPos, undefined, {
            ...current.attrs,
            taskMarker: existing,
            checked: existing === "x",
          });
          return;
        }
        const para = current.firstChild;
        if (!para || para.type.name !== "paragraph") return;
        const typed = matchTypedTaskMarker(para.textContent);
        if (!typed) return;
        const from = mappedPos + 2;
        const to = from + typed.length;
        apply()
          .delete(from, to)
          .setNodeMarkup(mappedPos, undefined, {
            ...current.attrs,
            checked: typed.marker === "x",
            taskMarker: typed.marker,
          });
      });
      return tr;
    },
  });
});

export const mdLiveTaskItemView = $prose(() => {
  return new Plugin({
    key: new PluginKey("md-live-task-item-view"),
    props: {
      nodeViews: {
        list_item: (node, view, getPos) => {
          const dom = document.createElement("li");
          const button = document.createElement("button");
          button.type = "button";
          button.className = "md-live-task-check";
          button.contentEditable = "false";
          const body = document.createElement("div");
          body.className = "md-live-task-body";
          let current = node;

          const paint = (next: Node) => {
            current = next;
            const marker = mdLiveTaskMarkerOf(next.attrs);
            if (marker == null) {
              dom.className = "";
              delete dom.dataset.itemType;
              delete dom.dataset.taskMarker;
              button.remove();
              if (body.parentNode !== dom) {
                while (dom.firstChild) body.append(dom.firstChild);
                dom.append(body);
              }
              return;
            }
            dom.className = "md-live-task-item";
            dom.dataset.itemType = "task";
            dom.dataset.taskMarker = marker;
            button.dataset.marker = marker;
            button.className = `md-live-task-check ${mdLiveTaskToneClass(marker)}`;
            if (!button.querySelector(".md-live-task-icons")) {
              button.innerHTML = taskIconStack();
            }
            activateTaskIcon(button, marker);
            if (button.parentNode !== dom) {
              dom.prepend(button);
            }
            if (body.parentNode !== dom) {
              while (dom.firstChild && dom.firstChild !== button) body.append(dom.firstChild);
              dom.append(body);
            }
          };

          paint(node);
          button.addEventListener("mousedown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const pos = getPos();
            if (pos == null) return;
            const marker = mdLiveTaskMarkerOf(current.attrs) ?? " ";
            const next = cycleMdLiveTaskMarker(marker);
            view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, {
              ...current.attrs,
              checked: next === "x",
              taskMarker: next,
            }));
          });

          return {
            dom,
            contentDOM: body,
            update: (updated: Node) => {
              if (updated.type.name !== "list_item") return false;
              paint(updated);
              return true;
            },
            ignoreMutation: (mutation: { type: string; target: globalThis.Node }) =>
              mutation.type === "selection" ? false : !body.contains(mutation.target),
          };
        },
      },
    },
  });
});

export const mdLiveTaskListPlugins = [
  mdLiveTaskRemark,
  mdLiveTaskListItem,
  mdLiveTaskFromParagraphRule,
  mdLiveTaskMarkerRule,
  mdLiveTaskTypedDetect,
  mdLiveTaskItemView,
].flat();
