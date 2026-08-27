import type { Node } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";
import { mdLiveLabel } from "./copy";
import { mdLiveTaskMarkerOf } from "./task-list";
import type { MdLiveCopyFn } from "./types";

export function mdLivePlaceholderCopyKey(node: Node, parent: Node | null): string | null {
  switch (node.type.name) {
    case "heading": {
      const level = Number(node.attrs.level);
      if (level >= 1 && level <= 6) return `slashHeading${level}`;
      return "slashHeading1";
    }
    case "details_summary":
      return "slashToggle";
    case "code_block":
      return "slashCode";
    case "paragraph": {
      if (!parent) return "placeholderEmptyLine";
      if (parent.type.name === "blockquote") return "slashQuote";
      if (parent.type.name === "table_cell" || parent.type.name === "table_header") {
        return "slashTable";
      }
      if (parent.type.name === "list_item") {
        if (mdLiveTaskMarkerOf(parent.attrs) != null) return "slashTaskList";
        if (parent.attrs.listType === "ordered") return "slashOrderedList";
        return "slashBulletList";
      }
      return "placeholderEmptyLine";
    }
    default:
      return null;
  }
}

function placeholderAt(view: EditorView): {
  pos: number;
  key: string;
  nodeDOM: HTMLElement | null;
} | null {
  if (!view.hasFocus()) return null;
  const { $from, empty } = view.state.selection;
  if (!empty) return null;
  const node = $from.parent;
  if (!node.isTextblock || node.content.size > 0) return null;
  const parent = $from.depth > 0 ? $from.node($from.depth - 1) : null;
  const key = mdLivePlaceholderCopyKey(node, parent);
  if (!key) return null;
  const pos = $from.start();
  const nodeDOM = view.nodeDOM($from.before($from.depth));
  return {
    pos,
    key,
    nodeDOM: nodeDOM instanceof HTMLElement ? nodeDOM : null,
  };
}

function createPlaceholderLayer(
  view: EditorView,
  getCopy: () => MdLiveCopyFn | undefined,
) {
  const layer = document.createElement("div");
  layer.className = "md-live-placeholder-layer";
  layer.setAttribute("aria-hidden", "true");
  const labelEl = document.createElement("span");
  labelEl.className = "md-live-placeholder-label";
  layer.append(labelEl);
  const host = view.dom.closest(".md-live") ?? view.dom.parentElement ?? view.dom;
  host.append(layer);

  let currentKey: string | null = null;
  let fadeTimer = 0;
  let visible = false;

  const hide = () => {
    if (!visible && !currentKey) return;
    labelEl.classList.remove("is-visible");
    visible = false;
    currentKey = null;
  };

  const sync = () => {
    const info = placeholderAt(view);
    if (!info) {
      hide();
      return;
    }
    const coords = view.coordsAtPos(info.pos);
    const clip = view.dom.getBoundingClientRect();
    if (coords.top < clip.top - 8 || coords.top > clip.bottom - 4) {
      hide();
      return;
    }
    const hostBox = host.getBoundingClientRect();
    const caretHeight = Math.max(coords.bottom - coords.top, 1);
    const fontSizePx = info.nodeDOM ? Number.parseFloat(getComputedStyle(info.nodeDOM).fontSize) : Number.NaN;
    const gap = Math.max(6, Math.round((Number.isFinite(fontSizePx) ? fontSizePx : 14) * 0.4));
    layer.style.left = `${coords.left - hostBox.left + host.scrollLeft + gap}px`;
    layer.style.top = `${coords.top - hostBox.top + host.scrollTop}px`;
    layer.style.height = `${caretHeight}px`;
    if (info.nodeDOM) {
      const style = getComputedStyle(info.nodeDOM);
      labelEl.style.fontSize = style.fontSize;
      labelEl.style.fontWeight = style.fontWeight;
      labelEl.style.fontFamily = style.fontFamily;
      labelEl.style.letterSpacing = style.letterSpacing;
    }
    const text = mdLiveLabel(info.key, getCopy());
    if (info.key === currentKey) {
      if (!visible) {
        labelEl.textContent = text;
        labelEl.classList.add("is-visible");
        visible = true;
      }
      return;
    }
    window.clearTimeout(fadeTimer);
    const swap = () => {
      labelEl.textContent = text;
      void labelEl.offsetWidth;
      labelEl.classList.add("is-visible");
      visible = true;
      currentKey = info.key;
    };
    if (visible) {
      labelEl.classList.remove("is-visible");
      fadeTimer = window.setTimeout(swap, 160);
    } else {
      swap();
    }
  };

  const onScroll = () => sync();
  const scroller = view.dom.closest("#editor-preview-root") ?? host;
  view.dom.addEventListener("scroll", onScroll, true);
  scroller.addEventListener("scroll", onScroll);
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", onScroll);

  sync();

  return {
    update: sync,
    destroy: () => {
      window.clearTimeout(fadeTimer);
      view.dom.removeEventListener("scroll", onScroll, true);
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      layer.remove();
    },
  };
}

export function mdLivePlaceholderPlugin(getCopy: () => MdLiveCopyFn | undefined) {
  return $prose(() => {
    return new Plugin({
      key: new PluginKey("mdLivePlaceholder"),
      view: (view) => createPlaceholderLayer(view, getCopy),
    });
  });
}
