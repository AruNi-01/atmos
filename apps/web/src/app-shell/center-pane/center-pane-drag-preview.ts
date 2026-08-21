/** Place an overlay panel onto a leaf-sized live preview. */
export function panePreviewBoxRelativeToLeaf(
  leaf: { left: number; top: number },
  panel: { left: number; top: number; width: number; height: number },
): { left: number; top: number; width: number; height: number } {
  return {
    left: panel.left - leaf.left,
    top: panel.top - leaf.top,
    width: panel.width,
    height: panel.height,
  };
}

export function isUsablePreviewRect(rect: {
  width: number;
  height: number;
}): boolean {
  return rect.width >= 8 && rect.height >= 8;
}

/** Overlay panels for this pane live in the active workspace frame, not the leaf. */
export function queryCenterPaneOverlayPanels(paneId: string): HTMLElement[] {
  if (typeof document === "undefined" || !paneId) return [];
  const selector = `[data-workspace-frame][data-tier="active"] [data-center-pane-owner="${CSS.escape(paneId)}"]`;
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((el) => {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number.parseFloat(style.opacity || "1") <= 0.04) return false;
    return isUsablePreviewRect(el.getBoundingClientRect());
  });
}

function copyCanvasPixels(source: HTMLCanvasElement, dest: HTMLCanvasElement) {
  dest.width = source.width;
  dest.height = source.height;
  try {
    dest.getContext("2d")?.drawImage(source, 0, 0);
  } catch {
    // WebGL/tainted
  }
}

function sanitizePreviewClone(clone: HTMLElement) {
  clone.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  clone
    .querySelectorAll("script, [data-center-pane-drag-handle]")
    .forEach((node) => node.remove());
  clone.style.pointerEvents = "none";
  clone.setAttribute("aria-hidden", "true");
}

function cloneWithCanvasPixels(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  sanitizePreviewClone(clone);
  const srcCanvases = source.querySelectorAll("canvas");
  const destCanvases = clone.querySelectorAll("canvas");
  srcCanvases.forEach((src, index) => {
    const dest = destCanvases[index];
    if (dest) copyCanvasPixels(src, dest);
  });
  return clone;
}

/**
 * Build a leaf-sized DOM snapshot of the pane: tab chrome from the mosaic
 * leaf plus overlay content (terminal/editor/files) that actually paints
 * in the sibling panel host.
 */
export function buildCenterPaneLivePreview(
  leaf: HTMLElement,
  paneId: string,
): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const leafRect = leaf.getBoundingClientRect();
  if (!isUsablePreviewRect(leafRect)) return null;

  const host = document.createElement("div");
  host.setAttribute("data-center-pane-live-preview", "");
  host.style.position = "relative";
  host.style.width = `${leafRect.width}px`;
  host.style.height = `${leafRect.height}px`;
  host.style.overflow = "hidden";
  host.style.background =
    getComputedStyle(leaf).backgroundColor || "var(--background)";
  host.style.pointerEvents = "none";

  const leafClone = cloneWithCanvasPixels(leaf);
  leafClone.style.position = "absolute";
  leafClone.style.inset = "0";
  leafClone.style.width = "100%";
  leafClone.style.height = "100%";
  leafClone.style.margin = "0";
  leafClone.style.transform = "none";
  host.appendChild(leafClone);

  for (const panel of queryCenterPaneOverlayPanels(paneId)) {
    const box = panePreviewBoxRelativeToLeaf(leafRect, panel.getBoundingClientRect());
    const clone = cloneWithCanvasPixels(panel);
    clone.style.position = "absolute";
    clone.style.left = `${box.left}px`;
    clone.style.top = `${box.top}px`;
    clone.style.width = `${box.width}px`;
    clone.style.height = `${box.height}px`;
    clone.style.margin = "0";
    clone.style.right = "auto";
    clone.style.bottom = "auto";
    clone.style.transform = "none";
    clone.style.opacity = "1";
    clone.style.zIndex = "2";
    host.appendChild(clone);
  }

  return host;
}
