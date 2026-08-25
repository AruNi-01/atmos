import { describe, expect, it } from "bun:test";
import { makeCenterSpaceKey } from "@/app-shell/center-space/center-space";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveCenterOpenContextId } from "@/app-shell/center-space/center-open-context";

describe("resolveCenterOpenContextId", () => {
  const host = "ws-1";
  const extra = makeCenterSpaceKey("ws-1", "space-abc");

  it("opens into the active extra space when no explicit context is given", () => {
    expect(resolveCenterOpenContextId(null, host, extra)).toBe(extra);
    expect(resolveCenterOpenContextId(undefined, host, extra)).toBe(extra);
  });

  it("keeps current-host requests on the active space instead of the default space", () => {
    expect(resolveCenterOpenContextId(host, host, extra)).toBe(extra);
    expect(resolveCenterOpenContextId(extra, host, extra)).toBe(extra);
  });

  it("does not treat an extra-space paint id as another workspace", () => {
    expect(resolveCenterOpenContextId(extra, host, extra)).toBe(extra);
  });

  it("preserves a different workspace host so navigation can switch there", () => {
    expect(resolveCenterOpenContextId("ws-2", host, extra)).toBe("ws-2");
  });

  it("falls back to the host when no extra space is active", () => {
    expect(resolveCenterOpenContextId(null, host, host)).toBe(host);
    expect(resolveCenterOpenContextId(host, host, host)).toBe(host);
  });
});

describe("attachCenterTab isolation", () => {
  it("reveals the owning pane instead of openTabOnFocusedPane", () => {
    const src = readFileSync(join(import.meta.dir, "../center-space/center-open-context.ts"), "utf8");
    expect(src).toContain("planCenterTabAttach");
    expect(src).toContain("store.getLayout(contextId), tabId, opts");
    expect(src).toContain('if (plan.action === "reveal")');
    expect(src).toContain("store.focus(contextId, plan.paneId)");
    expect(src).toContain("store.setActiveTab(contextId, plan.paneId, tabId)");
    expect(src).toContain("dismissCenterTabInPane");
    expect(src).toContain("removeTabFromPane");
  });
});
