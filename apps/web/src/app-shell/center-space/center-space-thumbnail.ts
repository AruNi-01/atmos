import {
  hostIdFromCenterKey,
  makeCenterSpaceKey,
  parseCenterSpaceKey,
} from "@/app-shell/center-space/center-space";
import {
  listXtermPreviewHosts,
  paintXtermBufferInto,
} from "@/features/terminal/lib/terminal-xterm-preview";

/** Fan cards are 136×92. */
export const THUMB_WIDTH = 136;
export const THUMB_HEIGHT = 92;
const JPEG_QUALITY = 0.56;
const MIN_BOX = 8;

/** Guests inside the visible pane. Do not exclude `.hidden` / `.opacity-0` —
 * those classes are used by the live UI and removing them shifts layout. */
const SNAP_EXCLUDE = [
  ".xterm",
  ".atmos-terminal",
  ".atmos-terminal-panel-keepalive",
  "iframe",
  "webview",
  "canvas",
  "[data-atmos-guest-iframe]",
  "[data-center-space-switcher]",
  "[data-tier=\"warm\"]",
  "[data-center-pane-owner][aria-hidden='true']",
  "[data-center-pane-owner][inert]",
];

export type ThumbBox = { left: number; top: number; width: number; height: number };
export type ThumbDest = { x: number; y: number; w: number; h: number };

function snapPreviewBaseHref(): string {
  if (typeof location !== "undefined" && location.href) return location.href;
  return "http://localhost/";
}

/** snapDOM inlines <img> via CORS fetch. Skip cross-origin avatars and CDNs. */
export function isRemoteSnapPreviewSrc(
  src: string | null | undefined,
  baseHref = snapPreviewBaseHref(),
): boolean {
  if (!src) return false;
  const value = src.trim();
  if (!value || value.startsWith("data:") || value.startsWith("blob:")) {
    return false;
  }
  try {
    return new URL(value, baseHref).origin !== new URL(baseHref).origin;
  } catch {
    return true;
  }
}

function firstSrcsetUrl(srcset: string | null | undefined): string | null {
  if (!srcset) return null;
  const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
  return first || null;
}

export function isRemoteSnapPreviewImage(node: Element): boolean {
  if (typeof HTMLImageElement !== "undefined" && node instanceof HTMLImageElement) {
    return isRemoteSnapPreviewSrc(
      node.currentSrc ||
        node.getAttribute("src") ||
        node.src ||
        firstSrcsetUrl(node.getAttribute("srcset")),
    );
  }
  if (typeof SVGImageElement !== "undefined" && node instanceof SVGImageElement) {
    return isRemoteSnapPreviewSrc(
      node.getAttribute("href") ||
        node.getAttribute("xlink:href") ||
        node.href?.baseVal,
    );
  }
  return false;
}

let captureEpoch = 0;
let captureLock: Promise<void> = Promise.resolve();
let snapdomLoader: Promise<typeof import("@zumer/snapdom")> | null = null;

function canCapture(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function loadSnapdom(): Promise<typeof import("@zumer/snapdom")> {
  snapdomLoader ??= import("@zumer/snapdom");
  return snapdomLoader;
}

/** Idle-load the capture module so the first click does not pay import cost. */
export function prefetchCenterSpaceSnapdom(): void {
  if (!canCapture()) return;
  void loadSnapdom();
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function withCaptureLock<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void = () => {};
  const previous = captureLock;
  captureLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

function isOpaqueCssColor(color: string): boolean {
  const trimmed = color.trim().toLowerCase();
  if (!trimmed || trimmed === "transparent") return false;
  const rgba = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/,
  );
  if (rgba) return (rgba[4] == null ? 1 : Number(rgba[4])) >= 0.95;
  return true;
}

/** JPEG cannot keep alpha. Transparent fill becomes black bars. */
export function opaqueBackground(el: HTMLElement): string {
  let current: HTMLElement | null = el;
  while (current) {
    const color = getComputedStyle(current).backgroundColor;
    if (isOpaqueCssColor(color)) return color;
    current = current.parentElement;
  }
  const body = getComputedStyle(document.body).backgroundColor;
  return isOpaqueCssColor(body) ? body : "#ffffff";
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

function isCheapHiddenPane(node: HTMLElement): boolean {
  if (node.hasAttribute("inert")) return true;
  if (node.getAttribute("data-tier") === "warm") return true;
  if (
    node.hasAttribute("data-center-pane-owner") &&
    node.getAttribute("aria-hidden") === "true"
  ) {
    return true;
  }
  const cls = node.classList;
  return (
    cls.contains("hidden") ||
    cls.contains("opacity-0") ||
    cls.contains("atmos-terminal-panel-keepalive")
  );
}

/**
 * Cheap keep-predicate: class/attr only. Do not call getComputedStyle here —
 * snapdom runs this per node and style reads hitch the click.
 */
export function shouldKeepSnapPreviewNode(
  node: Element,
  root: HTMLElement,
): boolean {
  if (node === root) return true;
  if (typeof HTMLElement === "undefined" || !(node instanceof HTMLElement)) {
    return true;
  }
  return !isCheapHiddenPane(node);
}

/**
 * Work area = everything except left sidebar, header, and footer.
 * That is the space preview: tab chrome, mosaic panes, and the right inspector.
 */
export function queryCenterWorkArea(): HTMLElement | null {
  if (!canCapture()) return null;
  const body = document.querySelector<HTMLElement>("[data-center-stage-body]");
  if (body && isPaintedCaptureFrame(body)) return body;
  const card = document.querySelector<HTMLElement>("[data-center-stage-card]");
  if (card && isPaintedCaptureFrame(card)) return card;
  return null;
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

/** Fill the card. Centered UI stays centered; no letterbox bars. */
export function coverDest(
  srcW: number,
  srcH: number,
  boxW: number,
  boxH: number,
): ThumbDest {
  if (srcW <= 0 || srcH <= 0) return { x: 0, y: 0, w: boxW, h: boxH };
  const scale = Math.max(boxW / srcW, boxH / srcH);
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

function frameMatchesHost(frame: HTMLElement, hostId?: string): boolean {
  const key = frame.getAttribute("data-workspace-frame");
  if (!key) return false;
  if (hostId && hostIdFromCenterKey(key) !== hostId) return false;
  return true;
}

function isPaintedCaptureFrame(frame: HTMLElement): boolean {
  if (!frame.isConnected) return false;
  const origin = frame.getBoundingClientRect();
  if (origin.width < 40 || origin.height < 40) return false;
  const opacity = Number.parseFloat(getComputedStyle(frame).opacity || "1");
  return opacity > 0.5;
}

function queryActiveFrame(hostId?: string): HTMLElement | null {
  const frames = document.querySelectorAll<HTMLElement>(
    '[data-workspace-frame][data-tier="active"]',
  );
  for (const frame of frames) {
    if (!frameMatchesHost(frame, hostId)) continue;
    if (!isActiveCaptureFrame(frame)) continue;
    if (isPaintedCaptureFrame(frame)) return frame;
  }
  const card = document.querySelector<HTMLElement>("[data-center-stage-card]");
  if (card && isPaintedCaptureFrame(card)) return card;
  return null;
}

function isActiveCaptureFrame(frame: HTMLElement): boolean {
  return frame.isConnected && frame.getAttribute("data-tier") === "active";
}

async function snapshotFrameToJpeg(
  frame: HTMLElement,
  options?: { invalidate?: boolean },
): Promise<string | null> {
  return withCaptureLock(async () => {
    if (!frame.isConnected) return null;
    if (frame.getAttribute("data-tier") === "warm") return null;
    const origin = frame.getBoundingClientRect();
    if (origin.width < 40 || origin.height < 40) return null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const outW = Math.round(THUMB_WIDTH * dpr);
    const outH = Math.round(THUMB_HEIGHT * dpr);
    const dest: ThumbDest = containedDest(origin.width, origin.height, outW, outH);
    const fill = opaqueBackground(frame);

    let canvas: HTMLCanvasElement | null = null;
    try {
      const { snapdom } = await loadSnapdom();
      if (!frame.isConnected) return null;
      canvas = await snapdom.toCanvas(frame, {
        fast: true,
        burst: true,
        invalidate: options?.invalidate === true,
        embedFonts: false,
        compress: true,
        dpr: 1,
        width: outW,
        backgroundColor: fill,
        exclude: SNAP_EXCLUDE,
        filter: (node) => !isRemoteSnapPreviewImage(node),
        placeholders: false,
        resolvePicturePlaceholders: false,
      });
    } catch {
      canvas = null;
    }

    const paintedXterm = frame.isConnected
      ? listXtermPreviewHosts(frame).some(
          ({ host }) => !isSkippedPreviewNode(host, frame),
        )
      : false;
    if (!canvas && !paintedXterm) return null;

    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const outCtx = out.getContext("2d");
    if (!outCtx) return null;
    outCtx.fillStyle = fill;
    outCtx.fillRect(0, 0, outW, outH);
    if (canvas && canvas.width > 0 && canvas.height > 0) {
      const box = containedDest(canvas.width, canvas.height, outW, outH);
      outCtx.drawImage(canvas, box.x, box.y, box.w, box.h);
    }
    if (frame.isConnected) {
      paintXtermHosts(outCtx, frame, origin, dest);
    }
    try {
      return out.toDataURL("image/jpeg", JPEG_QUALITY);
    } catch {
      return null;
    }
  });
}

/** Drop an in-flight capture so a space switch does not apply a stale shot. */
export function invalidateCenterSpaceThumbnailCapture(): void {
  captureEpoch += 1;
}

export async function snapshotMountedCenterSpaceThumbnails(
  hostId: string,
  options?: { invalidate?: boolean },
): Promise<Array<{ spaceId: string; dataUrl: string }>> {
  if (!canCapture() || !hostId) return [];
  const frame = queryActiveFrame(hostId);
  if (!frame) return [];
  const key =
    frame.getAttribute("data-workspace-frame") ??
    frame
      .querySelector("[data-workspace-frame][data-tier='active']")
      ?.getAttribute("data-workspace-frame");
  const spaceId = parseCenterSpaceKey(key || hostId).spaceId;
  const workArea = queryCenterWorkArea() ?? frame;
  const dataUrl = await snapshotFrameToJpeg(workArea, options);
  if (!dataUrl) return [];
  return [{ spaceId, dataUrl }];
}

/**
 * Generic screenshot of the live center frame (any tab), plus terminal buffers.
 */
export async function captureCenterSpaceThumbnail(): Promise<string | null> {
  if (!canCapture()) return null;
  const epoch = ++captureEpoch;
  await nextFrame();
  if (epoch !== captureEpoch) return null;
  const frame = queryCenterWorkArea() ?? queryActiveFrame();
  if (!frame) return null;
  const dataUrl = await snapshotFrameToJpeg(frame);
  if (epoch !== captureEpoch) return null;
  return dataUrl;
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
