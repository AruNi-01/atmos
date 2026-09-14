import { exportToBlob } from "@excalidraw/excalidraw";
import { PtDesignError } from "../protocol";
import type { BBox } from "../core/types";
import type { ExcalidrawCompatElement, ExcalidrawHostApi } from "./scene-bridge";

export type LiveScreenshot = {
  mime: "image/png";
  base64: string;
  mediaType: "image/png";
  dataUrl: string;
  width: number;
  height: number;
  bbox: BBox;
  nodeIds: string[];
};

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
  args: Record<string, unknown> = {},
): Promise<LiveScreenshot> {
  const elements = api.getSceneElements().filter((el) => !el.isDeleted);
  const nodeIds = Array.isArray(args.nodeIds)
    ? args.nodeIds.map(String).filter(Boolean)
    : Array.isArray(args.instanceIds)
      ? args.instanceIds.map(String).filter(Boolean)
      : [];
  const maxEdge = Math.min(2048, Math.max(256, toNum(args.maxEdge, 1024)));

  let scoped = elements;
  if (nodeIds.length > 0) {
    const allow = new Set(nodeIds);
    scoped = elements.filter((el) => {
      const id = nodeIdOf(el);
      return Boolean(id && allow.has(id));
    });
  }

  if (scoped.length === 0) {
    throw new PtDesignError("unknown_type", "Nothing to screenshot.");
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
  const dataUrl = await blobToDataUrl(blob);
  const size = await dataUrlSize(dataUrl);
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;

  return {
    mime: "image/png",
    base64,
    mediaType: "image/png",
    dataUrl,
    width: size.width,
    height: size.height,
    bbox: unionBBox(scoped),
    nodeIds: nodeIds.length ? nodeIds : nodeIdsOf(scoped),
  };
}
