import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_CENTER_SPACE_ID,
  makeCenterSpaceKey,
} from "@/app-shell/center-space/center-space";
import { prepareWorkspaceContextNavigation } from "@/app-shell/workspace-surface-switch";
import { FIXED_TERMINAL_TAB_VALUE } from "@/features/terminal/lib/terminal-layout-document";
import {
  commitLocatedPaneNavigation,
  type LiveResourceSessionLocation,
  type LocatedPaneHref,
  type NavigateToLocatedPaneDeps,
} from "@/features/terminal/public";
import {
  buildLocatedPanePath,
  locationMatchesDestination,
  navigateToResourceMonitorSession,
  runResourceMonitorSessionNavigation,
  waitForDestination,
} from "@/features/resource-monitor/lib/resource-monitor-session-navigation";

const HOST = "ws-host";
const EXTRA = "space-abc";
const EXTRA_TMUX = `cs__${EXTRA}__2`;

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

function extraLocation(
  overrides: Partial<LiveResourceSessionLocation> = {},
): LiveResourceSessionLocation {
  return location({
    spaceId: EXTRA,
    paintContextId: makeCenterSpaceKey(HOST, EXTRA),
    paneId: "pane-extra",
    sessionId: "sess-extra",
    tmuxWindowName: EXTRA_TMUX,
    ...overrides,
  });
}

function hrefFromPath(path: string): LocatedPaneHref {
  const url = new URL(path, "https://app.local");
  return { pathname: url.pathname, search: url.search };
}

function createHarness(options?: {
  currentHostId?: string | null;
  spaceIds?: string[];
  initialHref?: LocatedPaneHref;
  commitOnPush?: boolean;
  waitAttempts?: number;
}) {
  const href: LocatedPaneHref = {
    ...(options?.initialHref ?? {
      pathname: "/workspace",
      search: `?id=${HOST}&tab=${FIXED_TERMINAL_TAB_VALUE}&terminalTmux=1`,
    }),
  };
  const order: string[] = [];
  const deps: NavigateToLocatedPaneDeps & { order: string[]; href: LocatedPaneHref } = {
    order,
    href,
    hydrate: () => {
      order.push("hydrate");
    },
    ensureHost: (hostId) => {
      order.push(`ensureHost:${hostId}`);
    },
    listSpaceIds: () => options?.spaceIds ?? [DEFAULT_CENTER_SPACE_ID, EXTRA],
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
    clearLocate: () => {
      order.push("clear");
    },
    getLocation: () => ({ pathname: href.pathname, search: href.search }),
    sleep: async () => {},
    waitAttempts: options?.waitAttempts ?? 3,
    waitIntervalMs: 50,
  };
  const router = {
    push: (path: string) => {
      order.push(`push:${path}`);
      if (options?.commitOnPush !== false) {
        const next = hrefFromPath(path);
        href.pathname = next.pathname;
        href.search = next.search;
      }
    },
  };
  return { deps, router, href };
}

function createPrepareAwareDeepLinkRouter(options: {
  currentHref: string;
  href: LocatedPaneHref;
  order: string[];
  commitOnPush?: boolean;
}) {
  const apply = (prepared: string, label: "push" | "deepLink") => {
    options.order.push(`${label}:${prepared}`);
    if (options.commitOnPush !== false) {
      const next = hrefFromPath(prepared);
      options.href.pathname = next.pathname;
      options.href.search = next.search;
    }
  };
  return {
    push: (path: string) => {
      apply(prepareWorkspaceContextNavigation(path, options.currentHref), "push");
    },
    pushWorkspaceDeepLink: (path: string) => {
      apply(prepareWorkspaceContextNavigation(path, null), "deepLink");
    },
  };
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

describe("locationMatchesDestination / waitForDestination", () => {
  test("rejects leftover terminalTmux=1 when dest is a simple PTY", () => {
    expect(
      locationMatchesDestination(
        {
          pathname: "/workspace",
          search: `?id=${HOST}&tab=${FIXED_TERMINAL_TAB_VALUE}&terminalTmux=1`,
        },
        {
          pathname: "/workspace",
          id: HOST,
          tab: FIXED_TERMINAL_TAB_VALUE,
        },
      ),
    ).toBe(false);
    expect(
      locationMatchesDestination(
        {
          pathname: "/workspace",
          search: `?id=${HOST}&tab=${FIXED_TERMINAL_TAB_VALUE}`,
        },
        {
          pathname: "/workspace",
          id: HOST,
          tab: FIXED_TERMINAL_TAB_VALUE,
        },
      ),
    ).toBe(true);
  });

  test("requires the namespaced dest tmux, not the leftover default 1", () => {
    expect(
      locationMatchesDestination(
        {
          pathname: "/workspace",
          search: `?id=${HOST}&tab=${FIXED_TERMINAL_TAB_VALUE}&terminalTmux=1`,
        },
        {
          pathname: "/workspace",
          id: HOST,
          tab: FIXED_TERMINAL_TAB_VALUE,
          terminalTmux: EXTRA_TMUX,
        },
      ),
    ).toBe(false);
    expect(
      locationMatchesDestination(
        {
          pathname: "/en/workspace",
          search: `?id=${HOST}&tab=${FIXED_TERMINAL_TAB_VALUE}&terminalTmux=${EXTRA_TMUX}`,
        },
        {
          pathname: "/workspace",
          id: HOST,
          tab: FIXED_TERMINAL_TAB_VALUE,
          terminalTmux: EXTRA_TMUX,
        },
      ),
    ).toBe(true);
  });

  test("polls an injectable location without sleeping real time", async () => {
    const hrefs: LocatedPaneHref[] = [
      {
        pathname: "/workspace",
        search: `?id=${HOST}&tab=${FIXED_TERMINAL_TAB_VALUE}&terminalTmux=1`,
      },
      {
        pathname: "/workspace",
        search: `?id=${HOST}&tab=${FIXED_TERMINAL_TAB_VALUE}&terminalTmux=1`,
      },
      {
        pathname: "/workspace",
        search: `?id=${HOST}&tab=${FIXED_TERMINAL_TAB_VALUE}&terminalTmux=${EXTRA_TMUX}`,
      },
    ];
    let index = 0;
    let sleeps = 0;
    const ok = await waitForDestination(
      {
        pathname: "/workspace",
        id: HOST,
        tab: FIXED_TERMINAL_TAB_VALUE,
        terminalTmux: EXTRA_TMUX,
      },
      {
        getLocation: () => hrefs[Math.min(index, hrefs.length - 1)]!,
        sleep: async () => {
          sleeps += 1;
          index += 1;
        },
        intervalMs: 50,
        attempts: 4,
      },
    );
    expect(ok).toBe(true);
    expect(sleeps).toBe(2);
  });
});

describe("commitLocatedPaneNavigation", () => {
  test("prefers pushWorkspaceDeepLink and falls back to push", () => {
    const order: string[] = [];
    commitLocatedPaneNavigation(
      {
        push: (path) => order.push(`push:${path}`),
        pushWorkspaceDeepLink: (path) => order.push(`deepLink:${path}`),
      },
      "/workspace?id=ws-b&tab=terminal&terminalTmux=1",
    );
    expect(order).toEqual([
      "deepLink:/workspace?id=ws-b&tab=terminal&terminalTmux=1",
    ]);

    order.length = 0;
    commitLocatedPaneNavigation(
      { push: (path) => order.push(`push:${path}`) },
      "/workspace?id=ws-b&tab=terminal",
    );
    expect(order).toEqual(["push:/workspace?id=ws-b&tab=terminal"]);
  });
});

describe("navigateToResourceMonitorSession", () => {
  test("commits dest then switches same-host with preserveDeepLink", async () => {
    const { deps, router } = createHarness();
    const dest = location({
      spaceId: EXTRA,
      paintContextId: makeCenterSpaceKey(HOST, EXTRA),
    });
    const path = buildLocatedPanePath(dest, "workspace");
    const ok = await navigateToResourceMonitorSession(dest, "workspace", router, deps);

    expect(ok).toBe(true);
    expect(deps.order).toEqual([
      "hydrate",
      `ensureHost:${HOST}`,
      "request:sess-1",
      `push:${path}`,
      `switch:${HOST}:${EXTRA}:true`,
    ]);
    expect(deps.order.indexOf(`push:${path}`)).toBeLessThan(
      deps.order.indexOf(`switch:${HOST}:${EXTRA}:true`),
    );
    expect(deps.order.indexOf("request:sess-1")).toBeLessThan(
      deps.order.indexOf(`switch:${HOST}:${EXTRA}:true`),
    );
  });

  test("setActiveSpace on a cross-host jump, then push a complete dest", async () => {
    const { deps, router } = createHarness({ currentHostId: "other-host" });
    const dest = location();
    const path = buildLocatedPanePath(dest, "workspace");
    const ok = await navigateToResourceMonitorSession(dest, "workspace", router, deps);

    expect(ok).toBe(true);
    expect(deps.order).toEqual([
      "hydrate",
      `ensureHost:${HOST}`,
      `setActiveSpace:${HOST}:${DEFAULT_CENTER_SPACE_ID}`,
      "request:sess-1",
      `push:${path}`,
    ]);
    expect(deps.order.some((step) => step.startsWith("switch:"))).toBe(false);
    expect(path).toContain(`id=${HOST}`);
    expect(path).toContain(`tab=${FIXED_TERMINAL_TAB_VALUE}`);
    expect(path).toContain("terminalTmux=1");
  });

  test("cross-host tmux dest keeps identical tab and terminalTmux through pushWorkspaceDeepLink", async () => {
    const dest = location({
      hostId: "ws-b",
      paintContextId: "ws-b",
      sessionId: "sess-b",
    });
    const path = buildLocatedPanePath(dest, "workspace");
    const currentHref = `/workspace?id=other-host&tab=${FIXED_TERMINAL_TAB_VALUE}&terminalTmux=1`;
    expect(prepareWorkspaceContextNavigation(path, currentHref)).not.toContain("tab=");
    expect(prepareWorkspaceContextNavigation(path, currentHref)).not.toContain(
      "terminalTmux",
    );
    expect(prepareWorkspaceContextNavigation(path, null)).toBe(path);

    const { deps, href } = createHarness({
      currentHostId: "other-host",
      initialHref: hrefFromPath(currentHref),
    });
    const router = createPrepareAwareDeepLinkRouter({
      currentHref,
      href,
      order: deps.order,
    });
    const ok = await navigateToResourceMonitorSession(dest, "workspace", router, deps);

    expect(ok).toBe(true);
    expect(deps.order).toEqual([
      "hydrate",
      "ensureHost:ws-b",
      `setActiveSpace:ws-b:${DEFAULT_CENTER_SPACE_ID}`,
      "request:sess-b",
      `deepLink:${path}`,
    ]);
    expect(href.search).toContain(`id=ws-b`);
    expect(href.search).toContain(`tab=${FIXED_TERMINAL_TAB_VALUE}`);
    expect(href.search).toContain("terminalTmux=1");
    expect(deps.order.some((step) => step.startsWith("push:"))).toBe(false);
    expect(deps.order.some((step) => step.startsWith("switch:"))).toBe(false);
  });

  test("cross-host simple PTY dest keeps identical tab through pushWorkspaceDeepLink", async () => {
    const dest = location({
      hostId: "ws-b",
      paintContextId: "ws-b",
      sessionId: "sess-pty-b",
      tmuxWindowName: undefined,
    });
    const path = buildLocatedPanePath(dest, "workspace");
    const currentHref = `/workspace?id=other-host&tab=${FIXED_TERMINAL_TAB_VALUE}`;
    expect(path).not.toContain("terminalTmux");
    expect(prepareWorkspaceContextNavigation(path, currentHref)).not.toContain("tab=");
    expect(prepareWorkspaceContextNavigation(path, null)).toBe(path);

    const { deps, href } = createHarness({
      currentHostId: "other-host",
      initialHref: hrefFromPath(currentHref),
    });
    const router = createPrepareAwareDeepLinkRouter({
      currentHref,
      href,
      order: deps.order,
    });
    const ok = await navigateToResourceMonitorSession(dest, "workspace", router, deps);

    expect(ok).toBe(true);
    expect(deps.order).toEqual([
      "hydrate",
      "ensureHost:ws-b",
      `setActiveSpace:ws-b:${DEFAULT_CENTER_SPACE_ID}`,
      "request:sess-pty-b",
      `deepLink:${path}`,
    ]);
    expect(href.search).toContain(`id=ws-b`);
    expect(href.search).toContain(`tab=${FIXED_TERMINAL_TAB_VALUE}`);
    expect(href.search).not.toContain("terminalTmux");
  });

  test("returns false when the target space does not exist and does not push", async () => {
    const { deps, router } = createHarness({ spaceIds: [DEFAULT_CENTER_SPACE_ID] });
    const dest = location({
      spaceId: "missing",
      paintContextId: makeCenterSpaceKey(HOST, "missing"),
    });
    const ok = await navigateToResourceMonitorSession(dest, "workspace", router, deps);
    expect(ok).toBe(false);
    expect(deps.order).toEqual(["hydrate", `ensureHost:${HOST}`, "clear"]);
    expect(deps.order.some((step) => step.startsWith("push:"))).toBe(false);
    expect(deps.order.some((step) => step.startsWith("switch:"))).toBe(false);
    expect(deps.order.includes("request:sess-1")).toBe(false);
  });

  test("uses a project route for project-direct sessions", async () => {
    const { deps, router } = createHarness({
      currentHostId: "proj-1",
      initialHref: {
        pathname: "/project",
        search: `?id=proj-1&tab=${FIXED_TERMINAL_TAB_VALUE}&terminalTmux=1`,
      },
      spaceIds: [DEFAULT_CENTER_SPACE_ID],
    });
    const dest = location({ hostId: "proj-1", paintContextId: "proj-1" });
    const ok = await navigateToResourceMonitorSession(dest, "project", router, deps);
    expect(ok).toBe(true);
    expect(deps.order.some((step) => step.startsWith("push:/project?"))).toBe(true);
  });

  test("simple PTY navigation has no tmux deep link", async () => {
    const { deps, router } = createHarness();
    const dest = location({ tmuxWindowName: undefined });
    await navigateToResourceMonitorSession(dest, "workspace", router, deps);
    const push = deps.order.find((step) => step.startsWith("push:"));
    expect(push).toBe(`push:/workspace?id=${HOST}&tab=${FIXED_TERMINAL_TAB_VALUE}`);
    expect(push).not.toContain("terminalTmux");
  });

  test("initial URL terminalTmux=1 then extra namespaced tmux waits for dest before switch", async () => {
    const { deps, router, href } = createHarness({
      initialHref: {
        pathname: "/workspace",
        search: `?id=${HOST}&tab=${FIXED_TERMINAL_TAB_VALUE}&terminalTmux=1`,
      },
    });
    const dest = extraLocation();
    const path = buildLocatedPanePath(dest, "workspace");
    const ok = await navigateToResourceMonitorSession(dest, "workspace", router, deps);

    expect(ok).toBe(true);
    expect(href.search).toContain(`terminalTmux=${EXTRA_TMUX}`);
    expect(href.search).not.toMatch(/terminalTmux=1(?:&|$)/);
    expect(deps.order).toEqual([
      "hydrate",
      `ensureHost:${HOST}`,
      "request:sess-extra",
      `push:${path}`,
      `switch:${HOST}:${EXTRA}:true`,
    ]);
  });

  test("extra simple PTY dest waits until leftover terminalTmux is cleared", async () => {
    const { deps, router, href } = createHarness();
    const dest = extraLocation({ tmuxWindowName: undefined, sessionId: "sess-pty" });
    const path = buildLocatedPanePath(dest, "workspace");
    const ok = await navigateToResourceMonitorSession(dest, "workspace", router, deps);

    expect(ok).toBe(true);
    expect(path).not.toContain("terminalTmux");
    expect(href.search).not.toContain("terminalTmux");
    expect(deps.order).toEqual([
      "hydrate",
      `ensureHost:${HOST}`,
      "request:sess-pty",
      `push:${path}`,
      `switch:${HOST}:${EXTRA}:true`,
    ]);
  });

  test("URL commit failure clears pending locate and does not switch", async () => {
    const { deps, router, href } = createHarness({
      commitOnPush: false,
      waitAttempts: 3,
    });
    const dest = extraLocation();
    const path = buildLocatedPanePath(dest, "workspace");
    const ok = await navigateToResourceMonitorSession(dest, "workspace", router, deps);

    expect(ok).toBe(false);
    expect(href.search).toContain("terminalTmux=1");
    expect(deps.order).toEqual([
      "hydrate",
      `ensureHost:${HOST}`,
      "request:sess-extra",
      `push:${path}`,
      "clear",
    ]);
    expect(deps.order.some((step) => step.startsWith("switch:"))).toBe(false);
  });

  test("switches only after dest commit, not immediately after push", async () => {
    const href: LocatedPaneHref = {
      pathname: "/workspace",
      search: `?id=${HOST}&tab=${FIXED_TERMINAL_TAB_VALUE}&terminalTmux=1`,
    };
    const order: string[] = [];
    let commitAfterSleeps = 0;
    const dest = extraLocation();
    const path = buildLocatedPanePath(dest, "workspace");
    const ok = await navigateToResourceMonitorSession(
      dest,
      "workspace",
      {
        push: (next) => {
          order.push(`push:${next}`);
        },
      },
      {
        hydrate: () => order.push("hydrate"),
        ensureHost: (hostId) => order.push(`ensureHost:${hostId}`),
        listSpaceIds: () => [DEFAULT_CENTER_SPACE_ID, EXTRA],
        currentHostId: () => HOST,
        switchCenterSpace: async (hostId, spaceId, switchOptions) => {
          order.push(`switch:${hostId}:${spaceId}:${String(switchOptions.preserveDeepLink)}`);
        },
        requestLocate: (target) => {
          order.push(`request:${target.sessionId}`);
          return 1;
        },
        clearLocate: () => order.push("clear"),
        getLocation: () => ({ pathname: href.pathname, search: href.search }),
        sleep: async () => {
          commitAfterSleeps += 1;
          if (commitAfterSleeps >= 2) {
            const next = hrefFromPath(path);
            href.pathname = next.pathname;
            href.search = next.search;
            order.push("commit");
          }
        },
        waitAttempts: 4,
        waitIntervalMs: 50,
      },
    );

    expect(ok).toBe(true);
    expect(order).toEqual([
      "hydrate",
      `ensureHost:${HOST}`,
      "request:sess-extra",
      `push:${path}`,
      "commit",
      `switch:${HOST}:${EXTRA}:true`,
    ]);
    expect(order.indexOf("commit")).toBeGreaterThan(order.indexOf(`push:${path}`));
    expect(order.indexOf("commit")).toBeLessThan(order.indexOf(`switch:${HOST}:${EXTRA}:true`));
  });
});

describe("runResourceMonitorSessionNavigation", () => {
  test("marks navigation, closes, then navigates; reopens only on failure", async () => {
    const order: string[] = [];
    const failed = await runResourceMonitorSessionNavigation({
      target: { location: location(), routeKind: "workspace" },
      router: { push: (path) => order.push(`push:${path}`) },
      markNavigating: () => order.push("mark"),
      close: () => order.push("close"),
      reopen: () => order.push("reopen"),
      navigate: async () => {
        order.push("navigate");
        return false;
      },
    });
    expect(failed).toBe(false);
    expect(order).toEqual(["mark", "close", "navigate", "reopen"]);

    order.length = 0;
    const ok = await runResourceMonitorSessionNavigation({
      target: { location: location({ hostId: "proj-1" }), routeKind: "project" },
      router: { push: (path) => order.push(`push:${path}`) },
      markNavigating: () => order.push("mark"),
      close: () => order.push("close"),
      reopen: () => order.push("reopen"),
      navigate: async () => {
        order.push("navigate");
        return true;
      },
    });
    expect(ok).toBe(true);
    expect(order).toEqual(["mark", "close", "navigate"]);
  });
});

describe("navigate dest-commit-before-switch contract", () => {
  test("public helper waits for dest URL before same-host switch and never calls agent attention", () => {
    const src = readFileSync(
      join(import.meta.dir, "../../terminal/public/navigate-to-located-pane.ts"),
      "utf8",
    );
    const commitAt = src.indexOf("commitLocatedPaneNavigation(options.router, path)");
    const waitAt = src.indexOf("waitForDestination");
    const switchAt = src.indexOf("await switchSameHostSpace");
    const requestAt = src.indexOf("requestLocate(location)");
    expect(commitAt).toBeGreaterThan(0);
    expect(waitAt).toBeGreaterThan(0);
    expect(requestAt).toBeGreaterThan(0);
    expect(switchAt).toBeGreaterThan(commitAt);
    expect(switchAt).toBeGreaterThan(src.lastIndexOf("if (!committed)"));
    expect(src).toContain("pushWorkspaceDeepLink");
    expect(src).toContain("router.push(path)");
    expect(src).toContain("preserveDeepLink: true");
    expect(src).toContain("locationMatchesDestination");
    expect(src).not.toContain("useAgentAttentionStore");
    expect(src).not.toContain("raise(");
    expect(src).not.toContain("navigateToAgentHook");
  });
});
