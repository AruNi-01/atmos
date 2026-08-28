import type { Ctx } from "@milkdown/kit/ctx";
import { editorViewCtx } from "@milkdown/kit/core";
import type { Node } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { $ctx, $nodeSchema, $prose, $remark } from "@milkdown/kit/utils";
import { isMdLiveComposing } from "./composing";
import { remarkMdLiveDetails } from "./toggle-remark";

export const mdLiveToggleDefaultOpenCtx = $ctx(true, "mdLiveToggleDefaultOpen");

function toggleDefaultOpen(ctx: Ctx): boolean {
  try {
    return ctx.get(mdLiveToggleDefaultOpenCtx.key) !== false;
  } catch {
    return true;
  }
}

export const mdLiveDetailsRemark = $remark("mdLiveDetails", () => remarkMdLiveDetails);

export const detailsSummarySchema = $nodeSchema("details_summary", () => ({
  content: "inline*",
  defining: true,
  parseDOM: [{ tag: "div.md-live-toggle-summary" }],
  toDOM: () => ["div", { class: "md-live-toggle-summary" }, 0],
  parseMarkdown: {
    match: (node) => node.type === "detailsSummary",
    runner: (state, node, type) => {
      state.openNode(type);
      if (node.children) state.next(node.children);
      else if (typeof node.value === "string" && node.value) state.addText(node.value);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "details_summary",
    runner: (state, node) => {
      state.openNode("detailsSummary");
      state.next(node.content);
      state.closeNode();
    },
  },
}));

export const detailsSchema = $nodeSchema("details", (ctx) => ({
  content: "details_summary block+",
  group: "block",
  defining: true,
  isolating: true,
  attrs: {
    open: { default: true, validate: "boolean" },
  },
  parseDOM: [{
    tag: "div.md-live-toggle",
    getAttrs: (dom) => ({
      open: !(dom instanceof HTMLElement) || dom.dataset.open !== "false",
    }),
  }],
  toDOM: (node) => [
    "div",
    {
      class: "md-live-toggle",
      "data-open": node.attrs.open ? "true" : "false",
    },
    0,
  ],
  parseMarkdown: {
    match: (node) => node.type === "details",
    runner: (state, node, type) => {
      const fileOpen = (node as { open?: boolean }).open === true;
      state.openNode(type, { open: fileOpen || toggleDefaultOpen(ctx) });
      const children = node.children ?? [];
      if (children[0]?.type !== "detailsSummary") {
        state.openNode(detailsSummarySchema.type(ctx)).closeNode();
      }
      if (children.length) state.next(children);
      const body = children[0]?.type === "detailsSummary" ? children.slice(1) : children;
      if (body.length === 0) {
        const paragraph = state.schema.nodes.paragraph;
        if (paragraph) state.openNode(paragraph).closeNode();
      }
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "details",
    runner: (state, node) => {
      state.openNode("details");
      state.next(node.content);
      state.closeNode();
    },
  },
}));

function detailsDepth($from: { depth: number; node: (depth: number) => Node }): number {
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === "details") return depth;
  }
  return -1;
}

export function insertMdLiveToggle(ctx: Ctx): boolean {
  const view = ctx.get(editorViewCtx);
  const details = detailsSchema.type(ctx);
  const summaryType = detailsSummarySchema.type(ctx);
  const paragraph = view.state.schema.nodes.paragraph;
  if (!details || !summaryType || !paragraph) return false;
  const { state } = view;
  const { $from } = state.selection;
  if (!$from.parent.isTextblock) return false;
  if ($from.parent.type.name === "details_summary") return false;
  const from = $from.before($from.depth);
  const to = $from.after($from.depth);
  const hasTitle = $from.parent.content.size > 0;
  const summary = summaryType.create(
    null,
    hasTitle ? $from.parent.content : undefined,
  );
  const created = details.create({ open: hasTitle || toggleDefaultOpen(ctx) }, [
    summary,
    paragraph.create(),
  ]);
  const tr = state.tr.replaceWith(from, to, created);
  tr.setSelection(TextSelection.create(tr.doc, from + 2));
  view.dispatch(tr.scrollIntoView());
  return true;
}

export const mdLiveToggleView = $prose(() => {
  return new Plugin({
    key: new PluginKey("mdLiveToggleView"),
    props: {
      nodeViews: {
        details: (node, view, getPos) => {
          const dom = document.createElement("div");
          dom.className = "md-live-toggle";
          const chevron = document.createElement("button");
          chevron.type = "button";
          chevron.className = "md-live-toggle-chevron";
          chevron.contentEditable = "false";
          chevron.tabIndex = -1;
          chevron.setAttribute("aria-label", "Toggle");
          chevron.innerHTML = '<span class="md-live-toggle-chevron-icon"></span>';
          const main = document.createElement("div");
          main.className = "md-live-toggle-main";
          dom.append(chevron, main);

          const paint = (current: Node) => {
            const open = current.attrs.open !== false;
            dom.dataset.open = open ? "true" : "false";
            chevron.setAttribute("aria-expanded", open ? "true" : "false");
          };
          paint(node);

          chevron.addEventListener("mousedown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const pos = getPos();
            if (pos == null) return;
            const current = view.state.doc.nodeAt(pos);
            if (!current || current.type.name !== "details") return;
            const nextOpen = current.attrs.open === false;
            let tr = view.state.tr.setNodeMarkup(pos, undefined, {
              ...current.attrs,
              open: nextOpen,
            });
            if (!nextOpen) {
              const $sel = tr.selection.$from;
              for (let depth = $sel.depth; depth > 0; depth -= 1) {
                if ($sel.node(depth).type.name !== "details") continue;
                if ($sel.before(depth) !== pos) break;
                const inSummary = $sel.depth > depth && $sel.node(depth + 1).type.name === "details_summary";
                if (!inSummary) tr = tr.setSelection(TextSelection.create(tr.doc, pos + 2));
                break;
              }
            }
            view.dispatch(tr);
          });

          return {
            dom,
            contentDOM: main,
            update: (updated: Node) => {
              if (updated.type.name !== "details") return false;
              paint(updated);
              return true;
            },
            ignoreMutation: (mutation: { type: string; target: globalThis.Node }) =>
              mutation.type === "selection" ? false : !main.contains(mutation.target),
          };
        },
      },
    },
  });
});

export const mdLiveToggleKeys = $prose((ctx) => {
  return new Plugin({
    key: new PluginKey("mdLiveToggleKeys"),
    props: {
      handleKeyDown(view, event) {
        if (isMdLiveComposing(view)) return false;
        if (event.key !== "Enter" && event.key !== "Backspace") return false;
        if (event.key === "Enter" && event.shiftKey) return false;
        const { state } = view;
        const { $from, empty } = state.selection;
        if (!empty) return false;

        if (event.key === "Enter" && $from.parent.type.name === "details_summary") {
          event.preventDefault();
          const depth = $from.depth - 1;
          if (depth < 0 || $from.node(depth).type.name !== "details") return true;
          const detailsPos = $from.before(depth);
          const details = $from.node(depth);
          let tr = state.tr;
          if (details.attrs.open === false) {
            tr = tr.setNodeMarkup(detailsPos, undefined, { ...details.attrs, open: true });
          }
          const summary = tr.doc.nodeAt(detailsPos)?.firstChild;
          const afterSummary = detailsPos + 1 + (summary?.nodeSize ?? 0);
          const firstBody = tr.doc.nodeAt(afterSummary);
          if (firstBody) {
            tr = tr.setSelection(TextSelection.create(tr.doc, afterSummary + 1));
          }
          view.dispatch(tr.scrollIntoView());
          return true;
        }

        const depth = detailsDepth($from);
        if (depth < 0) return false;
        const details = $from.node(depth);
        const detailsPos = $from.before(depth);
        const paragraph = state.schema.nodes.paragraph;
        if (!paragraph) return false;

        if (
          event.key === "Enter"
          && $from.parent.type.name === "paragraph"
          && $from.parent.content.size === 0
          && $from.index(depth) === details.childCount - 1
        ) {
          event.preventDefault();
          const after = detailsPos + details.nodeSize;
          const tr = state.tr.insert(after, paragraph.create());
          view.dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView());
          return true;
        }

        if (event.key !== "Backspace" || $from.parentOffset !== 0) return false;

        if ($from.parent.type.name === "details_summary" && $from.parent.content.size === 0) {
          event.preventDefault();
          const body: Node[] = [];
          details.forEach((child, _offset, index) => {
            if (index === 0) return;
            body.push(child);
          });
          const replacement = body.length ? body : [paragraph.create()];
          const tr = state.tr.replaceWith(detailsPos, detailsPos + details.nodeSize, replacement);
          view.dispatch(tr.setSelection(TextSelection.create(tr.doc, detailsPos + 1)).scrollIntoView());
          return true;
        }

        if (
          $from.parent.type.name === "paragraph"
          && $from.index(depth) === 1
          && $from.parent.content.size === 0
        ) {
          event.preventDefault();
          view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, detailsPos + 2)));
          return true;
        }
        return false;
      },
    },
  });
});

export function applyMdLiveToggleDefaultOpen(ctx: Ctx, open: boolean): void {
  ctx.set(mdLiveToggleDefaultOpenCtx.key, open);
  const view = ctx.get(editorViewCtx);
  const positions: number[] = [];
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === "details" && node.attrs.open !== open) positions.push(pos);
  });
  if (positions.length === 0) return;
  let tr = view.state.tr.setMeta("addToHistory", false);
  for (const pos of positions) {
    const node = tr.doc.nodeAt(pos);
    if (!node || node.type.name !== "details") continue;
    tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, open });
  }
  view.dispatch(tr);
}

export const mdLiveTogglePlugins = [
  mdLiveToggleDefaultOpenCtx,
  mdLiveDetailsRemark,
  detailsSummarySchema,
  detailsSchema,
  mdLiveToggleView,
  mdLiveToggleKeys,
].flat();
