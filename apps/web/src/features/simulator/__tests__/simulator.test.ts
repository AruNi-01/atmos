// @ts-expect-error bun:test is available at runtime
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  displayReasonFromProbe,
  displayReasonFromStart,
  iframeSrc,
  probeCanStart,
  setupActionForReason,
  SIMULATOR_TAB_VALUE,
  type SimulatorPlatformProbe,
  type SimulatorProbe,
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
    expect(setupActionForReason("android_sdk_missing")?.id).toBe("installAndroidSdk");
    expect(setupActionForReason("adb_missing")?.id).toBe("installAndroidSdk");
    expect(setupActionForReason("emulator_missing")?.id).toBe("installAndroidSdk");
    expect(setupActionForReason("no_avd")?.id).toBe("createAvd");
    expect(setupActionForReason("device_already_claimed")?.id).toBe("retry");
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
    expect(client).toContain('wsRequest("simulator_probe")');
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
  return enSimulatorActions().start;
}

function enStopAction(): string {
  return enSimulatorActions().stop;
}

function enSimulatorActions(): { start: string; stop: string } {
  const en = JSON.parse(
    readFileSync(join(repoRoot, "apps/web/messages/en.json"), "utf8"),
  ) as { features: { simulator: { actions: { start: string; stop: string } } } };
  return en.features.simulator.actions;
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
    expect(panel).not.toContain("DeviceScreen");
    expect(panel).not.toContain("device-shell");
  });

  it("stops the helper from the preview toolbar after confirm", () => {
    const panel = readFileSync(
      join(import.meta.dir, "../components/SimulatorPanel.tsx"),
      "utf8",
    );
    const header = readFileSync(
      join(import.meta.dir, "../../../app-shell/header-action-controls.tsx"),
      "utf8",
    );
    const stop = readFileSync(
      join(repoRoot, "vendor/serve-sim/packages/serve-sim/src/client/components/stop-preview-button.tsx"),
      "utf8",
    );
    const client = readFileSync(
      join(repoRoot, "vendor/serve-sim/packages/serve-sim/src/client/client.tsx"),
      "utf8",
    );
    expect(header).not.toContain("SimulatorStopButton");
    expect(panel).toContain("atmos:simulator-stop");
    expect(panel).toContain("session.disconnect()");
    expect(client).toContain("<StopPreviewButton");
    expect(stop).toContain("Power");
    expect(stop).toContain("#f87171");
    expect(stop).toContain("Stop the simulator preview?");
    expect(enStopAction()).toBe("Stop");
    const stream = readFileSync(
      join(repoRoot, "vendor/serve-sim/packages/serve-sim/src/client/simulator/useSimStream.ts"),
      "utf8",
    );
    expect(stream).not.toContain('exec("serve-sim --kill")');
    expect(stream).toContain("atmos:simulator-stop");
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
    expect(layout).not.toContain("rightPanelRef");
  });
});

describe("i18n", () => {
  it("uses sentence case and translated zh without npx", () => {
    const en = JSON.parse(
      readFileSync(join(repoRoot, "apps/web/messages/en.json"), "utf8"),
    ) as {
      features: {
        simulator: {
          tab: string;
          starting: string;
          actions: { installAndroidSdk: string; createAvd: string };
          reasons: { no_avd: { title: string } };
        };
      };
    };
    const zh = JSON.parse(
      readFileSync(join(repoRoot, "apps/web/messages/zh.json"), "utf8"),
    ) as {
      features: {
        simulator: {
          tab: string;
          starting: string;
          actions: { createAvd: string };
          reasons: { no_avd: { title: string } };
        };
      };
    };
    const dump = JSON.stringify(en.features.simulator);
    const zhDump = JSON.stringify(zh.features.simulator);
    expect(dump.toLowerCase()).not.toContain("npx");
    expect(zhDump.toLowerCase()).not.toContain("npx");
    expect(dump).not.toMatch(/\b(OPEN|MERGED|DOWNLOAD)\b/);
    expect(en.features.simulator.tab).toBe("Simulator");
    expect(zh.features.simulator.tab).toBe("模拟器");
    expect(zh.features.simulator.starting).not.toBe(en.features.simulator.starting);
    expect(en.features.simulator.actions.installAndroidSdk).toBe("Install Android Studio");
    expect(en.features.simulator.actions.createAvd).toBe("Create an Android virtual device");
    expect(zh.features.simulator.actions.createAvd).toBe("创建 Android 虚拟设备");
    expect(en.features.simulator.reasons.no_avd.title).toBe("No Android virtual device");
    expect(zh.features.simulator.reasons.no_avd.title).not.toBe(
      en.features.simulator.reasons.no_avd.title,
    );
  });
});

describe("center simulator tab", () => {
  it("exposes simulator from the center plus menu and frame", () => {
    const tabBar = readFileSync(
      join(import.meta.dir, "../../../app-shell/CenterStageTabBar.tsx"),
      "utf8",
    );
    expect(tabBar).toContain("onCreateSimulator");
    expect(tabBar).toContain("newSimulator");

    const frame = readFileSync(
      join(import.meta.dir, "../../../app-shell/workspace-center-frame.tsx"),
      "utf8",
    );
    expect(frame).toContain("<KeptSimulatorPanel");

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

  it("keeps devices and tools chrome on the phone toolbar", () => {
    const client = readFileSync(
      join(repoRoot, "vendor/serve-sim/packages/serve-sim/src/client/client.tsx"),
      "utf8",
    );
    expect(client).toMatch(/\{\/\*[\s\S]*<DeviceSidebarToggle[\s\S]*\*\/\}/);
    expect(client).toContain('aria-label="Simulator status"');
    expect(client).toContain("Open tools panel");
    expect(client).toContain("forceEnabled");
    expect(client).not.toContain("StreamStatusPill");
    expect(client).toContain('tone={useWebRtcVideo && webrtc.error ? "warning" : "default"}');
    expect(client).toContain("flex w-full min-w-0 items-center justify-center gap-2");
    expect(client).toContain('width: "max-content"');
  });

  it("rewrites compiled bunfs serve-sim paths before /bin/sh", () => {
    const hostBin = readFileSync(
      join(repoRoot, "vendor/serve-sim/packages/serve-sim/src/host-bin.ts"),
      "utf8",
    );
    const execWs = readFileSync(
      join(repoRoot, "vendor/serve-sim/packages/serve-sim/src/exec-ws.ts"),
      "utf8",
    );
    expect(hostBin).toContain("/$bunfs/");
    expect(hostBin).toContain("rewriteHostCommand");
    expect(execWs).toContain("rewriteHostCommand(command)");
    expect(execWs).toContain("isGlobalServeSimKill");
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

function blockedPlatform(reason: SimulatorPlatformProbe["reason"]): SimulatorPlatformProbe {
  return {
    ready: false,
    reason,
    helper_installed: false,
    helper_version: "0",
    devices: [],
  };
}

function readyPlatform(): SimulatorPlatformProbe {
  return {
    ready: true,
    reason: "ok",
    helper_installed: true,
    helper_version: "0",
    devices: [],
  };
}

describe("nested probe reasons", () => {
  it("starts when either platform is ready and prefers iOS copy when both are blocked", () => {
    const host: SimulatorProbe = {
      ready: true,
      reason: "ok",
      platform: "macos",
      arch: "aarch64",
      macos_version: "15.0",
      ios: blockedPlatform("xcode_missing"),
      android: readyPlatform(),
    };
    expect(probeCanStart(host)).toBe(true);
    expect(displayReasonFromProbe(host)).toBe("ok");

    const bothBlocked: SimulatorProbe = {
      ready: false,
      reason: "xcode_missing",
      platform: "macos",
      arch: "aarch64",
      macos_version: "15.0",
      ios: blockedPlatform("xcode_missing"),
      android: blockedPlatform("android_sdk_missing"),
    };
    expect(probeCanStart(bothBlocked)).toBe(false);
    expect(displayReasonFromProbe(bothBlocked)).toBe("xcode_missing");
  });

  it("maps no_device to claimed when probe still lists devices", () => {
    const probe: SimulatorProbe = {
      ready: true,
      reason: "ok",
      platform: "macos",
      arch: "aarch64",
      macos_version: "15.0",
      ios: {
        ...readyPlatform(),
        devices: [
          {
            udid: "phone-a",
            name: "iPhone",
            runtime: "ios",
            state: "Booted",
            available: true,
            platform: "ios",
            claimed_by_workspace: "ws-a",
          },
        ],
      },
      android: blockedPlatform("android_sdk_missing"),
    };
    expect(displayReasonFromStart("no_device", probe)).toBe("device_already_claimed");
    expect(displayReasonFromStart("no_device", bothBlockedProbe())).toBe("no_device");
  });
});

function bothBlockedProbe(): SimulatorProbe {
  return {
    ready: false,
    reason: "xcode_missing",
    platform: "macos",
    arch: "aarch64",
    macos_version: "15.0",
    ios: blockedPlatform("xcode_missing"),
    android: blockedPlatform("android_sdk_missing"),
  };
}

describe("hosted origin CTA", () => {
  it("maps hosted app origin to the desktop card, not just !isDesktopRuntime", () => {
    const hook = readFileSync(
      join(import.meta.dir, "../hooks/use-simulator-session.ts"),
      "utf8",
    );
    expect(hook).toContain("isHostedAtmosOrigin()");
    expect(hook).not.toMatch(/if\s*\(\s*!isDesktopRuntime\(\)\s*\)/);
    expect(setupActionForReason("not_desktop")?.kind).toBe("desktop");
  });
});

describe("serve-emu vendor + install", () => {
  it("pins serve-emu under runtime-manager paths without npx or serve-avd", () => {
    const pin = JSON.parse(
      readFileSync(
        join(repoRoot, "crates/core-service/pins/serve-emu-requirement.json"),
        "utf8",
      ),
    ) as { version: string; asset: string; upstream_commit: string };
    expect(pin.version).toBe("0.0.5-atmos.1");
    expect(pin.asset).toContain("serve-emu-");
    expect(pin.upstream_commit).toBe("def2e0d87a60857ba5a303750bcb7de9f5fc7185");

    const pack = readFileSync(join(repoRoot, "scripts/serve-emu/pack.sh"), "utf8");
    expect(pack).toContain("runtime/serve-emu/${VERSION}");
    expect(pack).toContain("bun build --compile");
    expect(pack).toContain("missing $SCRCPY");
    expect(pack).not.toContain("npx");
    expect(pack).not.toContain("serve-avd");

    const spawn = readFileSync(
      join(repoRoot, "crates/core-service/src/service/device_preview/production.rs"),
      "utf8",
    ).split("#[cfg(test)]")[0];
    const args = readFileSync(
      join(repoRoot, "crates/core-service/src/service/device_preview/args.rs"),
      "utf8",
    ).split("#[cfg(test)]")[0];
    expect(spawn).toContain("vendor/scrcpy-server-v4.0");
    expect(spawn).not.toContain("npx");
    expect(spawn).not.toContain("serve-avd");
    expect(args).toContain('"127.0.0.1"');
    expect(args).not.toContain("npx");
    expect(args).not.toContain("serve-avd");
    expect(args).toContain("args_contain_global_kill");
  });

  it("lists Apache-2.0 serve-emu in NOTICE and vendors the tree", () => {
    const notice = readFileSync(join(repoRoot, "NOTICE"), "utf8");
    const license = readFileSync(join(repoRoot, "vendor/serve-emu/LICENSE"), "utf8");
    const upstream = readFileSync(join(repoRoot, "vendor/serve-emu/UPSTREAM.md"), "utf8");
    expect(notice).toContain("serve-emu");
    expect(notice).toContain("Apache License 2.0");
    expect(notice).toContain("def2e0d87a60857ba5a303750bcb7de9f5fc7185");
    expect(notice.toLowerCase()).not.toContain("serve-avd");
    expect(license).toContain("Apache License");
    expect(upstream).toContain("serve-emu");
    expect(upstream).toContain("def2e0d87a60857ba5a303750bcb7de9f5fc7185");
  });

  it("keeps serve-emu chrome selectors aligned with device preview", () => {
    const app = readFileSync(
      join(repoRoot, "vendor/serve-emu/packages/serve-emu/src/ui/app.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      join(repoRoot, "vendor/serve-emu/packages/serve-emu/src/ui/components/device-panel.tsx"),
      "utf8",
    );
    const status = readFileSync(
      join(repoRoot, "vendor/serve-emu/packages/serve-emu/src/ui/components/status-bar.tsx"),
      "utf8",
    );
    const cli = readFileSync(
      join(repoRoot, "vendor/serve-emu/packages/serve-emu/src/cli.ts"),
      "utf8",
    );
    expect(app).toContain("useClaimedDeviceLabel");
    expect(app).toContain("data-atmos-device-identity");
    expect(app).toContain("data-atmos-device-actions");
    expect(app).toContain("data-atmos-tools-panel");
    expect(app).toContain("Stop the emulator preview?");
    expect(app).toContain("atmos:simulator-stop");
    expect(app).toContain('useState(false)');
    expect(status).toContain("Device preview");
    expect(status).not.toContain(">serve-emu<");
    expect(panel).toContain('device.kind !== "physical"');
    expect(panel).toContain("canStart: device.canStart && matchesLock");
    expect(panel).toContain("This preview is locked to the claimed device.");
    expect(cli).toContain("Atmos: always bind loopback");
    expect(cli).not.toContain("serve-avd");
  });
});
