// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CanvasAgentFeedStore } from "../lib/canvas-agent-feed";
import { describeCanvasAgentCommand } from "../lib/canvas-agent-feed-labels";

describe("CanvasAgentIsland", () => {
  it("uses the shared agent surface island", () => {
    const island = readFileSync(
      join(import.meta.dir, "../components/CanvasAgentIsland.tsx"),
      "utf8",
    );
    expect(island).toContain("AgentSurfaceIsland");
    expect(island).toContain("@/shared/components/agent-surface-island");
  });
});

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

  it("finalizeRequest attaches screenshot onto the feed entry", () => {
    const store = new CanvasAgentFeedStore();
    store.begin("r-shot", "screenshot");
    store.finalizeRequest("r-shot", true, {
      screenshot: {
        dataUrl: "data:image/jpeg;base64,abc",
        width: 100,
        height: 80,
      },
    });
    const entry = store.getCurrentEntry();
    expect(entry?.status).toBe("done");
    expect(entry?.screenshot?.dataUrl).toContain("data:image/jpeg");
    expect(entry?.screenshot?.width).toBe(100);
    expect(entry?.screenshot?.height).toBe(80);
  });

  it("begin clears a previous screenshot when reusing request_id", () => {
    const store = new CanvasAgentFeedStore();
    store.begin("r-reuse", "screenshot");
    store.finalizeRequest("r-reuse", true, {
      screenshot: {
        dataUrl: "data:image/jpeg;base64,old",
        width: 100,
        height: 80,
      },
    });
    store.begin("r-reuse", "create-note");
    const entry = store.getCurrentEntry();
    expect(entry?.status).toBe("active");
    expect(entry?.screenshot).toBeNull();
  });

  it("finalizeRequest emits when attaching screenshot to an already-completed entry", () => {
    const store = new CanvasAgentFeedStore();
    store.begin("r-late", "screenshot");
    store.complete("r-late", true);
    let emits = 0;
    store.subscribe(() => {
      emits += 1;
    });
    store.finalizeRequest("r-late", true, {
      screenshot: {
        dataUrl: "data:image/jpeg;base64,late",
        width: 50,
        height: 40,
      },
    });
    expect(emits).toBeGreaterThan(0);
    expect(store.getCurrentEntry()?.screenshot?.dataUrl).toContain("base64,late");
  });
});
