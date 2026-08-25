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
    });

    session.leave("a");
    session.enter("b", b);
    expect(session.getHostSnapshot()).toEqual({
      openId: "b",
      trigger: b,
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

  it("schedules with the default clock without Illegal invocation", () => {
    const session = createWorkspaceInfoHoverSession();
    expect(() => {
      session.enter("a", trigger("a"));
      session.leave("a");
      session.reset();
    }).not.toThrow();
  });

  it("only the hovered row instance gets the portal, even for the same workspace id", () => {
    const { clock, advance } = createClock();
    const session = createWorkspaceInfoHoverSession(clock);
    const first = trigger("first");
    const second = trigger("second");
    const slot = { id: "slot" } as unknown as HTMLElement;

    session.enter("ws", first, { instanceId: "row-1", immediate: true });
    session.setSlotEl(slot);
    expect(session.getPortalElForInstance("row-1")).toBe(slot);
    expect(session.getPortalElForInstance("row-2")).toBeNull();
    expect(session.getHostSnapshot()).toEqual({
      openId: "ws",
      trigger: first,
    });

    session.leave("row-1");
    session.enter("ws", second, { instanceId: "row-2" });
    expect(session.getOpenId()).toBe("ws");
    expect(session.getPortalElForInstance("row-1")).toBeNull();
    expect(session.getPortalElForInstance("row-2")).toBe(slot);
    expect(session.getHostSnapshot()).toEqual({
      openId: "ws",
      trigger: second,
    });
    advance(WORKSPACE_INFO_HOVER_CLOSE_DELAY_MS);
    expect(session.getOpenId()).toBe("ws");
  });

  it("ignores radix root dismiss while the pointer is on a row, the card, or a nested menu", () => {
    const { clock } = createClock();
    const session = createWorkspaceInfoHoverSession(clock);
    session.enter("a", trigger("a"), { immediate: true });
    expect(session.shouldIgnoreRootDismiss()).toBe(true);
    session.leave("a");
    expect(session.shouldIgnoreRootDismiss()).toBe(false);
    session.hold();
    expect(session.shouldIgnoreRootDismiss()).toBe(true);
    session.unhold();
    expect(session.shouldIgnoreRootDismiss()).toBe(false);
    session.setLock("status", true);
    expect(session.shouldIgnoreRootDismiss()).toBe(true);
  });

  it("keeps the host snapshot identity when only the portal slot changes", () => {
    const { clock } = createClock();
    const session = createWorkspaceInfoHoverSession(clock);
    const a = trigger("a");
    session.enter("a", a, { immediate: true });
    const snapshot = session.getHostSnapshot();
    let notified = 0;
    session.subscribe(() => {
      notified += 1;
    });

    const slot = { id: "slot" } as unknown as HTMLElement;
    session.setSlotEl(slot);
    expect(session.getSlotEl()).toBe(slot);
    expect(session.getHostSnapshot()).toBe(snapshot);
    expect(notified).toBe(1);

    session.setSlotEl(slot);
    expect(notified).toBe(1);
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
    expect(content).toContain("instanceId: hoverInstanceId");
    expect(content).toContain("createPortal");
    expect(content).not.toContain(", 1000)");
    expect(host).toContain("PopoverAnchor");
    expect(host).toContain("data-workspace-info-hover-host");
    expect(host).toContain('followMotion ? "follow"');
    expect(host).toContain("data-radix-popper-content-wrapper");
    expect(host).toContain("transition: transform");
    expect(host).toContain("onPointerDownOutside");
    expect(host).toContain("onInteractOutside");
    expect(host).toContain("shouldIgnoreRootDismiss");
    expect(host).toContain("pointerover");
    expect(content).toContain("isWorkspaceInfoHoverKeepAliveTarget");
    expect(host).not.toContain("setSlotEl(el)");
    expect(sidebar).toContain("WorkspaceInfoHoverHost");

    const session = readFileSync(
      join(import.meta.dir, "../sidebar/workspace-info-hover-session.ts"),
      "utf8",
    );
    expect(session).toContain("dropdown-menu-content");
    expect(session).toContain("bind(globalThis)");
    expect(session).not.toMatch(/Clock = \{\s*setTimeout,\s*clearTimeout,/);
  });
});
