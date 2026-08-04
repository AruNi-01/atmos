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
    expect(src).toContain("showSelectionToolbar: false");
    expect(src).not.toContain("WebContentsView");
    expect(src).not.toContain("addChildView");
    expect(src).toContain("BROWSER_PARTITION");
    expect(src).toContain("browser-runtime.js");
    const policy = read("apps/desktop-electron/src/browser/webview-attach-policy.ts");
    expect(policy).toContain('persist:atmos-browser');
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
});
