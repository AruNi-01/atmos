import { exportToBlob } from "@excalidraw/excalidraw";
import { PT_ERROR_CODES, PtDesignError } from "../agent/errors";
import type { PtDesignSession } from "../core/session";
import type { BBox } from "../core/types";
import type { ExcalidrawCompatElement, ExcalidrawHostApi } from "./scene-bridge";

export type LiveScreenshot = {
  mediaType: "image/png";
  dataUrl: string;
  width: number;
  height: number;
  bbox: BBox;
  frameId?: string;
  instanceIds: string[];
};

function toNum(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function instanceIdsOf(elements: readonly ExcalidrawCompatElement[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const el of elements) {
    const id = el.customData?.pt?.instanceId;
    if (!id || seen.has(id) || !el.customData?.pt?.componentType) continue;
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

export async function captureLiveScreenshot(
  api: ExcalidrawHostApi,
  session: PtDesignSession,
  args: Record<string, unknown>,
): Promise<LiveScreenshot> {
  const elements = api.getSceneElements().filter((el) => !el.isDeleted);
  if (elements.length === 0) {
    throw new PtDesignError(PT_ERROR_CODES.USAGE, "Board is empty; place something before screenshot.");
  }

  const frameId = typeof args.frameId === "string" ? args.frameId : typeof args.frame === "string" ? args.frame : undefined;
  const instanceIds = Array.isArray(args.instanceIds)
    ? args.instanceIds.map(String).filter(Boolean)
    : [];
  const maxEdge = Math.min(2048, Math.max(256, toNum(args.maxEdge, 1024)));

  let exportingFrame: ExcalidrawCompatElement | null = null;
  let scoped = elements;
  if (frameId) {
    const frame = session.resolveFrame(frameId);
    if (!frame) throw new PtDesignError(PT_ERROR_CODES.NOT_FOUND, `Frame not found: ${frameId}`);
    exportingFrame = elements.find((el) => el.id === frame.id && el.type === "frame") ?? null;
    scoped = elements.filter((el) => el.id === frame.id || el.frameId === frame.id);
  } else if (instanceIds.length > 0) {
    const allow = new Set(instanceIds);
    scoped = elements.filter((el) => {
      const id = el.customData?.pt?.instanceId;
      return Boolean(id && allow.has(id));
    });
  }

  if (scoped.length === 0) {
    throw new PtDesignError(PT_ERROR_CODES.USAGE, "Nothing to screenshot in that frame or selection.");
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
    exportingFrame: exportingFrame as never,
  });
  const dataUrl = await blobToDataUrl(blob);
  const size = await dataUrlSize(dataUrl);
  const capturedIds = instanceIds.length ? instanceIds : instanceIdsOf(scoped);
  const bbox = exportingFrame
    ? { x: exportingFrame.x, y: exportingFrame.y, w: exportingFrame.width, h: exportingFrame.height }
    : unionBBox(scoped);

  return {
    mediaType: "image/png",
    dataUrl,
    width: size.width,
    height: size.height,
    bbox,
    frameId: exportingFrame?.id,
    instanceIds: capturedIds,
  };
}
