import type { FileSession } from "../agent/api";
import type { PtScene } from "../core/types";
import { LIVE_PROTOCOL, type LiveEvent, type LiveSource } from "./protocol";
import { boxesForTouched, liveLabel, resolveTouched } from "./touched";

const MUTATING = new Set([
  "pt_place",
  "pt_update",
  "pt_delete",
  "pt_frame_create",
  "pt_frame_rename",
  "pt_apply_ir",
  "pt_doc_init",
  "pt_doc_open",
  "pt_doc_save",
  "file",
]);

export function isMutatingTool(name: string): boolean {
  return MUTATING.has(name);
}

export function makeLiveEvent(input: {
  source: LiveSource;
  tool: string;
  args?: Record<string, unknown>;
  data?: unknown;
  prev?: PtScene;
  scene: PtScene;
}): LiveEvent {
  const args = input.args ?? {};
  const ids = resolveTouched(input.prev, input.scene, args, input.data);
  let boxes = boxesForTouched(input.scene, ids);
  if (boxes.length === 0 && input.prev) {
    boxes = boxesForTouched(input.prev, ids);
  }
  const frameId =
    input.data && typeof input.data === "object" && typeof (input.data as { frameId?: unknown }).frameId === "string"
      ? (input.data as { frameId: string }).frameId
      : typeof args.frameId === "string"
        ? args.frameId
        : "";
  return {
    v: LIVE_PROTOCOL,
    at: Date.now(),
    source: input.source,
    tool: input.tool,
    label: liveLabel(input.tool, input.data),
    instanceIds: ids.instanceIds,
    elementIds: ids.elementIds,
    frameIds: frameId ? [frameId] : [],
    boxes,
    scene: input.scene,
  };
}

export function buildLiveEvent(
  fs: FileSession,
  tool: string,
  args: Record<string, unknown>,
  data: unknown,
  source: LiveSource,
  prev?: PtScene,
): LiveEvent {
  return makeLiveEvent({
    source,
    tool,
    args,
    data,
    prev,
    scene: fs.session.getScene(),
  });
}
