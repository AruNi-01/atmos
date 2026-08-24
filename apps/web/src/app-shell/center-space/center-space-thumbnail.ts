import {
  hostIdFromCenterKey,
  makeCenterSpaceKey,
  parseCenterSpaceKey,
} from "@/app-shell/center-space/center-space";
import {
  listXtermPreviewHosts,
  paintXtermBufferInto,
  XTERM_PREVIEW_BG,
} from "@/features/terminal/lib/terminal-xterm-preview";

/** Fan cards are 136×92. */
export const THUMB_WIDTH = 136;
export const THUMB_HEIGHT = 92;
const JPEG_QUALITY = 0.56;
const MIN_BOX = 8;

const SNAP_EXCLUDE = [
  ".xterm",
  ".atmos-terminal",
  ".atmos-terminal-panel-keepalive",
  "iframe",
  "webview",
  "[data-atmos-guest-iframe]",
  "[data-center-space-switcher]",
];

export type ThumbBox = { left: number; top: number; width: number; height: number };
export type ThumbDest = { x: number; y: number; w: number; h: number };

let captureEpoch = 0;
let inflight: Promise<string | null> | null = null;

function canCapture(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/** Skip keepalive / hidden surfaces, but not the warm frame itself (opacity 0). */
export function isSkippedPreviewNode(
  node: HTMLElement,
  stop: HTMLElement,
): boolean {
  let current: HTMLElement | null = node;
  while (current && current !== stop) {
    const style = getComputedStyle(current);
    if (Number.parseFloat(style.opacity || "1") <= 0.04) return true;
    if (style.visibility === "hidden" || style.display === "none") return true;
    current = current.parentElement;
  }
  return false;
}

export function isVisibleInClip(
  rect: { left: number; top: number; right: number; bottom: number },
  clip: { left: number; top: number; right: number; bottom: number },
  pad = 2,
): boolean {
  return (
    rect.right >= clip.left - pad &&
    rect.left <= clip.right + pad &&
    rect.bottom >= clip.top - pad &&
    rect.top <= clip.bottom + pad
  );
}

export function containedDest(
  srcW: number,
  srcH: number,
  boxW: number,
  boxH: number,
): ThumbDest {
  if (srcW <= 0 || srcH <= 0) return { x: 0, y: 0, w: boxW, h: boxH };
  const scale = Math.min(boxW / srcW, boxH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return {
    x: (boxW - w) / 2,
    y: (boxH - h) / 2,
    w,
    h,
  };
}

export function mapInnerRectToDest(
  inner: ThumbBox,
  outer: ThumbBox,
  dest: ThumbDest,
): ThumbDest {
  if (outer.width <= 0 || outer.height <= 0) return dest;
  return {
    x: dest.x + ((inner.left - outer.left) / outer.width) * dest.w,
    y: dest.y + ((inner.top - outer.top) / outer.height) * dest.h,
    w: (inner.width / outer.width) * dest.w,
    h: (inner.height / outer.height) * dest.h,
  };
}

export function queryCenterSpaceFrame(
  hostId: string,
  spaceId: string,
): HTMLElement | null {
  if (!canCapture() || !hostId) return null;
  const key = makeCenterSpaceKey(hostId, spaceId);
  return document.querySelector(
    `[data-workspace-frame="${CSS.escape(key)}"]`,
  );
}

function paintXtermHosts(
  ctx: CanvasRenderingContext2D,
  root: HTMLElement,
  origin: ThumbBox,
  dest: ThumbDest,
): boolean {
  const hosts = listXtermPreviewHosts(root);
  let painted = false;
  for (const { host, terminal } of hosts) {
    if (isSkippedPreviewNode(host, root)) continue;
    const rect = host.getBoundingClientRect();
    const mapped =
      origin.width >= MIN_BOX &&
      origin.height >= MIN_BOX &&
      rect.width >= 2 &&
      rect.height >= 2
        ? mapInnerRectToDest(rect, origin, dest)
        : dest;
    if (mapped.w < 1 || mapped.h < 1) continue;
    paintXtermBufferInto(ctx, terminal, mapped);
    painted = true;
  }
  return painted;
}

/** Live terminal overlay. DOM screenshot cannot read WebGL canvases. */
export function paintCenterSpaceTerminalOverlay(
  ctx: CanvasRenderingContext2D,
  frame: HTMLElement,
  outW: number,
  outH: number,
): boolean {
  ctx.clearRect(0, 0, outW, outH);
  const origin = frame.getBoundingClientRect();
  const dest = containedDest(origin.width, origin.height, outW, outH);
  return paintXtermHosts(ctx, frame, origin, dest);
}

function queryActiveFrame(hostId?: string): HTMLElement | null {
  const frame = document.querySelector<HTMLElement>(
    '[data-workspace-frame][data-tier="active"]',
  );
  if (!frame) return null;
  const key = frame.getAttribute("data-workspace-frame");
  if (!key) return null;
  if (hostId && hostIdFromCenterKey(key) !== hostId) return null;
  return frame;
}

function isActiveCaptureFrame(frame: HTMLElement): boolean {
  return frame.isConnected && frame.getAttribute("data-tier") === "active";
}

async function snapshotFrameToJpeg(frame: HTMLElement): Promise<string | null> {
  if (typeof document !== "undefined" && document.readyState !== "complete") {
    return null;
  }
  if (!isActiveCaptureFrame(frame)) return null;
  const origin = frame.getBoundingClientRect();
  if (origin.width < 40 || origin.height < 40) return null;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const outW = Math.round(THUMB_WIDTH * dpr);
  const outH = Math.round(THUMB_HEIGHT * dpr);
  const dest: ThumbDest = containedDest(origin.width, origin.height, outW, outH);
  const fill =
    getComputedStyle(frame).backgroundColor ||
    getComputedStyle(document.body).backgroundColor ||
    XTERM_PREVIEW_BG;
  const fitScale = Math.min(outW / origin.width, outH / origin.height);

  let canvas: HTMLCanvasElement | null = null;
  try {
    const { snapdom } = await import("@zumer/snapdom");
    if (!isActiveCaptureFrame(frame)) return null;
    canvas = await snapdom.toCanvas(frame, {
      fast: true,
      embedFonts: false,
      compress: true,
      dpr: 1,
      scale: fitScale,
      backgroundColor: fill,
      exclude: SNAP_EXCLUDE,
      excludeMode: "hide",
      // Page coords. Snapdom prunes offscreen subtrees before style inlining.
      clip: {
        x: origin.left + window.scrollX,
        y: origin.top + window.scrollY,
        width: origin.width,
        height: origin.height,
      },
      filterMode: "remove",
      filter: (el) => {
        if (!(el instanceof HTMLElement) || el === frame) return true;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) return false;
        return isVisibleInClip(rect, origin);
      },
    });
  } catch {
    canvas = null;
  }
  if (!isActiveCaptureFrame(frame)) return null;

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const outCtx = out.getContext("2d");
  if (!outCtx) return null;
  outCtx.fillStyle = fill;
  outCtx.fillRect(0, 0, outW, outH);
  if (canvas) {
    const box = containedDest(canvas.width, canvas.height, outW, outH);
    outCtx.drawImage(canvas, box.x, box.y, box.w, box.h);
  }
  paintXtermHosts(outCtx, frame, origin, dest);
  try {
    return out.toDataURL("image/jpeg", JPEG_QUALITY);
  } catch {
    return null;
  }
}

/** Drop an in-flight capture so a space switch does not apply a stale shot. */
export function invalidateCenterSpaceThumbnailCapture(): void {
  captureEpoch += 1;
}

export async function snapshotMountedCenterSpaceThumbnails(
  hostId: string,
): Promise<Array<{ spaceId: string; dataUrl: string }>> {
  if (!canCapture() || !hostId) return [];
  const frame = queryActiveFrame(hostId);
  if (!frame) return [];
  const key = frame.getAttribute("data-workspace-frame");
  if (!key) return [];
  const spaceId = parseCenterSpaceKey(key).spaceId;
  const dataUrl = await snapshotFrameToJpeg(frame);
  if (!dataUrl || !isActiveCaptureFrame(frame)) return [];
  return [{ spaceId, dataUrl }];
}

/**
 * Generic screenshot of the live center frame (any tab), plus terminal buffers.
 */
export async function captureCenterSpaceThumbnail(): Promise<string | null> {
  if (!canCapture()) return null;
  if (inflight) return inflight;
  const epoch = ++captureEpoch;
  inflight = (async () => {
    await nextFrame();
    if (epoch !== captureEpoch) return null;
    const frame = queryActiveFrame();
    if (!frame) return null;
    const dataUrl = await snapshotFrameToJpeg(frame);
    if (epoch !== captureEpoch) return null;
    return dataUrl;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Decode so the fan's fallback <img> does not hitch on first paint. */
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
