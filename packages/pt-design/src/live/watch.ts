import { watch } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { openDesignDocument } from "../core/document";
import { emptyScene, type PtScene } from "../core/types";
import { makeLiveEvent } from "./event";
import type { LiveEvent } from "./protocol";

function tryOpenScene(file: string): PtScene | null {
  try {
    return openDesignDocument(file).scene;
  } catch {
    return null;
  }
}

function sceneKey(scene: PtScene): string {
  return scene.elements
    .filter((el) => !el.isDeleted)
    .map((el) =>
      [
        el.id,
        el.type,
        el.x,
        el.y,
        el.width,
        el.height,
        el.text ?? "",
        el.name ?? "",
        el.customData?.pt?.instanceId ?? "",
        JSON.stringify(el.customData?.pt?.props ?? {}),
      ].join(":"),
    )
    .join("|");
}

export function watchDesignFile(file: string, onEvent: (event: LiveEvent) => void): () => void {
  const abs = resolve(file);
  let last = tryOpenScene(abs);
  let lastKey = last ? sceneKey(last) : "";
  let timer: ReturnType<typeof setTimeout> | undefined;

  const fire = () => {
    const next = tryOpenScene(abs);
    if (!next) return;
    const key = sceneKey(next);
    if (key === lastKey) return;
    const event = makeLiveEvent({
      source: "file",
      tool: "file",
      prev: last ?? emptyScene(),
      scene: next,
    });
    last = next;
    lastKey = key;
    onEvent(event);
  };

  const dir = dirname(abs);
  const name = basename(abs);
  const watcher = watch(dir, (_event, filename) => {
    if (filename && filename !== name) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, 80);
  });

  return () => {
    if (timer) clearTimeout(timer);
    watcher.close();
  };
}
