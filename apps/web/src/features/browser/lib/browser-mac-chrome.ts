/**
 * macOS dense-browser chrome helpers (main maximize + standalone window).
 *
 * Traffic-light Y is owned by Electron (`window_set_mac_chrome_variant`);
 * this module owns the shared tab-rail left inset and a refcounted IPC
 * acquire/release so multi-tab BrowserSession mounts do not thrash variants.
 */

import {
  desktopInvoke,
  isDesktopRuntime,
  isTauriShell,
} from "@/shared/lib/desktop-bridge";

/**
 * Extra left pad on the morphing tab rail when traffic lights are visible.
 * Tighter than main Header `pl-[92px]` — dense tab rail + lights (x≈14, ~52px
 * cluster) leave a short gap before the first tab. Shared by maximized
 * in-app browser and standalone browser windows.
 */
export const BROWSER_MAC_TRAFFIC_RAIL_INSET = 72;

type MacChromeVariant = "primary" | "browser" | "compact";

let browserChromeOwners = 0;

function isMacDesktop(): boolean {
  if (!isDesktopRuntime() || isTauriShell()) return false;
  if (typeof navigator === "undefined") return false;
  return /Macintosh|Mac OS X/i.test(navigator.userAgent);
}

function setMacChromeVariant(variant: MacChromeVariant): void {
  void desktopInvoke("window_set_mac_chrome_variant", { variant }).catch(
    () => {
      /* unsupported shell / pre-IPC — ignore */
    },
  );
}

/**
 * Claim dense `browser` traffic-light geometry on the host window.
 * Pair with {@link releaseBrowserMacChrome} on dispose.
 */
export function acquireBrowserMacChrome(): void {
  if (!isMacDesktop()) return;
  browserChromeOwners += 1;
  if (browserChromeOwners === 1) {
    setMacChromeVariant("browser");
  }
}

/**
 * Release a claim from {@link acquireBrowserMacChrome}. Restores `primary`
 * when the last owner leaves (main shell header height).
 */
export function releaseBrowserMacChrome(): void {
  if (!isMacDesktop()) return;
  if (browserChromeOwners <= 0) return;
  browserChromeOwners -= 1;
  if (browserChromeOwners === 0) {
    setMacChromeVariant("primary");
  }
}

/** Test-only reset for refcount between cases. */
export function __resetBrowserMacChromeOwnersForTests(): void {
  browserChromeOwners = 0;
}
