// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it, beforeEach } from "bun:test";
import {
  applyWorkspaceFrameVisualDom,
  injectLastCenterTabIfMissing,
  parseWorkspaceContextHref,
  promoteWorkspaceSurfaceSwitch,
  prepareWorkspaceContextNavigation,
  prepareAndPrimeWorkspaceNavigation,
  primeWorkspaceSurfaceNavigation,
  resetWorkspaceSwitchSchedulersForTests,
  schedulePromoteWorkspaceSurfaceSwitch,
  scheduleVisualActiveSwitch,
  VISUAL_SWITCH_COALESCE_MS,
  PROMOTE_COALESCE_MS,
} from "@/app-shell/workspace-surface-switch";
import { useWorkspaceSurfaceCacheStore } from "@/features/workspace/store/use-workspace-surface-cache-store";
import { setCenterStageLastTab } from "@/shared/stores/use-ui-pref-hooks";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  beforeEach(async () => {
    resetWorkspaceSwitchSchedulersForTests();
    useWorkspaceSurfaceCacheStore.getState().clearAll();
    // clearAll defers a dynamic terminal-store import; flush it so later awaits
    // do not race Bun module instantiation.
    await sleep(5);
    setCenterStageLastTab("ws-b", "overview");
  });

  it("promotes leave→warm once and is idempotent", () => {
    promoteWorkspaceSurfaceSwitch("ws-a");
    expect(useWorkspaceSurfaceCacheStore.getState().activeContextId).toBe("ws-a");

    promoteWorkspaceSurfaceSwitch("ws-b");
    const s = useWorkspaceSurfaceCacheStore.getState();
    expect(s.activeContextId).toBe("ws-b");
    expect(s.visualActiveContextId).toBe("ws-b");
    expect(s.warm.map((w) => w.contextId)).toContain("ws-a");

    const again = promoteWorkspaceSurfaceSwitch("ws-b");
    expect(again.alreadyActive).toBe(true);
  });

  it("prepare injects remembered last tab without full promote", () => {
    useWorkspaceSurfaceCacheStore.getState().setActiveContextId("ws-a");
    const href = prepareWorkspaceContextNavigation("/workspace?id=ws-b");
    expect(href).toContain("id=ws-b");
    expect(href).toContain("tab=overview");
    // Critical: pure prepare must not promote — that sync re-render freezes the sidebar.
    expect(useWorkspaceSurfaceCacheStore.getState().activeContextId).toBe("ws-a");
    expect(useWorkspaceSurfaceCacheStore.getState().warm).toEqual([]);
  });

  it("prepare keeps caller-provided tab", () => {
    const href = prepareWorkspaceContextNavigation(
      "/workspace?id=ws-b&tab=terminal",
    );
    expect(href).toBe("/workspace?id=ws-b&tab=terminal");
  });

  it("prime flips visual for warm targets without promote", () => {
    const store = useWorkspaceSurfaceCacheStore.getState();
    store.switchContext("ws-a");
    store.switchContext("ws-b");
    // ws-a is warm; navigating back should paint immediately.
    expect(store.getMountedContextIds()).toContain("ws-a");

    const primed = primeWorkspaceSurfaceNavigation("/workspace?id=ws-a&tab=terminal");
    expect(primed).toBe(true);
    const s = useWorkspaceSurfaceCacheStore.getState();
    expect(s.visualActiveContextId).toBe("ws-a");
    // Full promote still waits for URL commit.
    expect(s.activeContextId).toBe("ws-b");
    expect(s.warm.map((w) => w.contextId)).toContain("ws-a");
  });

  it("applyWorkspaceFrameVisualDom toggles data-tier without display:none", () => {
    // jsdom may not exist in bun unit tests; skip when document is unavailable.
    if (typeof document === "undefined") return;
    document.body.innerHTML = `
      <div data-workspace-frame="ws-a" data-tier="active"></div>
      <div data-workspace-frame="ws-b" data-tier="warm" hidden class="hidden" style="content-visibility: hidden"></div>
    `;
    applyWorkspaceFrameVisualDom("ws-b");
    const a = document.querySelector('[data-workspace-frame="ws-a"]') as HTMLElement;
    const b = document.querySelector('[data-workspace-frame="ws-b"]') as HTMLElement;
    // Warm uses opacity stacking (data-tier), not HTML hidden / display:none.
    expect(a.hidden).toBe(false);
    expect(a.hasAttribute("hidden")).toBe(false);
    expect(a.classList.contains("hidden")).toBe(false);
    expect(a.getAttribute("data-tier")).toBe("warm");
    expect(a.getAttribute("aria-hidden")).toBe("true");
    expect(a.hasAttribute("inert")).toBe(true);
    expect(b.hidden).toBe(false);
    expect(b.getAttribute("data-tier")).toBe("active");
    expect(b.getAttribute("aria-hidden")).toBe("false");
    expect(b.hasAttribute("inert")).toBe(false);
    expect(b.classList.contains("hidden")).toBe(false);
    expect(b.style.contentVisibility).toBe("");
  });

  it("prime does not claim cold targets and clears stale visual lead", () => {
    const store = useWorkspaceSurfaceCacheStore.getState();
    store.switchContext("ws-a");
    store.switchContext("ws-b");
    store.beginVisualSwitch("ws-a"); // optimistic lead
    expect(useWorkspaceSurfaceCacheStore.getState().visualActiveContextId).toBe("ws-a");

    const primed = primeWorkspaceSurfaceNavigation("/workspace?id=ws-cold");
    expect(primed).toBe(false);
    const s = useWorkspaceSurfaceCacheStore.getState();
    // Stale lead cleared back to committed active so cold hop does not flash wrong frame.
    expect(s.visualActiveContextId).toBe("ws-b");
    expect(s.activeContextId).toBe("ws-b");
    expect(s.warm.map((w) => w.contextId)).toContain("ws-a");
  });

  it("prepareAndPrime injects tab and primes warm paint", () => {
    const store = useWorkspaceSurfaceCacheStore.getState();
    store.switchContext("ws-a");
    store.switchContext("ws-b");
    setCenterStageLastTab("ws-a", "overview");

    const href = prepareAndPrimeWorkspaceNavigation("/workspace?id=ws-a");
    expect(href).toContain("tab=overview");
    expect(useWorkspaceSurfaceCacheStore.getState().visualActiveContextId).toBe("ws-a");
    expect(useWorkspaceSurfaceCacheStore.getState().activeContextId).toBe("ws-b");
  });

  it("rapid visual switches coalesce to the latest target", async () => {
    const store = useWorkspaceSurfaceCacheStore.getState();
    store.switchContext("ws-a");
    store.switchContext("ws-b");
    store.switchContext("ws-c");
    // Quiet hop paints immediately.
    scheduleVisualActiveSwitch("ws-a");
    expect(useWorkspaceSurfaceCacheStore.getState().visualActiveContextId).toBe("ws-a");

    // Rapid follow-ups should not all flush — only the trailing latest.
    scheduleVisualActiveSwitch("ws-b");
    scheduleVisualActiveSwitch("ws-c");
    expect(useWorkspaceSurfaceCacheStore.getState().visualActiveContextId).toBe("ws-a");

    await sleep(VISUAL_SWITCH_COALESCE_MS + 20);
    expect(useWorkspaceSurfaceCacheStore.getState().visualActiveContextId).toBe("ws-c");
  });

  it("rapid promotes coalesce and keep intermediate leaves warm", async () => {
    const store = useWorkspaceSurfaceCacheStore.getState();
    store.switchContext("ws-a");

    // First promote is quiet → immediate.
    schedulePromoteWorkspaceSurfaceSwitch("ws-b", "ws-a");
    expect(useWorkspaceSurfaceCacheStore.getState().activeContextId).toBe("ws-b");
    expect(useWorkspaceSurfaceCacheStore.getState().warm.map((w) => w.contextId)).toContain(
      "ws-a",
    );

    // Rapid B→C then C→D: only final should apply after coalesce, with intermediates warmed.
    schedulePromoteWorkspaceSurfaceSwitch("ws-c", "ws-b");
    schedulePromoteWorkspaceSurfaceSwitch("ws-d", "ws-c");
    expect(useWorkspaceSurfaceCacheStore.getState().activeContextId).toBe("ws-b");

    await sleep(PROMOTE_COALESCE_MS + 20);
    const s = useWorkspaceSurfaceCacheStore.getState();
    expect(s.activeContextId).toBe("ws-d");
    const warmIds = s.warm.map((w) => w.contextId);
    expect(warmIds).toContain("ws-a");
    // Intermediate leave ws-c should remain warm when under cap.
    expect(warmIds).toContain("ws-c");
  });
});
