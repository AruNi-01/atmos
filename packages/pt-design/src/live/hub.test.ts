import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openFileSession, runTool } from "../agent/api";
import { initDesignDocument } from "../core/document";
import { createPtDesignSession } from "../core/session";
import { emptyScene, type PtElement, type PtScene } from "../core/types";
import { diffScenes } from "./diff";
import { buildLiveEvent, makeLiveEvent } from "./event";
import { startLiveHub } from "./hub";
import { LIVE_PROTOCOL } from "./protocol";
import { publishLiveEvent } from "./publish";
import { boxesForElements, instanceIdsFromResult, liveLabel } from "./touched";

function ellipse(id: string, x: number, y: number): PtElement {
  return {
    id,
    type: "ellipse",
    x,
    y,
    width: 40,
    height: 40,
    angle: 0,
    strokeColor: "#18181b",
    backgroundColor: "#ffffff",
    fillStyle: "solid",
    strokeWidth: 1,
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: { type: 3 },
    seed: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    locked: false,
  };
}

describe("agent live events", () => {
  test("instance ids and union boxes come from placed components", () => {
    const session = createPtDesignSession();
    const placed = session.dispatch({
      type: "place",
      componentType: "button",
      at: { x: 10, y: 20 },
      props: { label: "Go" },
    });
    expect(placed.instanceIds?.length).toBeGreaterThan(0);
    const event = makeLiveEvent({
      source: "cli",
      tool: "pt_place",
      data: { ...placed, componentType: "button" },
      scene: session.getScene(),
    });
    expect(event.boxes).toHaveLength(1);
    expect(event.boxes[0]?.x).toBe(10);
    expect(event.boxes[0]?.y).toBe(20);
    expect(event.boxes[0]?.width).toBeGreaterThan(0);
  });

  test("raw ellipse without instanceId still gets a pulse box", () => {
    const prev = emptyScene();
    const next: PtScene = { ...prev, elements: [ellipse("circle-1", 5, 6)] };
    const event = makeLiveEvent({ source: "file", tool: "file", prev, scene: next });
    expect(event.elementIds).toContain("circle-1");
    expect(event.boxes).toHaveLength(1);
    expect(event.boxes[0]?.x).toBe(5);
    expect(event.boxes[0]?.width).toBe(40);
    expect(boxesForElements(next, ["circle-1"])[0]?.height).toBe(40);
  });

  test("scene diff finds added instance and raw shape", () => {
    const session = createPtDesignSession();
    const before = session.getScene();
    session.dispatch({ type: "place", componentType: "button", at: { x: 0, y: 0 } });
    const afterPlace = session.getScene();
    const withCircle: PtScene = {
      ...afterPlace,
      elements: [...afterPlace.elements, ellipse("raw-1", 80, 80)],
    };
    const placed = diffScenes(before, afterPlace);
    expect(placed.instanceIds.length).toBeGreaterThan(0);
    const mixed = diffScenes(afterPlace, withCircle);
    expect(mixed.rawElementIds).toContain("raw-1");
  });

  test("live label and result ids", () => {
    expect(liveLabel("pt_place", { componentType: "alert-dialog" })).toBe("Place alert-dialog");
    expect(liveLabel("file", {})).toBe("Edit file");
    expect(instanceIdsFromResult({ instanceId: "a", instanceIds: ["a", "b"] }, {})).toEqual(["a", "b"]);
  });

  test("hub broadcasts a posted event to websocket clients", async () => {
    const hub = await startLiveHub(0);
    try {
      const incoming = new Promise<string>((resolve, reject) => {
        const ws = new WebSocket(`${hub.url.replace(/^http/, "ws")}/ws`);
        ws.addEventListener("open", () => {
          const event = buildLiveEvent(
            openFileSession({}),
            "pt_place",
            {},
            { instanceId: "x", componentType: "button" },
            "mcp",
          );
          void publishLiveEvent({ ...event, scene: emptyScene(), instanceIds: ["x"] }, hub.url).then((ok) => {
            if (!ok) reject(new Error("publish failed"));
          });
        });
        ws.addEventListener("message", (ev) => {
          resolve(String(ev.data));
          ws.close();
        });
        ws.addEventListener("error", () => reject(new Error("ws error")));
      });
      const raw = await incoming;
      const parsed = JSON.parse(raw) as { v: string; tool: string };
      expect(parsed.v).toBe(LIVE_PROTOCOL);
      expect(parsed.tool).toBe("pt_place");
    } finally {
      hub.stop();
    }
  });

  test("file watch broadcasts a saved design file", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "pt-live-")), "app.ptdesign.json");
    initDesignDocument(file);
    const hub = await startLiveHub(0, { file });
    try {
      const incoming = new Promise<string>((resolve, reject) => {
        const ws = new WebSocket(`${hub.url.replace(/^http/, "ws")}/ws`);
        const timer = setTimeout(() => reject(new Error("watch timeout")), 4000);
        ws.addEventListener("open", () => {
          runTool(openFileSession({ file, autoSave: true }), {
            name: "pt_place",
            args: { componentType: "button", at: { x: 4, y: 8 } },
          });
        });
        ws.addEventListener("message", (ev) => {
          clearTimeout(timer);
          resolve(String(ev.data));
          ws.close();
        });
        ws.addEventListener("error", () => {
          clearTimeout(timer);
          reject(new Error("ws error"));
        });
      });
      const parsed = JSON.parse(await incoming) as {
        source: string;
        instanceIds: string[];
        boxes: unknown[];
      };
      expect(parsed.source).toBe("file");
      expect(parsed.instanceIds.length).toBeGreaterThan(0);
      expect(parsed.boxes.length).toBeGreaterThan(0);
    } finally {
      hub.stop();
    }
  });
});
