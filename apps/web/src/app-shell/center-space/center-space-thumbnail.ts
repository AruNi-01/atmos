import { toJpeg } from "html-to-image";

/** Preview-only size — fan cards are ~148×92. */
const THUMB_WIDTH = 96;
const THUMB_HEIGHT = 60;
const JPEG_QUALITY = 0.32;

/**
 * Copy only layout/color. html-to-image's default walks every computed
 * property on every node and is why hover capture hitchs the UI.
 */
const THUMB_STYLE_PROPS = [
  "background",
  "background-color",
  "background-image",
  "background-size",
  "background-position",
  "color",
  "display",
  "visibility",
  "opacity",
  "position",
  "top",
  "left",
  "right",
  "bottom",
  "width",
  "height",
  "min-width",
  "min-height",
  "overflow",
  "overflow-x",
  "overflow-y",
  "border",
  "border-radius",
  "border-color",
  "box-sizing",
  "padding",
  "margin",
  "flex",
  "flex-direction",
  "flex-wrap",
  "align-items",
  "justify-content",
  "gap",
  "transform",
  "object-fit",
];

let captureEpoch = 0;

function canCapture(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function yieldToIdle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => resolve(), { timeout: 800 });
      return;
    }
    window.setTimeout(resolve, 0);
  });
}

function skipHeavyNode(node: HTMLElement): boolean {
  if (!(node instanceof HTMLElement)) return true;
  const tag = node.tagName;
  if (tag === "CANVAS" || tag === "IFRAME" || tag === "VIDEO" || tag === "WEBVIEW") {
    return false;
  }
  if (node.getAttribute("data-center-space-switcher") != null) return false;
  // Panel host is terminals/editors — skip the whole tree.
  if (node.getAttribute("data-center-panel-host") != null) return false;
  if (node.classList.contains("xterm") || node.classList.contains("cm-editor")) {
    return false;
  }
  return true;
}

function cardBackground(card: HTMLElement): string {
  return getComputedStyle(card).backgroundColor || "transparent";
}

/** Drop an in-flight capture so a space switch does not apply a stale shot. */
export function invalidateCenterSpaceThumbnailCapture(): void {
  captureEpoch += 1;
}

/**
 * Tiny JPEG of the live center chrome. Quality is a color/layout hint only.
 * Work starts on idle so hover/click are never blocked.
 */
export async function captureCenterSpaceThumbnail(): Promise<string | null> {
  if (!canCapture()) return null;
  const epoch = ++captureEpoch;
  await yieldToIdle();
  if (epoch !== captureEpoch) return null;
  const card = document.querySelector<HTMLElement>("[data-center-stage-card]");
  if (!card) return null;
  const rect = card.getBoundingClientRect();
  if (rect.width < 40 || rect.height < 40) return null;
  const scale = THUMB_WIDTH / rect.width;
  try {
    const dataUrl = await toJpeg(card, {
      quality: JPEG_QUALITY,
      pixelRatio: 1,
      skipFonts: true,
      cacheBust: false,
      includeStyleProperties: THUMB_STYLE_PROPS,
      backgroundColor: cardBackground(card),
      canvasWidth: THUMB_WIDTH,
      canvasHeight: THUMB_HEIGHT,
      width: THUMB_WIDTH,
      height: THUMB_HEIGHT,
      style: {
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      },
      filter: skipHeavyNode,
      onImageErrorHandler: () => {},
    });
    if (epoch !== captureEpoch) return null;
    return dataUrl || null;
  } catch {
    return null;
  }
}

/** Decode so the fan's <img> does not hitch on first paint. */
export function decodeCenterSpaceThumbnail(
  src: string | null | undefined,
): Promise<void> {
  if (!src || typeof Image === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}
