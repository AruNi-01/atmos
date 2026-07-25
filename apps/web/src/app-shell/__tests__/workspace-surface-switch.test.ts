// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it, beforeEach } from "bun:test";
import {
  injectLastCenterTabIfMissing,
  parseWorkspaceContextHref,
  promoteWorkspaceSurfaceSwitch,
  prepareWorkspaceContextNavigation,
} from "@/app-shell/workspace-surface-switch";
import { useWorkspaceSurfaceCacheStore } from "@/features/workspace/store/use-workspace-surface-cache-store";
import { setCenterStageLastTab } from "@/shared/stores/use-ui-pref-hooks";

describe("parseWorkspaceContextHref", () => {
  it("parses workspace and project ids", () => {
    expect(parseWorkspaceContextHref("/workspace?id=ws-1").contextId).toBe("ws-1");
    expect(parseWorkspaceContextHref("/workspace?id=ws-1").view).toBe("workspace");
    expect(parseWorkspaceContextHref("/project/?id=p-1").contextId).toBe("p-1");
    expect(parseWorkspaceContextHref("/project/?id=p-1").view).toBe("project");
    expect(parseWorkspaceContextHref("/agents").contextId).toBeNull();
  });

  it("detects explicit tab param", () => {
    expect(parseWorkspaceContextHref("/workspace?id=ws-1").hasTabParam).toBe(false);
    expect(parseWorkspaceContextHref("/workspace?id=ws-1&tab=overview").hasTabParam).toBe(true);
    expect(parseWorkspaceContextHref("/workspace?id=ws-1&tab=overview").tabParam).toBe(
      "overview",
    );
  });
});

describe("injectLastCenterTabIfMissing", () => {
  it("injects tab when missing and leaves explicit tab alone", () => {
    expect(injectLastCenterTabIfMissing("/workspace?id=ws-1", "overview")).toContain(
      "tab=overview",
    );
    expect(
      injectLastCenterTabIfMissing("/workspace?id=ws-1&tab=terminal", "overview"),
    ).toBe("/workspace?id=ws-1&tab=terminal");
    expect(injectLastCenterTabIfMissing("/workspace?id=ws-1", null)).toBe(
      "/workspace?id=ws-1",
    );
  });
});

describe("promoteWorkspaceSurfaceSwitch + prepareWorkspaceContextNavigation", () => {
  beforeEach(() => {
    useWorkspaceSurfaceCacheStore.getState().clearAll();
    setCenterStageLastTab("ws-b", "overview");
  });

  it("promotes leave→warm once and is idempotent", () => {
    promoteWorkspaceSurfaceSwitch("ws-a");
    expect(useWorkspaceSurfaceCacheStore.getState().activeContextId).toBe("ws-a");

    promoteWorkspaceSurfaceSwitch("ws-b");
    const s = useWorkspaceSurfaceCacheStore.getState();
    expect(s.activeContextId).toBe("ws-b");
    expect(s.warm.map((w) => w.contextId)).toContain("ws-a");

    const again = promoteWorkspaceSurfaceSwitch("ws-b");
    expect(again.alreadyActive).toBe(true);
  });

  it("prepare injects remembered last tab without touching WSC (must not block click)", () => {
    useWorkspaceSurfaceCacheStore.getState().setActiveContextId("ws-a");
    const href = prepareWorkspaceContextNavigation("/workspace?id=ws-b");
    expect(href).toContain("id=ws-b");
    expect(href).toContain("tab=overview");
    // Critical: nav prep must not promote — that sync re-render freezes the sidebar.
    expect(useWorkspaceSurfaceCacheStore.getState().activeContextId).toBe("ws-a");
    expect(useWorkspaceSurfaceCacheStore.getState().warm).toEqual([]);
  });

  it("prepare keeps caller-provided tab", () => {
    const href = prepareWorkspaceContextNavigation(
      "/workspace?id=ws-b&tab=terminal",
    );
    expect(href).toBe("/workspace?id=ws-b&tab=terminal");
  });
});
