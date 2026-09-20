import BananaSlug from "github-slugger";
import { commonmark, syncHeadingIdPlugin } from "@milkdown/kit/preset/commonmark";
import type { Node } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";
import { isMdLiveComposing, mdLiveCompositionDomHandlers } from "./composing";

/** Commonmark without Milkdown's live heading-id sync (it recreates headings during IME). */
export const mdLiveCommonmark = commonmark.filter((plugin) => plugin !== syncHeadingIdPlugin);

export function slugMdLiveHeading(text: string, slugger = new BananaSlug()): string {
  return slugger.slug(text);
}

export function syncMdLiveHeadingIds(state: EditorState): Transaction | null {
  const slugger = new BananaSlug();
  let tr: Transaction | null = null;
  const idMap: Record<string, number> = {};
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    if (node.textContent.trim().length === 0) {
      if (!node.attrs.id) return;
      tr ??= state.tr.setMeta("addToHistory", false);
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: "" });
      return;
    }
    let id = slugger.slug(node.textContent);
    if (idMap[id]) {
      idMap[id] += 1;
      id = `${id}-#${idMap[id]}`;
    } else {
      idMap[id] = 1;
    }
    if (node.attrs.id === id) return;
    tr ??= state.tr.setMeta("addToHistory", false);
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, id });
  });
  return tr;
}

function headingTag(level: unknown): string {
  const n = Number(level);
  const clamped = Number.isFinite(n) ? Math.min(6, Math.max(1, n)) : 1;
  return `h${clamped}`;
}

function applyHeadingId(dom: HTMLElement, node: Node): void {
  const id = typeof node.attrs.id === "string" ? node.attrs.id : "";
  if (id) dom.id = id;
  else dom.removeAttribute("id");
}

function headingNodeView(node: Node) {
  const tag = headingTag(node.attrs.level);
  const dom = document.createElement(tag);
  applyHeadingId(dom, node);
  return {
    dom,
    contentDOM: dom,
    update: (updated: Node) => {
      if (updated.type.name !== "heading") return false;
      if (headingTag(updated.attrs.level) !== tag) return false;
      applyHeadingId(dom, updated);
      return true;
    },
  };
}

export const mdLiveHeadingIdPlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey("md-live-heading-id"),
    props: {
      handleDOMEvents: mdLiveCompositionDomHandlers,
      nodeViews: {
        heading: headingNodeView,
      },
    },
    view: (editorView) => {
      const run = (view: typeof editorView) => {
        if (isMdLiveComposing(view)) return;
        const tr = syncMdLiveHeadingIds(view.state);
        if (tr) view.dispatch(tr);
      };
      run(editorView);
      return {
        update: (view, prev) => {
          if (isMdLiveComposing(view)) return;
          if (view.state.doc.eq(prev.doc)) return;
          run(view);
        },
      };
    },
  });
});
