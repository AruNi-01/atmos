import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_CENTER_SPACE_ID,
  makeCenterSpaceKey,
} from "@/app-shell/center-space/center-space";
import { FIXED_TERMINAL_TAB_VALUE } from "@/features/terminal/lib/terminal-layout-document";
import type { LiveResourceSessionLocation } from "@/features/terminal/public";
import type { NavigateToLocatedPaneDeps } from "@/features/terminal/public";
import {
  buildLocatedPanePath,
  navigateToResourceMonitorSession,
} from "@/features/resource-monitor/lib/resource-monitor-session-navigation";

const HOST = "ws-host";

function location(
  overrides: Partial<LiveResourceSessionLocation> = {},
): LiveResourceSessionLocation {
  return {
    hostId: HOST,
    spaceId: DEFAULT_CENTER_SPACE_ID,
    paintContextId: HOST,
    terminalTabId: FIXED_TERMINAL_TAB_VALUE,
    paneId: "pane-1",
    sessionId: "sess-1",
    tmuxWindowName: "1",
    ...overrides,
  };
}

function createDeps(options?: {
  currentHostId?: string | null;
  spaceIds?: string[];
}) {
  const order: string[] = [];
  const deps: NavigateToLocatedPaneDeps & { order: string[] } = {
    order,
    hydrate: () => {
      order.push("hydrate");
    },
    ensureHost: (hostId) => {
      order.push(`ensureHost:${hostId}`);
    },
    listSpaceIds: () => options?.spaceIds ?? [DEFAULT_CENTER_SPACE_ID],
    currentHostId: () =>
      options?.currentHostId === undefined ? HOST : options.currentHostId,
    switchCenterSpace: async (hostId, spaceId, switchOptions) => {
      order.push(`switch:${hostId}:${spaceId}:${String(switchOptions.preserveDeepLink)}`);
    },
    setActiveSpace: (hostId, spaceId) => {
      order.push(`setActiveSpace:${hostId}:${spaceId}`);
    },
    requestLocate: (target) => {
      order.push(`request:${target.sessionId}`);
      return 1;
    },
  };
  return deps;
}

describe("buildLocatedPanePath", () => {
  test("builds a workspace deep link with tab and tmux", () => {
    expect(buildLocatedPanePath(location(), "workspace")).toBe(
      `/workspace?id=${HOST}&tab=${FIXED_TERMINAL_TAB_VALUE}&terminalTmux=1`,
    );
  });

  test("builds a project route", () => {
    expect(
      buildLocatedPanePath(
        location({ hostId: "proj-1", paintContextId: "proj-1" }),
        "project",
      ),
    ).toBe(`/project?id=proj-1&tab=${FIXED_TERMINAL_TAB_VALUE}&terminalTmux=1`);
  });

  test("omits terminalTmux for a simple PTY pane", () => {
    const simple = location({ tmuxWindowName: undefined });
    expect(buildLocatedPanePath(simple, "workspace")).toBe(
      `/workspace?id=${HOST}&tab=${FIXED_TERMINAL_TAB_VALUE}`,
    );
    expect(buildLocatedPanePath(simple, "workspace")).not.toContain("terminalTmux");
  });
});

describe("navigateToResourceMonitorSession", () => {
  test("switches the same-host space with preserveDeepLink before push", async () => {
    const deps = createDeps({ currentHostId: HOST });
    const pushed: string[] = [];
    const ok = await navigateToResourceMonitorSession(
      location({ spaceId: "space-abc", paintContextId: makeCenterSpaceKey(HOST, "space-abc") }),
      "workspace",
      {
        push: (path) => {
          deps.order.push(`push:${path}`);
          pushed.push(path);
        },
      },
      {
        ...deps,
        listSpaceIds: () => [DEFAULT_CENTER_SPACE_ID, "space-abc"],
      },
    );

    expect(ok).toBe(true);
    expect(deps.order).toEqual([
      "hydrate",
      `ensureHost:${HOST}`,
      `switch:${HOST}:space-abc:true`,
      "request:sess-1",
      `push:/workspace?id=${HOST}&tab=${FIXED_TERMINAL_TAB_VALUE}&terminalTmux=1`,
    ]);
    expect(pushed).toEqual([
      `/workspace?id=${HOST}&tab=${FIXED_TERMINAL_TAB_VALUE}&terminalTmux=1`,
    ]);
    expect(deps.order.indexOf(`switch:${HOST}:space-abc:true`)).toBeLessThan(
      deps.order.indexOf("request:sess-1"),
    );
    expect(deps.order.indexOf("request:sess-1")).toBeLessThan(
      deps.order.findIndex((step) => step.startsWith("push:")),
    );
  });

  test("setActiveSpace on a cross-host jump and still requests before push", async () => {
    const deps = createDeps({ currentHostId: "other-host" });
    const pushed: string[] = [];
    const ok = await navigateToResourceMonitorSession(
      location(),
      "workspace",
      { push: (path) => pushed.push(path) },
      deps,
    );

    expect(ok).toBe(true);
    expect(deps.order).toEqual([
      "hydrate",
      `ensureHost:${HOST}`,
      `setActiveSpace:${HOST}:${DEFAULT_CENTER_SPACE_ID}`,
      "request:sess-1",
    ]);
    expect(pushed).toHaveLength(1);
    expect(deps.order.some((step) => step.startsWith("switch:"))).toBe(false);
  });

  test("returns false when the target space does not exist and does not push", async () => {
    const deps = createDeps({ spaceIds: [DEFAULT_CENTER_SPACE_ID] });
    const pushed: string[] = [];
    const ok = await navigateToResourceMonitorSession(
      location({ spaceId: "missing", paintContextId: makeCenterSpaceKey(HOST, "missing") }),
      "workspace",
      { push: (path) => pushed.push(path) },
      deps,
    );
    expect(ok).toBe(false);
    expect(pushed).toEqual([]);
    expect(deps.order.includes("request:sess-1")).toBe(false);
  });

  test("uses a project route for project-direct sessions", async () => {
    const deps = createDeps({ currentHostId: "proj-1" });
    const pushed: string[] = [];
    const ok = await navigateToResourceMonitorSession(
      location({ hostId: "proj-1", paintContextId: "proj-1" }),
      "project",
      { push: (path) => pushed.push(path) },
      deps,
    );
    expect(ok).toBe(true);
    expect(pushed[0]).toBe(
      `/project?id=proj-1&tab=${FIXED_TERMINAL_TAB_VALUE}&terminalTmux=1`,
    );
  });

  test("simple PTY navigation has no tmux deep link", async () => {
    const deps = createDeps();
    const pushed: string[] = [];
    await navigateToResourceMonitorSession(
      location({ tmuxWindowName: undefined }),
      "workspace",
      { push: (path) => pushed.push(path) },
      deps,
    );
    expect(pushed[0]).toBe(`/workspace?id=${HOST}&tab=${FIXED_TERMINAL_TAB_VALUE}`);
    expect(pushed[0]).not.toContain("terminalTmux");
  });
});

describe("navigate space-before-push contract", () => {
  test("public helper switches before router.push and never calls agent attention", () => {
    const src = readFileSync(
      join(import.meta.dir, "../../terminal/public/navigate-to-located-pane.ts"),
      "utf8",
    );
    const switchAt = src.indexOf("await activateCenterSpaceForLocation");
    const requestAt = src.indexOf("requestLocate(location)");
    const pushAt = src.indexOf("options.router.push");
    expect(switchAt).toBeGreaterThan(0);
    expect(requestAt).toBeGreaterThan(switchAt);
    expect(pushAt).toBeGreaterThan(requestAt);
    expect(src).toContain("preserveDeepLink: true");
    expect(src).not.toContain("useAgentAttentionStore");
    expect(src).not.toContain("raise(");
    expect(src).not.toContain("navigateToAgentHook");
  });
});
