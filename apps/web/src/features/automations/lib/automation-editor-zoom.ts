import {
  CENTER_STAGE_CARD_ATTR,
  CENTER_STAGE_CARD_CLIP_ATTR,
} from "@/app-shell/sidebar-layout-constants";

export type AutomationEditorBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export const AUTOMATION_EDITOR_ZOOM_MS = 320;
export const AUTOMATION_EDITOR_ZOOM_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
/** Interpolable rest transform. `none` cannot tween with translate/scale. */
export const AUTOMATION_EDITOR_ZOOM_IDENTITY = "translate(0px, 0px) scale(1, 1)";

const CENTER_STAGE_CARD_SELECTOR = `[${CENTER_STAGE_CARD_ATTR}]`;
const CENTER_STAGE_CARD_CLIP_SELECTOR = `[${CENTER_STAGE_CARD_CLIP_ATTR}]`;

function clipOfCard(card: HTMLElement): HTMLElement {
  return card.querySelector<HTMLElement>(CENTER_STAGE_CARD_CLIP_SELECTOR) ?? card;
}

/** Expand into the rounded center card, not the gutter/overlay around it. */
export function queryAutomationEditorExpandTarget(
  from: HTMLElement | null,
): HTMLElement | null {
  if (from) {
    const card = from.closest<HTMLElement>(CENTER_STAGE_CARD_SELECTOR);
    if (card) return clipOfCard(card);
  }
  if (typeof document === "undefined") return from;
  const card =
    document.querySelector<HTMLElement>(
      `[data-launchpad-center-overlay] ${CENTER_STAGE_CARD_SELECTOR}`,
    ) ?? document.querySelector<HTMLElement>(CENTER_STAGE_CARD_SELECTOR);
  return card ? clipOfCard(card) : from;
}

/** Let a fixed overlay paint past clipped ancestors up to `to`. */
export function releaseOverflowAlongPath(from: HTMLElement, to: HTMLElement): () => void {
  const previous: Array<{ el: HTMLElement; overflow: string }> = [];
  let el: HTMLElement | null = from;
  while (el) {
    const computed = getComputedStyle(el);
    if (computed.overflowX !== "visible" || computed.overflowY !== "visible") {
      previous.push({ el, overflow: el.style.overflow });
      el.style.overflow = "visible";
    }
    if (el === to) break;
    el = el.parentElement;
  }
  return () => {
    for (const item of previous) {
      item.el.style.overflow = item.overflow;
    }
  };
}

export function rectToEditorBox(rect: Pick<DOMRect, "top" | "left" | "width" | "height">): AutomationEditorBox {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

/** Transform that makes an element laid out at `layout` look like `visual`. */
export function zoomLookTransform(
  visual: AutomationEditorBox,
  layout: AutomationEditorBox,
): { x: number; y: number; scaleX: number; scaleY: number } {
  return {
    x: visual.left - layout.left,
    y: visual.top - layout.top,
    scaleX: layout.width === 0 ? 1 : visual.width / layout.width,
    scaleY: layout.height === 0 ? 1 : visual.height / layout.height,
  };
}

export function zoomTransformCss(visual: AutomationEditorBox, layout: AutomationEditorBox): string {
  const { x, y, scaleX, scaleY } = zoomLookTransform(visual, layout);
  return `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`;
}

export function boxRelativeTo(
  box: AutomationEditorBox,
  origin: Pick<AutomationEditorBox, "top" | "left">,
): AutomationEditorBox {
  return {
    top: box.top - origin.top,
    left: box.left - origin.left,
    width: box.width,
    height: box.height,
  };
}

/**
 * Viewport box → coordinates inside a scrolled `position: relative` clip.
 * Absolute `top: 0` is the scroll content origin, so visible fill uses `scrollTop`.
 */
export function boxRelativeToClip(
  viewport: AutomationEditorBox,
  clip: HTMLElement,
): AutomationEditorBox {
  const relative = boxRelativeTo(viewport, rectToEditorBox(clip.getBoundingClientRect()));
  return {
    ...relative,
    top: relative.top + clip.scrollTop,
    left: relative.left + clip.scrollLeft,
  };
}

/** Cover the clip's visible viewport, not the scrolled content origin. */
export function fillVisibleClipBox(clip: HTMLElement): AutomationEditorBox {
  const clipRect = rectToEditorBox(clip.getBoundingClientRect());
  return {
    top: clip.scrollTop,
    left: clip.scrollLeft,
    width: clipRect.width,
    height: clipRect.height,
  };
}

/** `position: fixed` is relative to a transformed/filtered ancestor, not the viewport. */
export function findFixedContainingBlock(el: HTMLElement): HTMLElement | null {
  let parent = el.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    const willChange = style.willChange;
    if (
      style.transform !== "none" ||
      style.filter !== "none" ||
      style.perspective !== "none" ||
      style.contain === "paint" ||
      willChange.includes("transform") ||
      willChange.includes("filter") ||
      willChange.includes("perspective")
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

export function applyFixedEditorBox(
  el: HTMLElement,
  viewportBox: AutomationEditorBox,
  options?: { zIndex?: number },
): void {
  const containing = findFixedContainingBlock(el);
  const origin = containing
    ? rectToEditorBox(containing.getBoundingClientRect())
    : { top: 0, left: 0, width: 0, height: 0 };
  const box = boxRelativeTo(viewportBox, origin);
  el.style.position = "fixed";
  el.style.top = `${box.top}px`;
  el.style.left = `${box.left}px`;
  el.style.width = `${box.width}px`;
  el.style.height = `${box.height}px`;
  el.style.right = "auto";
  el.style.bottom = "auto";
  el.style.margin = "0";
  el.style.zIndex = String(options?.zIndex ?? 40);
  el.style.boxSizing = "border-box";
}

export function clearFixedEditorBox(el: HTMLElement): void {
  el.style.position = "";
  el.style.top = "";
  el.style.left = "";
  el.style.width = "";
  el.style.height = "";
  el.style.right = "";
  el.style.bottom = "";
  el.style.inset = "";
  el.style.margin = "";
  el.style.zIndex = "";
  el.style.boxSizing = "";
  el.style.transform = "";
  el.style.transition = "";
  el.style.transformOrigin = "";
  el.style.willChange = "";
}

/** Pixel box inside a `position: relative` clip. Prefer this over scale so borders stay 1px. */
export function applyRelativeEditorBox(el: HTMLElement, box: AutomationEditorBox): void {
  el.style.position = "absolute";
  el.style.top = `${box.top}px`;
  el.style.left = `${box.left}px`;
  el.style.width = `${box.width}px`;
  el.style.height = `${box.height}px`;
  el.style.right = "auto";
  el.style.bottom = "auto";
  el.style.margin = "0";
  el.style.boxSizing = "border-box";
}

export function automationEditorZoomTransition(durationMs = AUTOMATION_EDITOR_ZOOM_MS): string {
  return [
    `top ${durationMs}ms ${AUTOMATION_EDITOR_ZOOM_EASE}`,
    `left ${durationMs}ms ${AUTOMATION_EDITOR_ZOOM_EASE}`,
    `width ${durationMs}ms ${AUTOMATION_EDITOR_ZOOM_EASE}`,
    `height ${durationMs}ms ${AUTOMATION_EDITOR_ZOOM_EASE}`,
    `border-color ${durationMs}ms ${AUTOMATION_EDITOR_ZOOM_EASE}`,
    `border-radius ${durationMs}ms ${AUTOMATION_EDITOR_ZOOM_EASE}`,
  ].join(", ");
}
