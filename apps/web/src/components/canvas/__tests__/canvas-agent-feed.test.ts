// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import { CanvasAgentFeedStore } from "../canvas-agent-feed";
import { describeCanvasAgentCommand } from "../canvas-agent-feed-labels";

describe("describeCanvasAgentCommand", () => {
  it("maps read verbs", () => {
    expect(describeCanvasAgentCommand("get-state").label).toBe("Reading canvas");
    expect(describeCanvasAgentCommand("get-state").kind).toBe("read");
  });

  it("maps update-shape text patch", () => {
    const d = describeCanvasAgentCommand("update-shape", {
      patch: { text: "hello" },
    });
    expect(d.label).toBe("Editing shape and writing");
    expect(d.kind).toBe("edit");
  });

  it("appends and writing for create-note with --text", () => {
    const d = describeCanvasAgentCommand("create-note", { text: "Title" });
    expect(d.label).toBe("Creating sticky note and writing");
    expect(d.kind).toBe("create");
  });

  it("appends and writing for create-geo with --text", () => {
    const d = describeCanvasAgentCommand("create-geo", {
      kind: "rectangle",
      text: "Label",
    });
    expect(d.label).toBe("Creating rectangle and writing");
  });

  it("maps set-status instead of the generic fallback", () => {
    expect(describeCanvasAgentCommand("set_status", { status: "idle" }).label).toBe(
      "Finished on canvas",
    );
    expect(describeCanvasAgentCommand("set-status", { status: "active" }).label).toBe(
      "Canvas session active",
    );
    expect(describeCanvasAgentCommand("unknown-verb").label).toBe("Working on canvas");
  });
});

describe("CanvasAgentFeedStore", () => {
  it("tracks active then completed entries", () => {
    const store = new CanvasAgentFeedStore();
    store.begin("r1", "create-note");
    expect(store.getCurrentEntry()?.status).toBe("active");
    store.complete("r1", true);
    expect(store.getCurrentEntry()?.status).toBe("done");
  });

  it("groups rapid commands into one batch", () => {
    const store = new CanvasAgentFeedStore();
    store.begin("r1", "create-note");
    store.complete("r1", true);
    store.begin("r2", "create-geo", { geo: "rectangle" });
    const { batches } = store.getSnapshot();
    expect(batches).toHaveLength(1);
    expect(batches[0]?.entries).toHaveLength(2);
  });

  it("getSnapshot() returns a stable reference until the store mutates", () => {
    const store = new CanvasAgentFeedStore();
    const a = store.getSnapshot();
    const b = store.getSnapshot();
    expect(a).toBe(b);
    store.begin("r1", "status");
    const c = store.getSnapshot();
    expect(c).not.toBe(a);
    const d = store.getSnapshot();
    expect(c).toBe(d);
  });

  it("marks failed commands as error", () => {
    const store = new CanvasAgentFeedStore();
    store.begin("r1", "delete");
    store.complete("r1", false);
    expect(store.getCurrentEntry()?.status).toBe("error");
  });

  it("finalizeRequest clears active status in finally", () => {
    const store = new CanvasAgentFeedStore();
    store.begin("r1", "create-note");
    store.finalizeRequest("r1", true);
    expect(store.getSnapshot().activeEntryId).toBeNull();
    expect(store.getCurrentEntry()?.status).toBe("done");
  });

  it("dedupes begin with the same request_id", () => {
    const store = new CanvasAgentFeedStore();
    store.begin("r1", "create-note");
    store.begin("r1", "create-note");
    const { batches } = store.getSnapshot();
    expect(batches[0]?.entries).toHaveLength(1);
  });
});
