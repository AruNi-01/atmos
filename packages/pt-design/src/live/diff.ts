import type { PtElement, PtScene } from "../core/types";

export type SceneDiff = {
  added: string[];
  removed: string[];
  changed: string[];
  instanceIds: string[];
  rawElementIds: string[];
};

function elementFingerprint(el: PtElement): string {
  return [
    el.id,
    el.type,
    el.x,
    el.y,
    el.width,
    el.height,
    el.angle ?? 0,
    el.frameId ?? "",
    el.text ?? "",
    el.name ?? "",
    el.strokeColor,
    el.backgroundColor,
    el.customData?.pt?.instanceId ?? "",
    el.customData?.pt?.componentType ?? "",
    el.customData?.pt?.variant ?? "",
    JSON.stringify(el.customData?.pt?.props ?? {}),
  ].join(":");
}

function liveElements(scene: PtScene): PtElement[] {
  return scene.elements.filter((el) => !el.isDeleted);
}

export function diffScenes(prev: PtScene, next: PtScene): SceneDiff {
  const prevMap = new Map(liveElements(prev).map((el) => [el.id, el]));
  const nextMap = new Map(liveElements(next).map((el) => [el.id, el]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  const instanceIds = new Set<string>();
  const rawElementIds: string[] = [];

  for (const [id, el] of nextMap) {
    const before = prevMap.get(id);
    if (!before) added.push(id);
    else if (elementFingerprint(before) !== elementFingerprint(el)) changed.push(id);
    else continue;
    const instanceId = el.customData?.pt?.instanceId;
    if (instanceId) instanceIds.add(instanceId);
    else rawElementIds.push(id);
  }

  for (const [id, el] of prevMap) {
    if (nextMap.has(id)) continue;
    removed.push(id);
    const instanceId = el.customData?.pt?.instanceId;
    if (instanceId) instanceIds.add(instanceId);
    else rawElementIds.push(id);
  }

  return { added, removed, changed, instanceIds: [...instanceIds], rawElementIds };
}
