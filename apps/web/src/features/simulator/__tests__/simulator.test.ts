// @ts-expect-error bun:test is available at runtime
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  iframeSrc,
  setupActionForReason,
  SIMULATOR_TAB_VALUE,
} from "../types";
import { useSimulatorCenterTabStore } from "../store/use-simulator-center-tab";

const repoRoot = join(import.meta.dir, "../../../../../..");

describe("simulator url + reasons", () => {
  it("forces loopback iframe urls", () => {
    expect(iframeSrc("http://127.0.0.1:3200", "UDID")).toContain("device=UDID");
    expect(iframeSrc("http://0.0.0.0:3200/?device=UDID")).toContain("127.0.0.1");
  });

  it("maps setup reasons to real buttons", () => {
    expect(setupActionForReason("not_desktop")?.id).toBe("needDesktop");
    expect(setupActionForReason("xcode_missing")?.id).toBe("installXcode");
    expect(setupActionForReason("no_device")?.id).toBe("openXcode");
    expect(setupActionForReason("ok")?.id).toBe("start");
    expect(setupActionForReason("helper_missing")?.id).toBe("start");
    expect(setupActionForReason("download_failed")?.kind).toBe("retry");
    expect(setupActionForReason("unsupported_arch")).toBeNull();
  });

  it("keeps one tab id per workspace", () => {
    expect(SIMULATOR_TAB_VALUE).toBe("simulator");
    const store = useSimulatorCenterTabStore.getState();
    store.open("ws-a");
    store.open("ws-a");
    expect(store.isOpen("ws-a")).toBe(true);
    store.close("ws-a");
    expect(store.isOpen("ws-a")).toBe(false);
  });
});

describe("control plane", () => {
  it("talks to the local API over websocket, not Electron IPC", () => {
    const client = readFileSync(
      join(import.meta.dir, "../../../api/ws/simulator-api.ts"),
      "utf8",
    );
    expect(client).toContain('wsRequest<SimulatorProbe>("simulator_probe")');
    expect(client).toContain("workspace_id: workspaceId");
    expect(client).not.toContain("desktopInvoke");
  });

  it("does not start a helper until the user clicks Start", () => {
    const hook = readFileSync(
      join(import.meta.dir, "../hooks/use-simulator-session.ts"),
      "utf8",
    );
    expect(hook).toContain("simulatorApi.probe()");
    expect(hook).toContain("simulatorApi.status(workspaceId)");
    expect(hook).not.toMatch(/if \(!active \|\| !workspaceId\) return;[\s\S]*void run\(\)/);
    expect(enStartAction()).toBe("Start");
  });
});

function enStartAction(): string {
  const en = JSON.parse(
    readFileSync(join(repoRoot, "apps/web/messages/en.json"), "utf8"),
  ) as { features: { simulator: { actions: { start: string } } } };
  return en.features.simulator.actions.start;
}

describe("no custom phone chrome", () => {
  it("preview is an iframe and not a canvas shell", () => {
    const panel = readFileSync(
      join(import.meta.dir, "../components/SimulatorPanel.tsx"),
      "utf8",
    );
    expect(panel).toContain("<iframe");
    expect(panel).toContain("data-atmos-guest-iframe");
    expect(panel).toContain("simulator-guest.css");
    expect(panel).not.toContain("SimulatorScreen");
    expect(panel).not.toContain("device-shell");
  });

  it("freezes the guest iframe while host tooltips or sidebar drags use the pointer", () => {
    const css = readFileSync(
      join(import.meta.dir, "../simulator-guest.css"),
      "utf8",
    );
    expect(css).toContain("data-atmos-guest-iframe");
    expect(css).toContain("tooltip-content");
    expect(css).toContain("data-resize-handle-active");
    expect(css).toContain("data-atmos-drag-active");
    expect(css).toContain("pointer-events: none");
  });

  it("raises the host sidebar handle above a full-bleed guest iframe", () => {
    const layout = readFileSync(
      join(import.meta.dir, "../../../app-shell/PanelLayout.tsx"),
      "utf8",
    );
    expect(layout).toContain('data-atmos-drag-active');
    expect(layout).toContain("relative z-20");
    expect(layout).toContain("-right-1.5");
    expect(layout).toContain("rightPanelRef.current?.expand()");
  });
});

describe("i18n", () => {
  it("uses sentence case and translated zh without npx", () => {
    const en = JSON.parse(
      readFileSync(join(repoRoot, "apps/web/messages/en.json"), "utf8"),
    ) as { features: { simulator: Record<string, unknown> } };
    const zh = JSON.parse(
      readFileSync(join(repoRoot, "apps/web/messages/zh.json"), "utf8"),
    ) as { features: { simulator: Record<string, unknown> } };
    const dump = JSON.stringify(en.features.simulator);
    const zhDump = JSON.stringify(zh.features.simulator);
    expect(dump.toLowerCase()).not.toContain("npx");
    expect(zhDump.toLowerCase()).not.toContain("npx");
    expect(dump).not.toMatch(/\b(OPEN|MERGED|DOWNLOAD)\b/);
    expect(en.features.simulator.tab).toBe("Simulator");
    expect(zh.features.simulator.tab).toBe("模拟器");
    expect(zh.features.simulator.starting).not.toBe(en.features.simulator.starting);
  });
});

describe("right sidebar", () => {
  it("exposes a simulator tab next to the other sidebar modules", () => {
    const sidebar = readFileSync(
      join(import.meta.dir, "../../../app-shell/RightSidebar.tsx"),
      "utf8",
    );
    expect(sidebar).toContain('value: "simulator"');
    expect(sidebar).toContain("<SimulatorPanel");
    expect(sidebar).not.toContain("configureTabs");
    expect(sidebar).not.toContain("Settings2");

    const tabs = readFileSync(
      join(import.meta.dir, "../../../shared/lib/nuqs/searchParams.ts"),
      "utf8",
    );
    expect(tabs).toContain('"simulator"');
  });

  it("hides the WebKit DevTools toggle in the preview rail", () => {
    const client = readFileSync(
      join(repoRoot, "vendor/serve-sim/packages/serve-sim/src/client/client.tsx"),
      "utf8",
    );
    expect(client).toContain("Open tools panel");
    expect(client).toMatch(/\{\/\*[\s\S]*Open WebKit DevTools[\s\S]*\*\/\}/);
  });

  it("does not open the tools pane on first visit", () => {
    const client = readFileSync(
      join(repoRoot, "vendor/serve-sim/packages/serve-sim/src/client/client.tsx"),
      "utf8",
    );
    expect(client).toMatch(/if \(typeof window === "undefined"\) return false;/);
    expect(client).toMatch(/if \(stored === "1"\) return true;\s*return false;/);
  });
});
