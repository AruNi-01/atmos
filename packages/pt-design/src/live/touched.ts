import type { PtScene } from "../core/types";
import type { DesignIR } from "../ir/schema";
import { diffScenes } from "./diff";

export type SceneBox = {
  instanceId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const MAX_PULSE_BOXES = 16;

export function boxesForInstances(scene: PtScene, instanceIds: string[]): SceneBox[] {
  const allow = new Set(instanceIds.filter(Boolean));
  if (allow.size === 0) return [];
  const groups = new Map<string, Array<{ x: number; y: number; width: number; height: number }>>();
  for (const el of scene.elements) {
    if (el.isDeleted) continue;
    const id = el.customData?.pt?.instanceId;
    if (!id || !allow.has(id)) continue;
    const list = groups.get(id) ?? [];
    list.push({ x: el.x, y: el.y, width: el.width, height: el.height });
    groups.set(id, list);
  }
  return [...groups.entries()].map(([instanceId, parts]) => unionParts(instanceId, parts));
}

export function boxesForElements(scene: PtScene, elementIds: string[]): SceneBox[] {
  const allow = new Set(elementIds.filter(Boolean));
  if (allow.size === 0) return [];
  return scene.elements
    .filter((el) => !el.isDeleted && allow.has(el.id))
    .map((el) => ({
      instanceId: el.customData?.pt?.instanceId ?? el.id,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
    }));
}

export function boxesForTouched(
  scene: PtScene,
  ids: { instanceIds?: string[]; elementIds?: string[] },
): SceneBox[] {
  const byKey = new Map<string, SceneBox>();
  for (const box of [
    ...boxesForInstances(scene, ids.instanceIds ?? []),
    ...boxesForElements(scene, ids.elementIds ?? []),
  ]) {
    byKey.set(`${box.instanceId}:${box.x}:${box.y}:${box.width}:${box.height}`, box);
  }
  return collapseBoxes([...byKey.values()]);
}

export function collapseBoxes(boxes: SceneBox[], max = MAX_PULSE_BOXES): SceneBox[] {
  if (boxes.length <= max) return boxes;
  if (boxes.length === 0) return [];
  return [unionParts("union", boxes)];
}

function unionParts(
  instanceId: string,
  parts: Array<{ x: number; y: number; width: number; height: number }>,
): SceneBox {
  const minX = Math.min(...parts.map((part) => part.x));
  const minY = Math.min(...parts.map((part) => part.y));
  const maxX = Math.max(...parts.map((part) => part.x + part.width));
  const maxY = Math.max(...parts.map((part) => part.y + part.height));
  return { instanceId, x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function sceneBoxToViewport(
  box: Pick<SceneBox, "x" | "y" | "width" | "height">,
  app: { scrollX: number; scrollY: number; zoom: { value: number } },
): { left: number; top: number; width: number; height: number } {
  const z = app.zoom.value || 1;
  return {
    left: (box.x + app.scrollX) * z,
    top: (box.y + app.scrollY) * z,
    width: box.width * z,
    height: box.height * z,
  };
}

export function liveLabel(tool: string, data: unknown): string {
  const rec = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const type = typeof rec.componentType === "string" ? rec.componentType : "";
  switch (tool) {
    case "pt_place":
      return type ? `Place ${type}` : "Place";
    case "pt_update":
      return "Update";
    case "pt_delete":
      return "Delete";
    case "pt_frame_create":
      return "Add frame";
    case "pt_frame_rename":
      return "Rename frame";
    case "pt_apply_ir":
      return "Apply IR";
    case "file":
      return "Edit file";
    default:
      return tool.replace(/^pt_/, "").replace(/_/g, " ");
  }
}

export function instanceIdsFromResult(data: unknown, args: Record<string, unknown>): string[] {
  if (!data || typeof data !== "object") {
    if (typeof args.instanceId === "string") return [args.instanceId];
    if (Array.isArray(args.instanceIds)) return args.instanceIds.filter((id): id is string => typeof id === "string");
    return [];
  }
  const rec = data as Record<string, unknown>;
  if (Array.isArray(rec.instanceIds)) {
    return rec.instanceIds.filter((id): id is string => typeof id === "string");
  }
  if (typeof rec.instanceId === "string") return [rec.instanceId];
  if (Array.isArray(rec.deleted)) {
    return rec.deleted.filter((id): id is string => typeof id === "string");
  }
  if (typeof args.instanceId === "string") return [args.instanceId];
  return irInstanceIds(args.ir);
}

export function irInstanceIds(ir: unknown): string[] {
  if (!ir || typeof ir !== "object") return [];
  const rec = ir as Partial<DesignIR>;
  const nodes = [
    ...(Array.isArray(rec.frames) ? rec.frames.flatMap((frame) => frame.nodes ?? []) : []),
    ...(Array.isArray(rec.freeNodes) ? rec.freeNodes : []),
  ];
  return nodes
    .map((node) => node.instanceId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

export function resolveTouched(
  prev: PtScene | undefined,
  next: PtScene,
  args: Record<string, unknown>,
  data: unknown,
): { instanceIds: string[]; elementIds: string[] } {
  const instanceIds = instanceIdsFromResult(data, args);
  const frameId =
    data && typeof data === "object" && typeof (data as { frameId?: unknown }).frameId === "string"
      ? (data as { frameId: string }).frameId
      : typeof args.frameId === "string"
        ? args.frameId
        : "";
  const elementIds = frameId ? [frameId] : [];
  if (instanceIds.length || elementIds.length) {
    return { instanceIds, elementIds };
  }
  if (!prev) return { instanceIds: [], elementIds: [] };
  const diff = diffScenes(prev, next);
  return {
    instanceIds: diff.instanceIds,
    elementIds: diff.rawElementIds,
  };
}
