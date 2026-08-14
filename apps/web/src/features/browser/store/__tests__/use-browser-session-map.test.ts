import { beforeEach, describe, expect, it } from "bun:test";

import { useBrowserSessionMapStore } from "../use-browser-session-map";

describe("resolveContext", () => {
  beforeEach(() => {
    useBrowserSessionMapStore.setState({
      panels: {},
      bySession: {},
      byTab: {},
    });
  });

  it("fails closed when no Browser panel is mounted", () => {
    const result = useBrowserSessionMapStore.getState().resolveContext();
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("embedded_browser_host_unavailable");
  });

  it("uses the only mounted panel", () => {
    const store = useBrowserSessionMapStore.getState();
    store.registerPanel("ctx-a", { isActive: false, tabCount: 1 });
    expect(store.resolveContext()).toEqual({ ok: true, contextId: "ctx-a" });
  });

  it("does not guess among several panels", () => {
    const store = useBrowserSessionMapStore.getState();
    store.registerPanel("ctx-a", { isActive: true, tabCount: 1 });
    store.registerPanel("ctx-b", { isActive: true, tabCount: 1 });
    const result = store.resolveContext();
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("browser_ambiguous_target");
  });

  it("routes an explicit unknown target as unavailable, not invalid_args", () => {
    const store = useBrowserSessionMapStore.getState();
    store.registerPanel("ctx-a", { isActive: true, tabCount: 1 });
    const result = store.resolveContext("missing");
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("browser_route_unavailable");
  });

  it("routes an explicit bound target to its panel", () => {
    const store = useBrowserSessionMapStore.getState();
    store.registerPanel("ctx-a", { isActive: true, tabCount: 1 });
    store.bindSession("ctx-a", "tab-1", "sess-1");
    expect(store.resolveContext("sess-1")).toEqual({
      ok: true,
      contextId: "ctx-a",
    });
  });
});
