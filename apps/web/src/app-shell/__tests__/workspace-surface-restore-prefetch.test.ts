// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it, mock } from "bun:test";
import {
  planTerminalLastTabRestore,
  resolveActiveOnlyContextId,
  shouldAcceptFrameInput,
} from "../workspace-surface-restore";
import { createWorkspacePrimePrefetch } from "../workspace-surface-prefetch";
import { clearWorkspaceSurfaceCacheOnTargetChange } from "../bootstrap/clear-workspace-surface-cache";
import { useWorkspaceSurfaceCacheStore } from "@/features/workspace/store/use-workspace-surface-cache-store";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("S9 planTerminalLastTabRestore (non-blocking)", () => {
  it("pushes last terminal tab even when not yet in visible list", () => {
    const plan = planTerminalLastTabRestore({
      lastTab: "terminal-tab:extra",
      visibleTerminalTabIds: ["terminal"],
      isTerminalWorkspaceReady: false,
    });
    expect(plan.shouldPushUrl).toBe(true);
    expect(plan.tabToPush).toBe("terminal-tab:extra");
    expect(plan.settlePending).toBe(false);
  });

  it("settles when workspace ready and tab still missing", () => {
    const plan = planTerminalLastTabRestore({
      lastTab: "terminal-tab:gone",
      visibleTerminalTabIds: ["terminal"],
      isTerminalWorkspaceReady: true,
    });
    expect(plan.shouldPushUrl).toBe(true);
    expect(plan.settlePending).toBe(true);
  });

  it("settles when tab is already visible", () => {
    const plan = planTerminalLastTabRestore({
      lastTab: "terminal",
      visibleTerminalTabIds: ["terminal"],
      isTerminalWorkspaceReady: false,
    });
    expect(plan.settlePending).toBe(true);
  });
});

describe("S19 / S20 active-only input targeting", () => {
  it("shouldAcceptFrameInput only for active frame", () => {
    expect(shouldAcceptFrameInput(true)).toBe(true);
    expect(shouldAcceptFrameInput(false)).toBe(false);
  });

  it("resolveActiveOnlyContextId forces active over warm request", () => {
    expect(
      resolveActiveOnlyContextId({
        activeContextId: "b",
        requestedContextId: "a",
      }),
    ).toBe("b");
    expect(
      resolveActiveOnlyContextId({
        activeContextId: "b",
        requestedContextId: "b",
      }),
    ).toBe("b");
    expect(
      resolveActiveOnlyContextId({
        activeContextId: null,
        requestedContextId: "a",
      }),
    ).toBeNull();
  });
});

describe("S12 workspace hover prime debounce", () => {
  it("debounces primeWorkspace and does not force warm", async () => {
    const prime = mock(() => {});
    const prefetch = createWorkspacePrimePrefetch({
      debounceMs: 20,
      primeWorkspace: prime as never,
    });
    prefetch.onWorkspaceHover("ws-1");
    prefetch.onWorkspaceHover("ws-1");
    prefetch.onWorkspaceHover("ws-2");
    expect(prime).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 40));
    expect(prime).toHaveBeenCalledTimes(1);
    expect(prime).toHaveBeenCalledWith("ws-2", undefined);
  });
});

describe("S23 clearWorkspaceSurfaceCacheOnTargetChange", () => {
  it("empties warm/active via shipped clearAll entry", async () => {
    useWorkspaceSurfaceCacheStore.setState({
      activeContextId: "a",
      warm: [{ contextId: "b", lastAccessed: 1 }],
      mountPlan: { mounted: ["terminal:a:terminal"] },
      surfaceSnapshots: {
        a: {
          contextId: "a",
          terminalTabIds: ["terminal"],
          editorPathsRecent: [],
          browserTabValues: [],
          lightIds: [],
        },
      },
    });
    await clearWorkspaceSurfaceCacheOnTargetChange();
    const s = useWorkspaceSurfaceCacheStore.getState();
    expect(s.activeContextId).toBeNull();
    expect(s.warm).toEqual([]);
    expect(s.mountPlan.mounted).toEqual([]);
  });
});

describe("S14 APP-034 cutover gate", () => {
  it("has no production useTerminalCacheStore / max_cached_* runtime ownership", () => {
    const webSrc = join(import.meta.dir, "../../");
    const offenders: string[] = [];

    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
        if (entry.name.includes(".test.") || entry.name.includes("__tests__")) continue;
        const text = readFileSync(path, "utf8");
        if (
          text.includes("useTerminalCacheStore") ||
          text.includes("use-terminal-cache-store") ||
          text.includes("max_cached_workspaces") ||
          text.includes("max_cached_terminal_panels_per_workspace")
        ) {
          offenders.push(path);
        }
      }
    }

    walk(webSrc);
    expect(offenders).toEqual([]);
    expect(
      existsSync(
        join(webSrc, "features/terminal/store/use-terminal-cache-store.ts"),
      ),
    ).toBe(false);
  });
});
