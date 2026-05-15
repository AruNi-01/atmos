// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import { CanvasAgentPresenceStore } from "../canvas-agent-presence";

function makeFakeEditor() {
  const shapes = new Map<string, { id: string; w: number; h: number; x: number; y: number }>();
  return {
    shapes,
    addShape(id: string, x: number, y: number, w: number, h: number) {
      shapes.set(id, { id, x, y, w, h });
    },
    getShape: (id: string) => shapes.get(id),
    getShapePageBounds: (id: string) => {
      const s = shapes.get(id);
      if (!s) return null;
      return {
        minX: s.x,
        minY: s.y,
        maxX: s.x + s.w,
        maxY: s.y + s.h,
        width: s.w,
        height: s.h,
      };
    },
    getCamera: () => ({ x: 0, y: 0, z: 1 }),
  };
}

describe("CanvasAgentPresenceStore", () => {
  it("touch records actor metadata and last_command", () => {
    const store = new CanvasAgentPresenceStore();
    store.touch({ actor_id: "agent-1", name: "Codex", color: "#abc" }, "create_note");
    const snapshot = store.getSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].name).toBe("Codex");
    expect(snapshot[0].last_command).toBe("create_note");
  });

  it("recordResult computes aggregate bounds across multiple shapes", () => {
    const editor = makeFakeEditor();
    editor.addShape("a", 0, 0, 100, 100);
    editor.addShape("b", 200, 50, 80, 80);
    const store = new CanvasAgentPresenceStore();
    store.touch({ actor_id: "agent-1" }, "layout_row");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.recordResult("agent-1", editor as any, ["a", "b"]);
    const [presence] = store.getSnapshot();
    expect(presence.last_bounds?.x).toBe(0);
    expect(presence.last_bounds?.y).toBe(0);
    expect(presence.last_bounds?.w).toBe(280);
    expect(presence.last_bounds?.h).toBe(130);
    expect(presence.last_shape_ids).toEqual(["a", "b"]);
  });

  it("setFollowedActor emits and is readable", () => {
    const store = new CanvasAgentPresenceStore();
    let calls = 0;
    store.subscribe(() => calls++);
    store.setFollowedActor("agent-1");
    expect(store.getFollowedActor()).toBe("agent-1");
    store.setFollowedActor(null);
    expect(store.getFollowedActor()).toBeNull();
    expect(calls).toBe(2);
  });

  it("clear removes all agents and emits", () => {
    const store = new CanvasAgentPresenceStore();
    store.touch({ actor_id: "agent-1" }, "noop");
    expect(store.getSnapshot()).toHaveLength(1);
    store.clear();
    expect(store.getSnapshot()).toHaveLength(0);
  });
});
