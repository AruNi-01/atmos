import { describe, expect, it } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// __tests__ → lib → browser → features → src → web → apps → repo root
const root = join(import.meta.dir, "../../../../../../..");
const feature = join(root, "apps/web/src/features/browser");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("APP-053 browser webview structural (shipped sources)", () => {
  it("desktop transport opens without show/hide/updateViewport product methods", () => {
    const src = read("apps/web/src/features/browser/lib/browser-transports/desktop-transport.ts");
    expect(src).toContain("browser_bridge_open");
    expect(src).toContain("browser_bridge_bind_guest");
    expect(src).not.toContain("browser_bridge_update_bounds");
    expect(src).not.toContain("browser_bridge_show");
    expect(src).not.toContain("browser_bridge_hide");
    expect(src).toContain("mode: 'desktop'");
    expect(src).toContain("desktop-browser:viewport-changed");
    expect(src).toContain("desktop-browser:agent-activity");
    expect(src).toContain("browser_bridge_query_element_rects");
    expect(src).toContain("queryElementRects");
  });

  it("in-panel navigation is host-webview owned (no dual navigate+loadURL)", () => {
    const nav = read("apps/web/src/features/browser/hooks/use-browser-navigation.ts");
    // Desktop in-place nav must not call controller.navigate (races webview src).
    expect(nav).toContain("preferredTransportMode === 'desktop'");
    expect(nav).toContain("setDesktopCommittedUrl");
    expect(nav).not.toMatch(
      /preferredTransportMode === ['"]desktop['"][\s\S]{0,400}controller\.navigate/,
    );

    const session = read("apps/web/src/features/browser/components/BrowserSession.tsx");
    expect(session).toContain("host webview owns load");
    expect(session).not.toMatch(
      /shouldNavigate[\s\S]{0,120}activeController\.navigate/,
    );

    const surface = read("apps/desktop-electron/src/browser/surface-manager.ts");
    // open() must not loadURL when guest already bound; navigate is detached-only for load.
    expect(surface).toContain("host webview owns navigation");
    expect(surface).toContain("sole navigation owner");
    // open() path no longer loadURL on existing guest
    expect(surface).not.toMatch(
      /guestWebContents && !s\.guestWebContents\.isDestroyed\(\)\) \{\s*s\.pendingAttach = false;\s*void s\.guestWebContents\s*\.loadURL/,
    );
  });

  it("guest bind rebinds listeners when webContents id changes", () => {
    const surface = read("apps/desktop-electron/src/browser/surface-manager.ts");
    expect(surface).toContain("needsListeners");
    expect(surface).toContain("sessionIdFromGuestWebContents");
    expect(surface).toContain("prevId !== wc.id");
    expect(surface).toContain("queryElementRects");
  });

  it("host SelectionPopover is used for desktop (no desktop-only null branch)", () => {
    const src = read("apps/web/src/features/browser/components/BrowserViewport.tsx");
    expect(src).toContain("SelectionPopover");
    expect(src).toContain("DesktopBrowserWebview");
    expect(src).not.toContain('resolvedTransportMode !== "desktop" ? (');
    expect(src).not.toContain("isDesktopNativePreviewOccluded");
    // annotations not emptied for desktop
    expect(src).not.toMatch(/annotationOverlays = resolvedTransportMode === ["']desktop["']\s*\?\s*\[\]/);
  });

  it("desktop element select opens host SelectionPopover (does not hide on select)", () => {
    const src = read("apps/web/src/features/browser/hooks/use-browser-selection.ts");
    // Legacy guest-toolbar path hid the host popover for desktop — product uses host UI.
    expect(src).not.toMatch(
      /if \(mode === ['"]desktop['"]\) \{\s*setSelectionPopoverVisible\(false\)/,
    );
    expect(src).toContain("setSelectionPopoverVisible(true)");
    expect(src).toContain("getPopoverPositionFromRect");

    const session = read("apps/web/src/features/browser/components/BrowserSession.tsx");
    // Webview focus dismiss must not run while pick mode is on (would race-close popover).
    expect(session).toContain("!isElementPickerEnabled");
    expect(session).toContain("useOverlayDismissOnWebview");

    const transport = read(
      "apps/web/src/features/browser/lib/browser-transports/desktop-transport.ts",
    );
    // Unlock vs full exit must be separate IPC (hover breaks if clear exits pick mode).
    expect(transport).toContain("browser_bridge_exit_pick_mode");
    expect(transport).toContain("browser_bridge_clear_selection");
    expect(transport).toMatch(
      /async exitPickMode\(\) \{\s*if \(destroyed\) return;\s*await invokeDesktopBrowserBridge\('browser_bridge_exit_pick_mode'/,
    );
    expect(transport).toMatch(
      /async clearSelection\(\) \{\s*if \(destroyed\) return;[\s\S]*?browser_bridge_clear_selection/,
    );
  });

  it("DesktopBrowserWebview mounts guest with src so will-attach is not empty", () => {
    const src = read("apps/web/src/features/browser/components/DesktopBrowserWebview.tsx");
    expect(src).toContain("src={navUrl}");
    expect(src).toContain("shouldMountGuest");
    expect(src).toContain("partition={attach.partition}");
    expect(src).toContain("preload={attach.preloadUrl}");
    expect(src).toContain("data-atmos-session");
    // must not mount a bare webview without src attribute for first paint
    expect(src).not.toMatch(/<webview[\s\S]*?partition=\{attach\.partition\}[\s\S]*?\/>\s*;?\s*$/);
  });

  it("guest color-scheme follows Atmos theme (scrollbars / prefers-color-scheme)", () => {
    const webview = read("apps/web/src/features/browser/components/DesktopBrowserWebview.tsx");
    expect(webview).toContain("useTheme");
    expect(webview).toContain("guestColorScheme");
    expect(webview).toContain("browser_bridge_set_color_scheme");
    expect(webview).toContain("colorScheme: guestColorScheme");

    const viewport = read("apps/web/src/features/browser/components/BrowserViewport.tsx");
    expect(viewport).toContain("guestColorScheme");
    expect(viewport).not.toContain('colorScheme: "dark"');

    const surface = read("apps/desktop-electron/src/browser/surface-manager.ts");
    expect(surface).toContain("setPreferredColorScheme");
    expect(surface).toContain("applyGuestColorScheme");
    expect(surface).toContain("prefers-color-scheme");

    const handlers = read("apps/desktop-electron/src/ipc/handlers.ts");
    expect(handlers).toContain("browser_bridge_set_color_scheme");
  });

  it("canvas browser keeps inactive tabs mounted and skips native bounds sync", () => {
    const src = read("apps/web/src/features/canvas/components/widgets/CanvasBrowserWidget.tsx");
    expect(src).toContain("keepInactiveTabsMounted");
    expect(src).not.toContain("keepInactiveTabsMounted={false}");
    expect(src).not.toContain("syncViewport()");
    expect(src).not.toContain("getShapePageBounds");
  });

  it("DesktopBrowserWebview keeps guest mounted across layoutHidden (tab switch)", () => {
    const src = read("apps/web/src/features/browser/components/DesktopBrowserWebview.tsx");
    // Extract shouldMountGuest expression — must not require !layoutHidden (that remounted).
    const mountExpr = src.match(
      /const shouldMountGuest =\s*([\s\S]*?);/,
    )?.[1] ?? "";
    expect(mountExpr).toContain("layoutReady");
    expect(mountExpr).not.toContain("layoutHidden");
    expect(src).toContain("onLoadingChange");
    expect(src).toContain("did-start-loading");
    expect(src).toContain("did-stop-loading");
  });

  it("surface manager injects host-driven selection (showSelectionToolbar false)", () => {
    const src = read("apps/desktop-electron/src/browser/surface-manager.ts");
    const runtimeInject = read("apps/desktop-electron/src/browser/webview-runtime.ts");
    expect(runtimeInject).toContain("showSelectionToolbar: false");
    // Guest still draws pick hover labels (host owns toolbar only).
    expect(runtimeInject).toContain("showHoverLabel: true");
    expect(src).not.toContain("WebContentsView");
    expect(src).not.toContain("addChildView");
    expect(src).toContain("BROWSER_PARTITION");
    expect(runtimeInject).toContain("browser-runtime.js");
    // Packaged DMG must resolve dist-local runtime (not monorepo-only path).
    expect(runtimeInject).toContain("resolveBrowserRuntimeScriptPath");
    const pathHelper = read("apps/desktop-electron/src/browser/browser-runtime-path.ts");
    expect(pathHelper).toContain("browser-runtime.js");
    const build = read("apps/desktop-electron/scripts/build.ts");
    expect(build).toContain("browser-runtime.js");
    expect(build).toContain("copyFileSync");
    const policy = read("apps/desktop-electron/src/browser/webview-attach-policy.ts");
    expect(policy).toContain('persist:atmos-browser');
    const runtime = read("packages/shared/browser/browser-runtime.js");
    expect(runtime).toContain("showHoverLabel");
  });

  it("host selection popover uses Radix anchor at click (not left-biased 220 cap)", () => {
    const src = read("apps/web/src/features/browser/hooks/use-browser-selection.ts");
    expect(src).toMatch(/querySelector\(["']webview["']\)/);
    expect(src).toContain("rect.width / 2");
    expect(src).toContain("lastGuestClickOffsetRef");
    expect(src).toContain("mapGuestPointToViewport");
    expect(src).not.toContain("placePopoverNearAnchor");
    expect(src).not.toMatch(/Math\.min\(rect\.width,\s*220\)\s*\/\s*2/);
    const popover = read("apps/web/src/features/selection/components/SelectionPopover.tsx");
    expect(popover).toContain("avoidCollisions");
    expect(popover).toContain("collisionPadding");
    expect(popover).toContain("PopoverAnchor");
    expect(popover).toContain("createPortal");
    expect(popover).toContain("document.body");
    // sticky would freeze the card on screen while the page scrolls
    expect(popover).not.toContain('sticky="partial"');
    const viewport = read("apps/web/src/features/browser/components/BrowserViewport.tsx");
    expect(viewport).toContain("mapGuestRectToShellLocal");
  });

  it("open() preserves pickMode; package ships browser-runtime.js", () => {
    const surface = read("apps/desktop-electron/src/browser/surface-manager.ts");
    expect(surface).not.toMatch(/s\.currentUrl = url;\s*s\.detached = false;\s*s\.pickMode = false/);
    expect(surface).toContain("Do NOT reset pickMode");
    const pkg = read("apps/desktop-electron/scripts/package.ts");
    expect(pkg).toContain("dist/browser-runtime.js");
    const build = read("apps/desktop-electron/scripts/build.ts");
    expect(build).toContain("browser-runtime.js");
    expect(build).toContain("copyFileSync");
  });

  it("guest second-click dismisses or re-picks; cert errors hint proxy", () => {
    const runtime = read("packages/shared/browser/browser-runtime.js");
    expect(runtime).toContain("Second click while locked");
    expect(runtime).toContain("clearSelection(true)");
    const utils = read("apps/web/src/features/browser/lib/browser-utils.tsx");
    expect(utils).toContain("certProxyHint");
    expect(utils).toContain("isCertOrTlsErrorMessage");
  });

  it("main window enables webviewTag with attach hooks", () => {
    const src = read("apps/desktop-electron/src/windows/main-window.ts");
    expect(src).toContain("webviewTag: true");
    expect(src).toContain("installBrowserWebviewHooks");
  });

  it("APP-029 occlusion module is deleted", () => {
    expect(existsSync(join(feature, "hooks/use-native-preview-occlusion.ts"))).toBe(false);
    expect(existsSync(join(feature, "hooks/__tests__/use-native-preview-occlusion.test.ts"))).toBe(false);
  });

  it("permanent tab slots keep all tabs mounted (BrowserPanel)", () => {
    const src = read("apps/web/src/features/browser/components/BrowserPanel.tsx");
    expect(src).toContain("tabsToRender.map");
    expect(src).toContain("key={tab.id}");
    expect(src).toContain("absolute inset-0");
    // must not unmount inactive solely by conditional return of single tab
    expect(src).not.toMatch(/tabsToRender\.filter\([^)]*active/);
  });

  it("product rename: no run-preview / preview_bridge / desktop-preview in feature+electron browser", () => {
    const files = [
      "apps/web/src/features/browser/lib/browser-transports/desktop-transport.ts",
      "apps/desktop-electron/src/browser/surface-manager.ts",
      "apps/desktop-electron/src/browser/runtime-events.ts",
      "apps/web/src/shared/lib/desktop-browser-bridge.ts",
    ];
    for (const f of files) {
      const s = read(f);
      expect(s.includes("run-preview")).toBe(false);
      expect(s.includes("preview_bridge_")).toBe(false);
      expect(s.includes("desktop-preview:")).toBe(false);
      expect(s.includes("atmos-preview:")).toBe(false);
    }
  });

  it("standalone browser window opens /browser route via open_browser_window", () => {
    const secondary = read("apps/desktop-electron/src/windows/secondary.ts");
    expect(secondary).toContain("`browser/");
    expect(secondary).not.toContain("`preview/");
    expect(secondary).toContain("openBrowserWindow");
    expect(secondary).toContain('return "browser"');
    const handler = read("apps/desktop-electron/src/ipc/handlers.ts");
    expect(handler).toContain("open_browser_window");
    expect(handler).not.toContain("open_preview_browser_window");
    const client = read("apps/web/src/features/browser/lib/desktop-browser-window.ts");
    expect(client).toContain("open_browser_window");
    expect(client).toContain("openBrowserWindow");
  });

  it("agent tab CRUD goes through the renderer command bus", () => {
    const commands = read("apps/web/src/features/browser/store/use-browser-tab-commands.ts");
    expect(commands).toContain('type: "open"');
    expect(commands).toContain('type: "navigate"');
    expect(commands).toContain("openTab");
    expect(commands).toContain("navigateTab");
    expect(commands).toContain("queuesByContext");
    expect(commands).toContain("Electron main must not mutate this store");

    const bridge = read("apps/web/src/features/browser/hooks/use-browser-agent-tab-bridge.ts");
    expect(bridge).toContain("desktop-browser:agent-tab");
    expect(bridge).toContain("browser_bridge_agent_tab_result");
    expect(bridge).toContain("commands.openTab");
    expect(bridge).toContain("commands.closeTab");
    expect(bridge).toContain("commands.selectTab");
    expect(bridge).toContain("commands.navigateTab");
    expect(bridge).toContain('action === "navigate"');
    expect(bridge).toContain("evicted_target_ids");
    expect(bridge).toContain("browser_route_unavailable");
    expect(bridge).toContain("resolveContext");

    const control = read("apps/desktop-electron/src/browser/browser-use-control.ts");
    expect(control).toContain("/v1/tabs");
    expect(control).toContain("requestAgentTab");
    expect(control).toContain('action: "navigate"');
    expect(control).toContain("isDetached");
    expect(control).not.toMatch(/new BrowserWindow\(/);

    const handlers = read("apps/desktop-electron/src/ipc/handlers.ts");
    expect(handlers).toContain("browser_bridge_agent_tab_result");
    expect(handlers).toContain("browser_bridge_user_picks");
  });

  it("user picks sync to the embedded control plane", () => {
    const session = read("apps/web/src/features/browser/components/BrowserSession.tsx");
    expect(session).toContain("pushBrowserUseUserPicks");
    const picks = read("apps/web/src/features/browser/lib/browser-use-user-picks.ts");
    expect(picks).toContain("browser_bridge_user_picks");
    const control = read("apps/desktop-electron/src/browser/browser-use-control.ts");
    expect(control).toContain("user_picks");
    expect(control).toContain("g${generation}:u");
    expect(control).toContain("truncated");
  });

  it("routes agent tabs without silently guessing a window", () => {
    const map = read("apps/web/src/features/browser/store/use-browser-session-map.ts");
    expect(map).toContain("resolveContext");
    expect(map).toContain("browser_route_unavailable");
    expect(map).toContain("browser_ambiguous_target");
    expect(map).not.toContain("pickContext");

    const activity = read("apps/web/src/features/browser/store/use-browser-use-activity.ts");
    expect(activity).toContain("sessionId && current.sessionId !== sessionId");

    const toolbar = read("apps/web/src/features/browser/components/BrowserToolbar.tsx");
    expect(toolbar).toContain("useBrowserUseActivity(sessionId)");
  });
});
