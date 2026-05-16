// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it, mock } from "bun:test";

import { agentUserIdFor, CanvasAgentPresenceStore } from "../canvas-agent-presence";

/**
 * Minimal fake editor that satisfies the methods the presence store touches.
 * We expose `_records` as a Map so tests can assert that the right
 * TLInstancePresence records were written into the store.
 *
 * Note: we cannot easily exercise the real `InstancePresenceRecordType.create`
 * shape here because tldraw refuses to construct it without a real schema. The
 * tests therefore wrap `editor.store.put` and just verify the high-level
 * intent (write happens, remove happens, follow APIs get called with the
 * right user id). End-to-end correctness of the record body is exercised in
 * the integrated browser tests (TEST.md → Follow Agent scenario).
 */
function makeFakeEditor() {
  const shapes = new Map<string, { id: string; w: number; h: number; x: number; y: number }>();
  const records = new Map<string, unknown>();
  const calls = {
    startFollowingUser: mock((userId: string) => userId),
    stopFollowingUser: mock(() => undefined),
    zoomToUser: mock((userId: string) => userId),
  };
  let followingUserId: string | null = null;
  return {
    _records: records,
    _calls: calls,
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
    getCurrentPageId: () => "page:main",
    getViewportScreenBounds: () => ({ x: 0, y: 0, w: 1000, h: 800 }),
    getViewportPageBounds: () => ({
      minX: -500,
      minY: -400,
      maxX: 500,
      maxY: 400,
      width: 1000,
      height: 800,
      center: { x: 0, y: 0 },
    }),
    getInstanceState: () => ({ followingUserId }),
    startFollowingUser: (userId: string) => {
      followingUserId = userId;
      calls.startFollowingUser(userId);
    },
    stopFollowingUser: () => {
      followingUserId = null;
      calls.stopFollowingUser();
    },
    zoomToUser: (userId: string) => {
      calls.zoomToUser(userId);
    },
    store: {
      put: (rs: Array<{ id: string }>) => {
        for (const r of rs) records.set(r.id, r);
      },
      remove: (ids: string[]) => {
        for (const id of ids) records.delete(id);
      },
    },
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
    expect(snapshot[0].user_id).toBe("agent:agent-1");
  });

  it("agentUserIdFor produces the documented 'agent:<id>' user id", () => {
    expect(agentUserIdFor("codex-42")).toBe("agent:codex-42");
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

  it("touch + setEditor writes a TLInstancePresence record into editor.store", () => {
    const editor = makeFakeEditor();
    const store = new CanvasAgentPresenceStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.setEditor(editor as any);
    store.touch({ actor_id: "agent-1", name: "Codex" }, "create_note");
    expect(editor._records.size).toBeGreaterThanOrEqual(1);
    const stored = Array.from(editor._records.values())[0] as { userId: string };
    expect(stored.userId).toBe("agent:agent-1");
  });

  it("setFollowedActor delegates to editor.startFollowingUser / stopFollowingUser", () => {
    const editor = makeFakeEditor();
    const store = new CanvasAgentPresenceStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.setEditor(editor as any);
    store.touch({ actor_id: "agent-1" }, "create_note");
    store.setFollowedActor("agent-1");
    expect(editor._calls.startFollowingUser).toHaveBeenCalledWith("agent:agent-1");
    expect(store.getFollowedActor()).toBe("agent-1");
    store.setFollowedActor(null);
    expect(editor._calls.stopFollowingUser).toHaveBeenCalled();
    expect(store.getFollowedActor()).toBeNull();
  });

  it("jumpToActor delegates to editor.zoomToUser", () => {
    const editor = makeFakeEditor();
    const store = new CanvasAgentPresenceStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.setEditor(editor as any);
    store.touch({ actor_id: "agent-7" }, "layout_row");
    store.jumpToActor("agent-7");
    expect(editor._calls.zoomToUser).toHaveBeenCalledWith("agent:agent-7");
  });

  it("setFollowedActor refuses unknown actor ids", () => {
    const editor = makeFakeEditor();
    const store = new CanvasAgentPresenceStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.setEditor(editor as any);
    store.setFollowedActor("ghost");
    expect(editor._calls.startFollowingUser).not.toHaveBeenCalled();
  });

  it("evictStale removes expired presence + clears the editor record", () => {
    const editor = makeFakeEditor();
    const store = new CanvasAgentPresenceStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.setEditor(editor as any);
    store.touch({ actor_id: "agent-1" }, "create_note");
    expect(editor._records.size).toBeGreaterThan(0);
    // Reach into the agent map and back-date the last_seen_at past the TTL.
    const internal = (store as unknown as {
      agents: Map<string, { last_seen_at: number }>;
    }).agents;
    const entry = internal.get("agent-1");
    if (entry) entry.last_seen_at = Date.now() - 5 * 60_000;
    store.evictStale();
    expect(store.getSnapshot()).toHaveLength(0);
    expect(editor._records.size).toBe(0);
  });

  it("clear removes all agents and emits", () => {
    const store = new CanvasAgentPresenceStore();
    store.touch({ actor_id: "agent-1" }, "noop");
    expect(store.getSnapshot()).toHaveLength(1);
    store.clear();
    expect(store.getSnapshot()).toHaveLength(0);
  });

  it("getSnapshot returns a stable reference until the store mutates", () => {
    // `useSyncExternalStore` uses Object.is on snapshots — returning a fresh
    // array per call would cause infinite re-renders.
    const store = new CanvasAgentPresenceStore();
    store.touch({ actor_id: "agent-1" }, "noop");
    const a = store.getSnapshot();
    const b = store.getSnapshot();
    expect(b).toBe(a);
    store.touch({ actor_id: "agent-2" }, "noop");
    const c = store.getSnapshot();
    expect(c).not.toBe(a);
  });

  it("setEditor(null) tears down records and cancels active follow", () => {
    const editor = makeFakeEditor();
    const store = new CanvasAgentPresenceStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.setEditor(editor as any);
    store.touch({ actor_id: "agent-1" }, "create_note");
    store.setFollowedActor("agent-1");
    store.setEditor(null);
    expect(editor._records.size).toBe(0);
    expect(editor._calls.stopFollowingUser).toHaveBeenCalled();
  });
});
