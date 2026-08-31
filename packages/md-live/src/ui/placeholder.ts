import type { Node } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, type PluginSpec } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";
import { mdLiveLabel } from "./copy";
import { mdLiveTaskMarkerOf } from "./task-list";
import { mdLiveMarkdownHeadingLevelOf, type MdLiveCopyFn } from "./types";

/** Same `EditorView` as `PluginSpec.view`, not `@milkdown/kit/prose/view` (duplicate copies). */
type MdLiveEditorView = Parameters<NonNullable<PluginSpec<unknown>["view"]>>[0];

export function mdLivePlaceholderTravel(
  fromY: number,
  toY: number,
  fromFontPx: number,
  toFontPx: number,
): { dir: -1 | 0 | 1; startScale: number } {
  const dir = toY > fromY + 1 ? 1 : toY < fromY - 1 ? -1 : 0;
  const raw = toFontPx > 0 ? fromFontPx / toFontPx : 1;
  const startScale = Math.min(2.4, Math.max(0.42, raw));
  return { dir, startScale };
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

function parsePx(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 16;
}

function readMatrix(el: HTMLElement): { x: number; y: number; scale: number } {
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return { x: 0, y: 0, scale: 1 };
  const m = new DOMMatrixReadOnly(t);
  return { x: m.e, y: m.f, scale: m.a || 1 };
}

type PlaceholderPose = {
  x: number;
  y: number;
  h: number;
  fontSize: string;
  fontWeight: string;
  fontFamily: string;
  letterSpacing: string;
  key: string;
  text: string;
};

const MOVE_MS = 200;
const TEXT_MS = 160;

function placeholderTypeStyle(key: string): { fontSize: string; fontWeight: string } {
  switch (key) {
    case "slashHeading1":
      return { fontSize: "2.5em", fontWeight: "700" };
    case "slashHeading2":
      return { fontSize: "1.75em", fontWeight: "700" };
    case "slashHeading3":
      return { fontSize: "1.4em", fontWeight: "600" };
    case "slashHeading4":
      return { fontSize: "1.2em", fontWeight: "600" };
    case "slashHeading5":
      return { fontSize: "1.1em", fontWeight: "600" };
    case "slashHeading6":
      return { fontSize: "1em", fontWeight: "600" };
    default:
      return { fontSize: "14px", fontWeight: "400" };
  }
}

export function mdLivePlaceholderCopyKey(node: Node, parent: Node | null): string | null {
  switch (node.type.name) {
    case "heading": {
      const level = mdLiveMarkdownHeadingLevelOf(node.attrs.level);
      return `slashHeading${level ?? 1}`;
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

function placeholderAt(view: MdLiveEditorView): {
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
  let nodeDOM: HTMLElement | null = null;
  try {
    const raw = view.nodeDOM($from.before($from.depth));
    nodeDOM = raw instanceof HTMLElement ? raw : null;
  } catch {
    nodeDOM = null;
  }
  return { pos, key, nodeDOM };
}

function createPlaceholderLayer(
  view: MdLiveEditorView,
  getCopy: () => MdLiveCopyFn | undefined,
) {
  const layer = document.createElement("div");
  layer.className = "md-live-placeholder-layer";
  layer.setAttribute("aria-hidden", "true");
  const morph = document.createElement("div");
  morph.className = "md-live-placeholder-morph";
  const labels = [0, 1].map(() => {
    const el = document.createElement("span");
    el.className = "md-live-placeholder-label";
    morph.append(el);
    return el;
  });
  layer.append(morph);
  const host = view.dom.closest(".md-live") ?? view.dom.parentElement ?? view.dom;
  host.append(layer);

  let currentKey: string | null = null;
  let visible = false;
  let active = 0;
  let targetFontPx = 16;
  let lastX = 0;
  let lastY = 0;
  let hideTimer = 0;
  let swapTimer = 0;
  let moveTimer = 0;

  const clearTimers = () => {
    window.clearTimeout(hideTimer);
    window.clearTimeout(swapTimer);
    window.clearTimeout(moveTimer);
  };

  const setTranslate = (x: number, y: number, animate: boolean) => {
    layer.classList.toggle("is-moving", animate);
    layer.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };

  const setScale = (scale: number, animate: boolean) => {
    morph.classList.toggle("is-moving", animate);
    morph.style.transform = `scale(${scale})`;
  };

  const applyType = (pose: PlaceholderPose) => {
    layer.style.height = `${pose.h}px`;
    layer.style.fontSize = pose.fontSize;
    layer.style.fontWeight = pose.fontWeight;
    layer.style.fontFamily = pose.fontFamily;
    layer.style.letterSpacing = pose.letterSpacing;
    targetFontPx = parsePx(pose.fontSize);
  };

  const resetLabel = (el: HTMLElement) => {
    el.classList.remove("is-visible", "is-enter", "is-leave");
    el.style.removeProperty("--md-live-ph-enter");
    el.style.removeProperty("--md-live-ph-leave");
  };

  const poseAt = (): PlaceholderPose | null => {
    const info = placeholderAt(view);
    if (!info) return null;
    try {
      const coords = view.coordsAtPos(info.pos);
      const clip = view.dom.getBoundingClientRect();
      if (coords.top < clip.top - 8 || coords.top > clip.bottom - 4) return null;
      const hostBox = host.getBoundingClientRect();
      const type = placeholderTypeStyle(info.key);
      let x = coords.left - hostBox.left + host.scrollLeft;
      if (info.nodeDOM) {
        const paddingLeft = parsePx(getComputedStyle(info.nodeDOM).paddingLeft);
        x = info.nodeDOM.getBoundingClientRect().left + paddingLeft - hostBox.left + host.scrollLeft;
      }
      return {
        x,
        y: coords.top - hostBox.top + host.scrollTop,
        h: Math.max(coords.bottom - coords.top, 1),
        fontSize: type.fontSize,
        fontWeight: type.fontWeight,
        fontFamily: "inherit",
        letterSpacing: "normal",
        key: info.key,
        text: mdLiveLabel(info.key, getCopy()),
      };
    } catch {
      return null;
    }
  };

  const hide = (animate: boolean) => {
    if (!visible && !currentKey) return;
    clearTimers();
    layer.classList.remove("is-moving");
    morph.classList.remove("is-moving");
    for (const el of labels) {
      el.classList.remove("is-visible", "is-enter");
      if (animate && !prefersReducedMotion()) el.classList.add("is-leave");
      else resetLabel(el);
    }
    visible = false;
    currentKey = null;
    if (!animate || prefersReducedMotion()) {
      for (const el of labels) {
        resetLabel(el);
        el.textContent = "";
      }
      return;
    }
    hideTimer = window.setTimeout(() => {
      for (const el of labels) {
        resetLabel(el);
        el.textContent = "";
      }
    }, TEXT_MS);
  };

  const snapTo = (pose: PlaceholderPose) => {
    clearTimers();
    applyType(pose);
    setTranslate(pose.x, pose.y, false);
    setScale(1, false);
    const incoming = labels[active];
    const outgoing = labels[1 - active];
    resetLabel(outgoing);
    outgoing.textContent = "";
    incoming.textContent = pose.text;
    incoming.classList.remove("is-leave", "is-enter");
    incoming.classList.add("is-visible");
    visible = true;
    currentKey = pose.key;
    lastX = pose.x;
    lastY = pose.y;
  };

  const sync = (animate = false) => {
    const pose = poseAt();
    if (!pose) {
      hide(animate);
      return;
    }
    const reduced = prefersReducedMotion();
    const sameSpot =
      visible
      && currentKey === pose.key
      && Math.abs(pose.x - lastX) < 0.5
      && Math.abs(pose.y - lastY) < 0.5;
    if (sameSpot) {
      applyType(pose);
      return;
    }
    const keyChanged = pose.key !== currentKey;
    const canMorph = animate && !reduced && visible && currentKey != null;
    if (!canMorph) {
      snapTo(pose);
      return;
    }

    const live = readMatrix(layer);
    const liveScale = readMatrix(morph).scale;
    const fromFont = targetFontPx * liveScale;
    const travel = mdLivePlaceholderTravel(live.y, pose.y, fromFont, parsePx(pose.fontSize));

    clearTimers();
    applyType(pose);
    setTranslate(pose.x, pose.y, true);
    setScale(1, true);

    if (keyChanged) {
      setScale(travel.startScale, false);
      const outgoing = labels[active];
      const incoming = labels[1 - active];
      outgoing.style.setProperty("--md-live-ph-leave", `${travel.dir * 8}px`);
      outgoing.classList.remove("is-enter", "is-visible");
      outgoing.classList.add("is-leave");
      incoming.textContent = pose.text;
      incoming.style.setProperty("--md-live-ph-enter", `${travel.dir * 10}px`);
      incoming.classList.remove("is-visible", "is-leave");
      incoming.classList.add("is-enter");
      morph.append(incoming);
      incoming.classList.add("is-visible");
      active = 1 - active;
      setScale(1, true);
      swapTimer = window.setTimeout(() => {
        resetLabel(outgoing);
        outgoing.textContent = "";
      }, TEXT_MS);
    }

    currentKey = pose.key;
    visible = true;
    lastX = pose.x;
    lastY = pose.y;
    moveTimer = window.setTimeout(() => {
      layer.classList.remove("is-moving");
      morph.classList.remove("is-moving");
    }, MOVE_MS);
  };

  let raf = 0;
  const schedule = (animate: boolean) => {
    window.cancelAnimationFrame(raf);
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      sync(animate);
    });
  };

  const onScroll = () => schedule(false);
  const onFocusChange = () => schedule(false);
  const scroller = view.dom.closest("#editor-preview-root") ?? host;
  view.dom.addEventListener("scroll", onScroll, true);
  view.dom.addEventListener("focusin", onFocusChange);
  view.dom.addEventListener("focusout", onFocusChange);
  scroller.addEventListener("scroll", onScroll);
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", onScroll);

  schedule(false);

  return {
    update: () => schedule(true),
    destroy: () => {
      window.cancelAnimationFrame(raf);
      clearTimers();
      view.dom.removeEventListener("scroll", onScroll, true);
      view.dom.removeEventListener("focusin", onFocusChange);
      view.dom.removeEventListener("focusout", onFocusChange);
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
