import { exportToBlob } from "@excalidraw/excalidraw";
import { PtDesignError } from "../protocol";
import type { BBox } from "../core/types";
import { thumbnailViewBox } from "../host/preview";
import { canvasOriginInBoard, findCanvasOriginNode } from "./overlay/canvas-origin";
import { boardCropFromScene } from "./preview-crop";
import type { ExcalidrawCompatElement, ExcalidrawHostApi } from "./scene-bridge";

export type LiveScreenshot = {
  mime: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  dataUrl: string;
  blob?: Blob;
  width: number;
  height: number;
  bbox: BBox;
  nodeIds: string[];
};

/** Overview thumbs: wide enough to stay sharp on a 16:10 card, small enough for IndexedDB. */
export const PREVIEW_CAPTURE_MAX_EDGE = 960;

const PREVIEW_CHROME_EXCLUDE = [
  ".pt-design-back",
  ".pt-design-top-right",
  ".pt-design-mode-toggle",
  ".pt-design-catalog-sidebar",
  ".pt-design-library-sidebar",
  ".pt-design-share-trigger",
  ".pt-design-island-trigger",
  ".layer-ui__wrapper",
  ".App-menu",
  ".App-toolbar",
  ".App-bottom-bar",
  "[data-testid='pt-design-selection-props']",
  "[data-testid='pt-design-share-popover']",
  "[data-testid='pt-design-catalog']",
  "[data-testid='pt-design-library']",
  "[data-testid='pt-design-place-reveal']",
];

const MAX_PREVIEW_DATA_URL = 220_000;
const PREVIEW_WEBP_QUALITY = 0.82;
const PREVIEW_JPEG_QUALITY = 0.8;

function toNum(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function nodeIdOf(el: ExcalidrawCompatElement): string | undefined {
  const pt = el.customData?.pt as { id?: string; instanceId?: string } | undefined;
  return pt?.id ?? pt?.instanceId;
}

function nodeIdsOf(elements: readonly ExcalidrawCompatElement[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const el of elements) {
    const id = nodeIdOf(el);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function unionBBox(elements: readonly { x: number; y: number; width: number; height: number }[]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 1, h: 1 };
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

function intersectsBox(
  el: { x: number; y: number; width: number; height: number },
  box: { x: number; y: number; w: number; h: number },
): boolean {
  return el.x < box.x + box.w && el.x + el.width > box.x && el.y < box.y + box.h && el.y + el.height > box.y;
}

function findLiveBoard(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const boards = document.querySelectorAll<HTMLElement>("[data-testid='pt-design-board']");
  for (const board of boards) {
    if (board.getClientRects().length > 0) return board;
  }
  return boards[0] ?? null;
}

function dataUrlParts(dataUrl: string): { mime: "image/png" | "image/jpeg" | "image/webp"; base64: string } {
  const mime = dataUrl.startsWith("data:image/webp")
    ? "image/webp"
    : dataUrl.startsWith("data:image/jpeg")
      ? "image/jpeg"
      : "image/png";
  const comma = dataUrl.indexOf(",");
  return { mime, base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== "function") {
      resolve(null);
      return;
    }
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function canvasToPreview(canvas: HTMLCanvasElement): Promise<{
  dataUrl: string;
  mime: "image/png" | "image/jpeg" | "image/webp";
  blob: Blob;
}> {
  const webp = await canvasToBlob(canvas, "image/webp", PREVIEW_WEBP_QUALITY);
  if (webp && webp.type === "image/webp" && webp.size > 32) {
    const dataUrl = await blobToDataUrl(webp);
    return { dataUrl, mime: "image/webp", blob: webp };
  }
  const jpeg = await canvasToBlob(canvas, "image/jpeg", PREVIEW_JPEG_QUALITY);
  if (jpeg && jpeg.size > 32) {
    const dataUrl = await blobToDataUrl(jpeg);
    return { dataUrl, mime: "image/jpeg", blob: jpeg };
  }
  let dataUrl = canvas.toDataURL("image/png");
  if (dataUrl.length > MAX_PREVIEW_DATA_URL) {
    dataUrl = canvas.toDataURL("image/jpeg", PREVIEW_JPEG_QUALITY);
  }
  const parts = dataUrlParts(dataUrl);
  return { dataUrl, mime: parts.mime, blob: await blobFromDataUrl(dataUrl) };
}

async function blobFromDataUrl(dataUrl: string): Promise<Blob> {
  const parts = dataUrlParts(dataUrl);
  const binary = atob(parts.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: parts.mime });
}

async function cropDataUrlToLandscape(dataUrl: string, width: number, height: number): Promise<{
  dataUrl: string;
  width: number;
  height: number;
}> {
  const aspect = 16 / 10;
  if (width <= 0 || height / width <= (1 / aspect) * 1.12) {
    return { dataUrl, width, height };
  }
  if (typeof document === "undefined") return { dataUrl, width, height };
  const cropH = Math.max(1, Math.round(width / aspect));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = cropH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { dataUrl, width, height };
  const image = await new Promise<HTMLImageElement | null>((resolve) => {
    const next = new Image();
    next.onload = () => resolve(next);
    next.onerror = () => resolve(null);
    next.src = dataUrl;
  });
  if (!image) return { dataUrl, width, height };
  ctx.drawImage(image, 0, 0, width, cropH, 0, 0, width, cropH);
  return { dataUrl: canvas.toDataURL("image/png"), width, height: cropH };
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read screenshot"));
    reader.readAsDataURL(blob);
  });
}

async function dataUrlSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = dataUrl;
  });
}

function captureDpr(): number {
  if (typeof window === "undefined") return 1;
  const value = window.devicePixelRatio;
  return Number.isFinite(value) && value > 0 ? Math.min(2, value) : 1;
}

async function snapBoard(board: HTMLElement, paper: string): Promise<HTMLCanvasElement | null> {
  try {
    const { snapdom } = await import("@zumer/snapdom");
    return await snapdom.toCanvas(board, {
      fast: true,
      burst: true,
      embedFonts: false,
      compress: true,
      dpr: captureDpr(),
      backgroundColor: paper,
      exclude: PREVIEW_CHROME_EXCLUDE,
      placeholders: false,
      resolvePicturePlaceholders: false,
    });
  } catch {
    return null;
  }
}

function copyStaticCanvas(board: HTMLElement): HTMLCanvasElement | null {
  const staticCanvas =
    board.querySelector("canvas.excalidraw__canvas.static") ??
    board.querySelector("canvas.excalidraw__canvas");
  return staticCanvas instanceof HTMLCanvasElement && staticCanvas.width > 1 ? staticCanvas : null;
}

function scaleCropToPixels(
  crop: { x: number; y: number; w: number; h: number },
  sourceW: number,
  sourceH: number,
  cssW: number,
  cssH: number,
): { sx: number; sy: number; sw: number; sh: number } | null {
  if (cssW < 1 || cssH < 1) return null;
  const sx = Math.max(0, Math.round((crop.x / cssW) * sourceW));
  const sy = Math.max(0, Math.round((crop.y / cssH) * sourceH));
  const sw = Math.min(sourceW - sx, Math.max(1, Math.round((crop.w / cssW) * sourceW)));
  const sh = Math.min(sourceH - sy, Math.max(1, Math.round((crop.h / cssH) * sourceH)));
  if (sw < 2 || sh < 2) return null;
  return { sx, sy, sw, sh };
}

function rasterCanvasFromCrop(
  source: HTMLCanvasElement,
  region: { sx: number; sy: number; sw: number; sh: number },
  maxEdge: number,
  paper: string,
): HTMLCanvasElement | null {
  const max = Math.max(region.sw, region.sh);
  const outScale = Math.min(1, maxEdge / max);
  const outW = Math.max(1, Math.round(region.sw * outScale));
  const outH = Math.max(1, Math.round(region.sh * outScale));
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(source, region.sx, region.sy, region.sw, region.sh, 0, 0, outW, outH);
  return out;
}

async function encodePreviewCanvas(canvas: HTMLCanvasElement): Promise<{
  dataUrl: string;
  mime: "image/png" | "image/jpeg" | "image/webp";
  blob: Blob;
  width: number;
  height: number;
}> {
  const encoded = await canvasToPreview(canvas);
  return { ...encoded, width: canvas.width, height: canvas.height };
}

async function captureBoardDom(
  api: ExcalidrawHostApi,
  cropScene: { x: number; y: number; w: number; h: number },
  maxEdge: number,
): Promise<{
  dataUrl: string;
  mime: "image/png" | "image/jpeg" | "image/webp";
  blob: Blob;
  width: number;
  height: number;
} | null> {
  const board = findLiveBoard();
  if (!board) return null;
  const originNode = findCanvasOriginNode(board);
  if (!originNode) return null;
  const origin = canvasOriginInBoard(board, originNode);
  const crop = boardCropFromScene(origin, cropScene, api.getAppState());
  const boardRect = board.getBoundingClientRect();
  if (boardRect.width < 8 || boardRect.height < 8) return null;
  const paper = api.getAppState().viewBackgroundColor || "#fffef7";
  const snap = await snapBoard(board, paper);
  if (snap && snap.width > 1) {
    const region = scaleCropToPixels(crop, snap.width, snap.height, boardRect.width, boardRect.height);
    if (region) {
      const painted = rasterCanvasFromCrop(snap, region, maxEdge, paper);
      if (painted) return encodePreviewCanvas(painted);
    }
  }

  const staticCanvas = copyStaticCanvas(board);
  if (!staticCanvas) return null;
  const canvasCss = staticCanvas.getBoundingClientRect();
  const canvasCrop = {
    x: crop.x - origin.left,
    y: crop.y - origin.top,
    w: crop.w,
    h: crop.h,
  };
  const region = scaleCropToPixels(
    canvasCrop,
    staticCanvas.width,
    staticCanvas.height,
    canvasCss.width,
    canvasCss.height,
  );
  if (!region) return null;
  const painted = rasterCanvasFromCrop(staticCanvas, region, maxEdge, paper);
  if (!painted) return null;
  const overlay = board.querySelector("[data-pt-overlay]");
  if (!(overlay instanceof HTMLElement)) return encodePreviewCanvas(painted);
  const overlaySnap = await snapBoard(overlay, "transparent");
  if (!overlaySnap || overlaySnap.width < 2) return encodePreviewCanvas(painted);
  const overlayRect = overlay.getBoundingClientRect();
  const overlayCrop = {
    x: boardRect.left + crop.x - overlayRect.left,
    y: boardRect.top + crop.y - overlayRect.top,
    w: crop.w,
    h: crop.h,
  };
  const overlayRegion = scaleCropToPixels(
    overlayCrop,
    overlaySnap.width,
    overlaySnap.height,
    overlayRect.width,
    overlayRect.height,
  );
  if (!overlayRegion) return encodePreviewCanvas(painted);
  const out = document.createElement("canvas");
  out.width = painted.width;
  out.height = painted.height;
  const ctx = out.getContext("2d");
  if (!ctx) return encodePreviewCanvas(painted);
  ctx.drawImage(painted, 0, 0, painted.width, painted.height);
  ctx.drawImage(
    overlaySnap,
    overlayRegion.sx,
    overlayRegion.sy,
    overlayRegion.sw,
    overlayRegion.sh,
    0,
    0,
    painted.width,
    painted.height,
  );
  return encodePreviewCanvas(out);
}

export async function captureLiveScreenshot(
  api: ExcalidrawHostApi,
  args: Record<string, unknown> = {},
): Promise<LiveScreenshot> {
  const elements = api.getSceneElements().filter((el) => !el.isDeleted);
  const nodeIds = Array.isArray(args.nodeIds)
    ? args.nodeIds.map(String).filter(Boolean)
    : Array.isArray(args.instanceIds)
      ? args.instanceIds.map(String).filter(Boolean)
      : [];
  const maxEdge = Math.min(
    2048,
    Math.max(256, toNum(args.maxEdge, args.preview === true ? PREVIEW_CAPTURE_MAX_EDGE : 1024)),
  );

  let scoped = elements;
  if (nodeIds.length > 0) {
    const allow = new Set(nodeIds);
    scoped = elements.filter((el) => {
      const id = nodeIdOf(el);
      return Boolean(id && allow.has(id));
    });
  } else if (args.preview === true) {
    const tagged = elements.filter((el) => Boolean(nodeIdOf(el)));
    scoped = tagged.length > 0 ? tagged : elements;
    const thumb = thumbnailViewBox(unionBBox(scoped));
    const windowed = scoped.filter((el) => intersectsBox(el, thumb));
    if (windowed.length > 0) scoped = windowed;
  }

  if (scoped.length === 0) {
    throw new PtDesignError("unknown_type", "Nothing to screenshot.");
  }

  const bbox = unionBBox(scoped);
  const cropScene = args.preview === true ? thumbnailViewBox(bbox) : bbox;
  const live = await captureBoardDom(api, cropScene, maxEdge);
  if (live) {
    const parts = dataUrlParts(live.dataUrl);
    return {
      mime: live.mime,
      base64: parts.base64,
      mediaType: live.mime,
      dataUrl: live.dataUrl,
      blob: live.blob,
      width: live.width,
      height: live.height,
      bbox,
      nodeIds: nodeIds.length ? nodeIds : nodeIdsOf(scoped),
    };
  }

  const files = api.getFiles?.() ?? null;
  const blob = await exportToBlob({
    elements: scoped as never,
    appState: {
      exportBackground: true,
      viewBackgroundColor: api.getAppState().viewBackgroundColor,
    },
    files: files as never,
    mimeType: "image/png",
    maxWidthOrHeight: maxEdge,
    exportPadding: 16,
  });
  const dataUrlRaw = await blobToDataUrl(blob);
  const sizeRaw = await dataUrlSize(dataUrlRaw);
  const cropped =
    args.preview === true ? await cropDataUrlToLandscape(dataUrlRaw, sizeRaw.width, sizeRaw.height) : { dataUrl: dataUrlRaw, ...sizeRaw };
  const dataUrl = cropped.dataUrl;
  const size = { width: cropped.width, height: cropped.height };
  const parts = dataUrlParts(dataUrl);
  const encodedBlob = await blobFromDataUrl(dataUrl);

  return {
    mime: parts.mime,
    base64: parts.base64,
    mediaType: parts.mime,
    dataUrl,
    blob: encodedBlob,
    width: size.width,
    height: size.height,
    bbox,
    nodeIds: nodeIds.length ? nodeIds : nodeIdsOf(scoped),
  };
}
