import { describe, expect, test } from "bun:test";
import { createPtDesignSession } from "../core/session";
import { runSessionTool } from "../agent/session-tools";
import { isMutatingTool } from "../agent/mutating";
import { createBoardSync } from "./board-sync";
import {
  excalidrawElementsToScene,
  sceneFingerprint,
  sceneToExcalidrawElements,
  type ExcalidrawCompatElement,
} from "./scene-bridge";
import type { PtScene } from "../core/types";

function nodeCount(session: ReturnType<typeof createPtDesignSession>): number {
  const ir = session.getIR();
  return ir.freeNodes.length + ir.frames.reduce((sum, frame) => sum + frame.nodes.length, 0);
}

function instanceIdsOf(elements: readonly ExcalidrawCompatElement[]): string[] {
  const ids = new Set<string>();
  for (const el of elements) {
    const id = el.customData?.pt?.instanceId;
    if (id && el.customData?.pt?.componentType) ids.add(id);
  }
  return [...ids];
}

function createLiveHarness(opts?: { extraStaleEcho?: boolean }) {
  const session = createPtDesignSession();
  let board: ExcalidrawCompatElement[] = [];
  let echo = false;
  const queued: Array<() => void> = [];

  const fireBoard = (elements: readonly ExcalidrawCompatElement[]) => {
    const scene = excalidrawElementsToScene(elements, { viewBackgroundColor: "#ffffff" }, "light");
    sync.onBoardChange(scene);
  };

  const sync = createBoardSync({
    getSessionScene: () => session.getScene(),
    fingerprint: sceneFingerprint,
    replaceSession: (scene: PtScene) => {
      echo = true;
      session.dispatch({ type: "replaceScene", scene });
      echo = false;
    },
    getHost: () => ({
      getBoardScene: () => excalidrawElementsToScene(board, { viewBackgroundColor: "#ffffff" }, "light"),
      pushToBoard: (scene) => {
        const stale = board.slice();
        board = sceneToExcalidrawElements(scene, "light");
        const next = board.slice();
        queued.push(() => fireBoard(next));
        queued.push(() => fireBoard(next));
        if (opts?.extraStaleEcho && stale.length) queued.push(() => fireBoard(stale));
      },
    }),
  });

  session.subscribe(() => {
    if (echo) return;
    sync.onSessionChanged();
  });

  const flush = async () => {
    while (queued.length) queued.shift()?.();
    await sync.drain();
  };

  const invoke = async (name: Parameters<typeof runSessionTool>[1]["name"], args: Record<string, unknown>) => {
    const data = sync.runHeld(() => runSessionTool(session, { name, args }));
    if (isMutatingTool(name)) {
      sync.commit();
      await flush();
    }
    return data;
  };

  const drawStroke = (scene: PtScene) => {
    fireBoard(sceneToExcalidrawElements(scene, "light"));
  };

  return { session, invoke, getBoard: () => board, drawStroke, flush };
}

describe("live board sync", () => {
  test("T1 batch of 10 places lands on session and host", async () => {
    const live = createLiveHarness();
    const ops = Array.from({ length: 10 }, (_, i) => ({
      tool: "pt_place",
      args: { componentType: "button", at: { x: i * 20, y: 0 }, props: { label: `B${i}` } },
    }));
    const result = (await live.invoke("pt_batch", { ops, atomic: true })) as {
      rolledBack: boolean;
      results: Array<{ ok: boolean; data?: { instanceId?: string } }>;
    };
    expect(result.rolledBack).toBe(false);
    expect(result.results.every((row) => row.ok)).toBe(true);
    expect(nodeCount(live.session)).toBe(10);
    expect(instanceIdsOf(live.getBoard())).toHaveLength(10);
    expect(runSessionTool(live.session, { name: "pt_ir_get", args: {} }) as { freeNodes: unknown[] }).toMatchObject({
      freeNodes: expect.any(Array),
    });
    expect((runSessionTool(live.session, { name: "pt_ir_get", args: {} }) as { freeNodes: unknown[] }).freeNodes).toHaveLength(
      10,
    );
  });

  test("T2 non-atomic batch of 10 also lands all instances", async () => {
    const live = createLiveHarness();
    const ops = Array.from({ length: 10 }, (_, i) => ({
      tool: "pt_place",
      args: { componentType: "badge", at: { x: 0, y: i * 24 }, props: { label: `L${i}` } },
    }));
    await live.invoke("pt_batch", { ops, atomic: false });
    expect(nodeCount(live.session)).toBe(10);
    expect(instanceIdsOf(live.getBoard())).toHaveLength(10);
  });

  test("T3 atomic batch failure restores the pre-batch scene", async () => {
    const live = createLiveHarness();
    await live.invoke("pt_place", { componentType: "button", at: { x: 0, y: 0 }, props: { label: "Keep" } });
    const before = sceneFingerprint(live.session.getScene());
    const ops = [
      ...Array.from({ length: 5 }, (_, i) => ({
        tool: "pt_place",
        args: { componentType: "button", at: { x: 40 + i * 10, y: 0 } },
      })),
      { tool: "pt_place", args: { componentType: "not-a-component", at: { x: 0, y: 80 } } },
      ...Array.from({ length: 4 }, (_, i) => ({
        tool: "pt_place",
        args: { componentType: "button", at: { x: 200 + i * 10, y: 0 } },
      })),
    ];
    const result = (await live.invoke("pt_batch", { ops, atomic: true })) as { rolledBack: boolean };
    expect(result.rolledBack).toBe(true);
    expect(nodeCount(live.session)).toBe(1);
    expect(instanceIdsOf(live.getBoard())).toHaveLength(1);
    expect(live.session.getScene().elements.every((el) => !el.isDeleted)).toBe(true);
    expect(sceneFingerprint(live.session.getScene())).toBe(before);
  });

  test("T4 batch ids are immediately updatable", async () => {
    const live = createLiveHarness();
    const ops = Array.from({ length: 4 }, (_, i) => ({
      tool: "pt_place",
      args: { componentType: "button", at: { x: i * 40, y: 0 }, props: { label: `U${i}` } },
    }));
    const batch = (await live.invoke("pt_batch", { ops })) as {
      results: Array<{ data?: { instanceId?: string; instanceIds?: string[] } }>;
    };
    const first = batch.results[0]?.data?.instanceId ?? batch.results[0]?.data?.instanceIds?.[0];
    const last = batch.results[3]?.data?.instanceId ?? batch.results[3]?.data?.instanceIds?.[0];
    expect(first).toBeTruthy();
    expect(last).toBeTruthy();
    await live.invoke("pt_update", { instanceId: first, props: { label: "First" } });
    await live.invoke("pt_update", { instanceId: last, props: { label: "Last" } });
    const labels = live.session.getIR().freeNodes.map((node) => node.props.label);
    expect(labels).toContain("First");
    expect(labels).toContain("Last");
  });

  test("T5 card bbox w/h reaches IR and the host", async () => {
    const live = createLiveHarness();
    const placed = (await live.invoke("pt_place", { componentType: "card", at: { x: 0, y: 0 } })) as {
      instanceId: string;
    };
    await live.invoke("pt_update", { instanceId: placed.instanceId, bbox: { w: 420, h: 176 } });
    expect(live.session.getIR().freeNodes[0]?.bbox).toMatchObject({ w: 420, h: 176 });
    const root = live.getBoard().find((el) => el.customData?.pt?.instanceId === placed.instanceId);
    expect(root?.width).toBe(420);
    expect(root?.height).toBe(176);
  });

  test("T6 layout grid moves instances on the host", async () => {
    const live = createLiveHarness();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const placed = (await live.invoke("pt_place", {
        componentType: "card",
        at: { x: 0, y: 0 },
      })) as { instanceId: string };
      ids.push(placed.instanceId);
    }
    await live.invoke("pt_layout_grid", { instanceIds: ids, columns: 3, gap: 24 });
    const nodes = live.session.getIR().freeNodes.sort((l, r) => l.bbox.x - r.bbox.x);
    expect(nodes[1]!.bbox.x).toBe(nodes[0]!.bbox.x + nodes[0]!.bbox.w + 24);
    const xs = live
      .getBoard()
      .filter((el) => el.customData?.pt?.componentType === "card")
      .map((el) => el.x)
      .sort((a, b) => a - b);
    expect(xs[1]! - xs[0]!).toBe(nodes[0]!.bbox.w + 24);
  });

  test("T7 a user stroke is kept and a single place still pushes once", async () => {
    const live = createLiveHarness();
    await live.invoke("pt_place", { componentType: "button", at: { x: 8, y: 8 } });
    expect(instanceIdsOf(live.getBoard())).toHaveLength(1);
    const scene = live.session.getScene();
    live.drawStroke({
      ...scene,
      elements: [
        ...scene.elements,
        {
          ...scene.elements[0]!,
          id: "stroke-1",
          type: "freedraw",
          customData: undefined,
          text: undefined,
          x: 3,
          y: 4,
          width: 10,
          height: 10,
        },
      ],
    });
    expect(live.session.getScene().elements.some((el) => el.id === "stroke-1")).toBe(true);
    expect(live.session.getIR().freeNodes).toHaveLength(1);
  });

  test("T8 twenty sequential places all land", async () => {
    const live = createLiveHarness({ extraStaleEcho: true });
    for (let i = 0; i < 20; i++) {
      await live.invoke("pt_place", {
        componentType: "button",
        at: { x: 0, y: i * 36 },
        props: { label: `S${i}` },
      });
    }
    expect(nodeCount(live.session)).toBe(20);
    expect(instanceIdsOf(live.getBoard())).toHaveLength(20);
  });
});
