import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createWorkspaceInfoHoverSession,
  WORKSPACE_INFO_HOVER_CLOSE_DELAY_MS,
  WORKSPACE_INFO_HOVER_OPEN_DELAY_MS,
} from "../sidebar/workspace-info-hover-session";

function createClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { fn: () => void; fireAt: number }>();

  const setTimeoutFn = ((fn: () => void, ms?: number) => {
    const id = nextId++;
    timers.set(id, { fn, fireAt: now + (ms ?? 0) });
    return id as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;

  const clearTimeoutFn = ((id: ReturnType<typeof setTimeout>) => {
    timers.delete(id as unknown as number);
  }) as typeof clearTimeout;

  const advance = (ms: number) => {
    now += ms;
    const due = [...timers.entries()]
      .filter(([, timer]) => timer.fireAt <= now)
      .sort((a, b) => a[1].fireAt - b[1].fireAt);
    for (const [id, timer] of due) {
      if (!timers.has(id)) continue;
      timers.delete(id);
      timer.fn();
    }
  };

  return { clock: { setTimeout: setTimeoutFn, clearTimeout: clearTimeoutFn }, advance };
}

function trigger(id: string) {
  return { id } as unknown as HTMLElement;
}

describe("workspace info hover session", () => {
  it("waits the open delay on first hover", () => {
    const { clock, advance } = createClock();
    const session = createWorkspaceInfoHoverSession(clock);
    session.enter("a", trigger("a"));
    expect(session.getOpenId()).toBeNull();
    advance(WORKSPACE_INFO_HOVER_OPEN_DELAY_MS - 1);
    expect(session.getOpenId()).toBeNull();
    advance(1);
    expect(session.getOpenId()).toBe("a");
  });

  it("resets the open delay when hopping before the popover appears", () => {
    const { clock, advance } = createClock();
    const session = createWorkspaceInfoHoverSession(clock);
    session.enter("a", trigger("a"));
    advance(WORKSPACE_INFO_HOVER_OPEN_DELAY_MS - 50);
    session.leave("a");
    session.enter("b", trigger("b"));
    advance(WORKSPACE_INFO_HOVER_OPEN_DELAY_MS - 1);
    expect(session.getOpenId()).toBeNull();
    advance(1);
    expect(session.getOpenId()).toBe("b");
  });

  it("swaps the open row immediately once the popover is already showing", () => {
    const { clock, advance } = createClock();
    const session = createWorkspaceInfoHoverSession(clock);
    const a = trigger("a");
    const b = trigger("b");
    session.enter("a", a);
    advance(WORKSPACE_INFO_HOVER_OPEN_DELAY_MS);
    expect(session.getHostSnapshot()).toEqual({
      openId: "a",
      trigger: a,
      slotEl: null,
    });

    session.leave("a");
    session.enter("b", b);
    expect(session.getHostSnapshot()).toEqual({
      openId: "b",
      trigger: b,
      slotEl: null,
    });
    advance(WORKSPACE_INFO_HOVER_OPEN_DELAY_MS);
    expect(session.getOpenId()).toBe("b");
  });

  it("does not close while moving across rows inside the close delay", () => {
    const { clock, advance } = createClock();
    const session = createWorkspaceInfoHoverSession(clock);
    session.enter("a", trigger("a"));
    advance(WORKSPACE_INFO_HOVER_OPEN_DELAY_MS);
    session.leave("a");
    advance(WORKSPACE_INFO_HOVER_CLOSE_DELAY_MS - 1);
    expect(session.getOpenId()).toBe("a");
    session.enter("c", trigger("c"));
    expect(session.getOpenId()).toBe("c");
  });

  it("closes after leaving the list if no other row takes over", () => {
    const { clock, advance } = createClock();
    const session = createWorkspaceInfoHoverSession(clock);
    session.enter("a", trigger("a"));
    advance(WORKSPACE_INFO_HOVER_OPEN_DELAY_MS);
    session.leave("a");
    advance(WORKSPACE_INFO_HOVER_CLOSE_DELAY_MS);
    expect(session.getOpenId()).toBeNull();
  });

  it("stays open while the pointer is on the popover", () => {
    const { clock, advance } = createClock();
    const session = createWorkspaceInfoHoverSession(clock);
    session.enter("a", trigger("a"));
    advance(WORKSPACE_INFO_HOVER_OPEN_DELAY_MS);
    session.leave("a");
    session.hold();
    advance(WORKSPACE_INFO_HOVER_CLOSE_DELAY_MS + 20);
    expect(session.getOpenId()).toBe("a");
    session.unhold();
    advance(WORKSPACE_INFO_HOVER_CLOSE_DELAY_MS);
    expect(session.getOpenId()).toBeNull();
  });

  it("keeps the popover open while a nested menu is locked", () => {
    const { clock, advance } = createClock();
    const session = createWorkspaceInfoHoverSession(clock);
    session.enter("a", trigger("a"));
    advance(WORKSPACE_INFO_HOVER_OPEN_DELAY_MS);
    session.setLock("status", true);
    session.leave("a");
    advance(WORKSPACE_INFO_HOVER_CLOSE_DELAY_MS + 20);
    expect(session.getOpenId()).toBe("a");
    session.setLock("status", false);
    advance(WORKSPACE_INFO_HOVER_CLOSE_DELAY_MS);
    expect(session.getOpenId()).toBeNull();
  });

  it("opens immediately on touch and dismisses without waiting", () => {
    const { clock, advance } = createClock();
    const session = createWorkspaceInfoHoverSession(clock);
    session.enter("a", trigger("a"), { immediate: true });
    expect(session.getOpenId()).toBe("a");
    session.dismiss();
    expect(session.getOpenId()).toBeNull();
    advance(WORKSPACE_INFO_HOVER_OPEN_DELAY_MS);
    expect(session.getOpenId()).toBeNull();
  });
});

describe("left sidebar workspace info hover wiring", () => {
  it("uses a shared host so list hops replace content instead of re-waiting", () => {
    const content = readFileSync(
      join(import.meta.dir, "../sidebar/WorkspaceContent.tsx"),
      "utf8",
    );
    const host = readFileSync(
      join(import.meta.dir, "../sidebar/WorkspaceInfoHoverHost.tsx"),
      "utf8",
    );
    const sidebar = readFileSync(
      join(import.meta.dir, "../LeftSidebar.tsx"),
      "utf8",
    );

    expect(content).toContain("workspaceInfoHoverSession.enter");
    expect(content).toContain("createPortal");
    expect(content).not.toContain(", 1000)");
    expect(host).toContain("PopoverAnchor");
    expect(host).toContain("data-workspace-info-hover-host");
    expect(sidebar).toContain("WorkspaceInfoHoverHost");
  });
});
