import { describe, expect, it } from "bun:test";
import { createAppState } from "../app-state.ts";
import { DESKTOP_SHELL_GROUP_KINDS } from "../metrics/desktop-shell-metrics.ts";
import { createAllHandlers } from "./handlers.ts";
import { createDesktopCommandRouter } from "./router.ts";

describe("get_desktop_shell_metrics handler", () => {
  it("returns supported:false without Electron ready instead of throwing", async () => {
    const state = createAppState();
    const router = createDesktopCommandRouter(createAllHandlers(state));
    expect(router.listCommands()).toContain("get_desktop_shell_metrics");

    const snapshot = (await router.invoke("get_desktop_shell_metrics")) as {
      supported: boolean;
      collected_at_ms: number;
      logical_cpu_count: number;
      total: { process_count: number };
      groups: Array<{ kind: string }>;
      pid?: unknown;
    };

    expect(snapshot.supported).toBe(false);
    expect(Number.isFinite(snapshot.collected_at_ms)).toBe(true);
    expect(snapshot.logical_cpu_count).toBeGreaterThanOrEqual(0);
    expect(snapshot.total.process_count).toBe(0);
    expect(snapshot.groups.map((group) => group.kind)).toEqual([
      ...DESKTOP_SHELL_GROUP_KINDS,
    ]);
    expect(snapshot.pid).toBeUndefined();
  });
});
