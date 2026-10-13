/**
 * The space preview scales live pages with a CSS transform. That changes
 * `getBoundingClientRect` to the card, and `ResizeObserver` does not fire
 * when the transform is removed, so a page keeps the card size.
 *
 * While a posed surface is on screen, measurements inside it report the
 * unscaled layout box. The preview still draws the scaled card. Pages do
 * not each need to know the gallery is open.
 */

export const CENTER_SPACE_LAYOUT_SHIELD_ATTR = "data-center-space-layout-shield";
const POSE_ATTR = "data-center-space-posed";

type Box = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Inverse of a transform-origin `0 0` pose. `rootVisual / rootLayout` is the
 * scale currently on screen, including a transition that has not settled.
 */
export function layoutClientRect(input: {
  rootVisual: Box;
  rootLayout: Box;
  visual: Box;
}): Box {
  const scaleX = input.rootLayout.width > 0 ? input.rootVisual.width / input.rootLayout.width : 0;
  const scaleY = input.rootLayout.height > 0 ? input.rootVisual.height / input.rootLayout.height : 0;
  if (!(scaleX > 0) || !(scaleY > 0) || !Number.isFinite(scaleX) || !Number.isFinite(scaleY)) {
    return {
      left: input.visual.left,
      top: input.visual.top,
      width: input.visual.width,
      height: input.visual.height,
    };
  }
  return {
    left: input.rootLayout.left + (input.visual.left - input.rootVisual.left) / scaleX,
    top: input.rootLayout.top + (input.visual.top - input.rootVisual.top) / scaleY,
    width: input.visual.width / scaleX,
    height: input.visual.height / scaleY,
  };
}

let installed = false;
let originalRect: typeof Element.prototype.getBoundingClientRect | null = null;
let originalRects: typeof Element.prototype.getClientRects | null = null;
let originalRangeRect: typeof Range.prototype.getBoundingClientRect | null = null;
let originalRangeRects: typeof Range.prototype.getClientRects | null = null;

function posedRoot(start: Node | null): HTMLElement | null {
  let current: Node | null = start;
  for (let depth = 0; current && depth < 64; depth += 1) {
    if (current instanceof HTMLElement && current.hasAttribute(POSE_ATTR)) return current;
    const parent = current instanceof Element ? current.parentElement : current.parentNode;
    if (parent) {
      current = parent;
      continue;
    }
    const root = current.getRootNode();
    if (root instanceof ShadowRoot && root.host !== current) {
      current = root.host;
      continue;
    }
    return null;
  }
  return null;
}

function toDOMRect(box: Box): DOMRect {
  return new DOMRect(box.left, box.top, box.width, box.height);
}

function layoutOrigin(el: HTMLElement, depth: number): Box | null {
  if (depth > 8) return null;
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  if (width < 1 || height < 1) return null;
  const parent = el.offsetParent instanceof HTMLElement ? el.offsetParent : el.parentElement;
  if (!(parent instanceof HTMLElement) || !originalRect) return null;
  const parentVisual = originalRect.call(parent);
  const parentRoot = posedRoot(parent);
  const parentBox = parentRoot ? mappedBox(parentVisual, parentRoot, depth + 1) : parentVisual;
  if (!parentBox) return null;
  const style = getComputedStyle(parent);
  const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
  const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
  return {
    left: parentBox.left + borderLeft + el.offsetLeft,
    top: parentBox.top + borderTop + el.offsetTop,
    width,
    height,
  };
}

function mappedBox(visual: DOMRect, root: HTMLElement, depth: number): Box | null {
  if (!originalRect) return null;
  let rootLayout: Box | null = null;
  try {
    rootLayout = layoutOrigin(root, depth);
  } catch {
    rootLayout = null;
  }
  if (!rootLayout) return null;
  // Always the posed root's own visual box. A selection rect that starts at
  // the root is smaller than the root and must not be used as the scale.
  const rootVisual = originalRect.call(root);
  return layoutClientRect({ rootVisual, rootLayout, visual });
}

function patchedRect(this: Element): DOMRect {
  const visual = originalRect!.call(this);
  if (!installed) return visual;
  const root = posedRoot(this);
  if (!root) return visual;
  const mapped = mappedBox(visual, root, 0);
  return mapped ? toDOMRect(mapped) : visual;
}

function asRectList(rects: DOMRect[]): DOMRectList {
  const list = {
    length: rects.length,
    item(index: number) {
      return rects[index] ?? null;
    },
    *[Symbol.iterator]() {
      yield* rects;
    },
  } as DOMRectList;
  for (let index = 0; index < rects.length; index += 1) {
    (list as unknown as Record<number, DOMRect>)[index] = rects[index]!;
  }
  return list;
}

function patchedRects(this: Element): DOMRectList {
  const list = originalRects!.call(this);
  if (!installed) return list;
  const root = posedRoot(this);
  if (!root) return list;
  const rects: DOMRect[] = [];
  for (let index = 0; index < list.length; index += 1) {
    const visual = list.item(index);
    if (!visual) continue;
    const mapped = mappedBox(visual, root, 0);
    if (!mapped) return list;
    rects.push(toDOMRect(mapped));
  }
  return asRectList(rects);
}

function rangeElement(range: Range): Element | null {
  const node = range.commonAncestorContainer;
  if (node instanceof Element) return node;
  return node.parentElement;
}

function patchedRangeRect(this: Range): DOMRect {
  const visual = originalRangeRect!.call(this);
  if (!installed || !originalRect) return visual;
  const el = rangeElement(this);
  const root = el ? posedRoot(el) : null;
  if (!root) return visual;
  const mapped = mappedBox(visual, root, 0);
  return mapped ? toDOMRect(mapped) : visual;
}

function patchedRangeRects(this: Range): DOMRectList {
  const list = originalRangeRects!.call(this);
  if (!installed || !originalRect) return list;
  const el = rangeElement(this);
  const root = el ? posedRoot(el) : null;
  if (!root) return list;
  const rects: DOMRect[] = [];
  for (let index = 0; index < list.length; index += 1) {
    const visual = list.item(index);
    if (!visual) continue;
    const mapped = mappedBox(visual, root, 0);
    if (!mapped) return list;
    rects.push(toDOMRect(mapped));
  }
  return asRectList(rects);
}

/** Idempotent. Call after the slot pose is known and before the transform is set. */
export function engageCenterSpaceLayoutShield(): void {
  if (installed || typeof Element === "undefined" || typeof document === "undefined") return;
  installed = true;
  originalRect = Element.prototype.getBoundingClientRect;
  originalRects = Element.prototype.getClientRects;
  Element.prototype.getBoundingClientRect = patchedRect;
  Element.prototype.getClientRects = patchedRects;
  if (typeof Range !== "undefined") {
    originalRangeRect = Range.prototype.getBoundingClientRect;
    originalRangeRects = Range.prototype.getClientRects;
    Range.prototype.getBoundingClientRect = patchedRangeRect;
    Range.prototype.getClientRects = patchedRangeRects;
  }
  document.documentElement?.setAttribute(CENTER_SPACE_LAYOUT_SHIELD_ATTR, "");
}

/** Call only after posed transforms and `data-center-space-posed` are gone. */
export function releaseCenterSpaceLayoutShield(): void {
  if (!installed) return;
  installed = false;
  if (originalRect) Element.prototype.getBoundingClientRect = originalRect;
  if (originalRects) Element.prototype.getClientRects = originalRects;
  if (originalRangeRect) Range.prototype.getBoundingClientRect = originalRangeRect;
  if (originalRangeRects) Range.prototype.getClientRects = originalRangeRects;
  originalRect = null;
  originalRects = null;
  originalRangeRect = null;
  originalRangeRects = null;
  if (typeof document !== "undefined") {
    document.documentElement?.removeAttribute(CENTER_SPACE_LAYOUT_SHIELD_ATTR);
  }
}
