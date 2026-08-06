/**
 * Browser guest runtime paths + bridge injection (APP-053).
 * Kept pure of BrowserSurfaceManager lifecycle so attach/bind stays scannable.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBrowserRuntimeScriptPath } from "./browser-runtime-path.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "packages/shared/browser/browser-runtime.js"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(start, "../../..");
}
const REPO_ROOT = findRepoRoot(__dirname);

export function browserRuntimeScriptPath(): string {
  return resolveBrowserRuntimeScriptPath(__dirname, REPO_ROOT);
}

export function browserPreloadPath(): string {
  // Built as CommonJS (.cjs) so sandboxed guest preloads can load.
  const candidates = [
    join(__dirname, "browser-preload.cjs"),
    join(__dirname, "browser-preload.js"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0]!;
}

export function buildBridgeInjection(bridgeToken: string): string {
  const runtimePath = browserRuntimeScriptPath();
  const runtime = existsSync(runtimePath)
    ? readFileSync(runtimePath, "utf8")
    : "/* browser-runtime.js missing */";
  if (!existsSync(runtimePath)) {
    console.error(`[browser] runtime script missing: ${runtimePath}`);
  }
  const tokenJson = JSON.stringify(bridgeToken);
  // Host SelectionPopover owns toolbar chrome — guest toolbar off (APP-053).
  return `
${runtime}
(() => {
  const invoke = window.__ATMOS_BROWSER_INVOKE__;
  if (!invoke) {
    console.error('[atmos-browser] __ATMOS_BROWSER_INVOKE__ missing — browser preload failed');
    return;
  }
  if (!window.__ATMOS_BROWSER_RUNTIME__) {
    console.error('[atmos-browser] __ATMOS_BROWSER_RUNTIME__ missing — runtime inject failed');
    return;
  }
  const bridgeToken = ${tokenJson};
  // Re-bind API on every inject (hot-fix clear vs exit pick mode).
  // Only createRuntime once per document — destroy would drop overlay DOM mid-session.
  if (!window.__ATMOS_DESKTOP_BROWSER_CONTROLLER__) {
    window.__ATMOS_DESKTOP_BROWSER_CONTROLLER__ = window.__ATMOS_BROWSER_RUNTIME__.createRuntime({
      win: window,
      // Host SelectionPopover owns toolbar chrome; guest still draws pick hover/lock labels.
      showSelectionToolbar: false,
      showHoverLabel: true,
      emit(message) {
        invoke('browser_bridge_event', {
          payload: Object.assign({}, message, { bridgeToken })
        }).catch((err) => {
          console.error('[atmos-browser] emit failed', err);
        });
      },
    });
  }
  const controller = window.__ATMOS_DESKTOP_BROWSER_CONTROLLER__;
  window.__ATMOS_DESKTOP_BROWSER_BRIDGE__ = {
    announceReady(sessionId) { controller.announceReady(sessionId); },
    enterPickMode(sessionId) { controller.enterPickMode(sessionId); },
    // Unlock only — keep pick mode (host SelectionPopover dismiss / re-pick).
    clearSelection() { controller.clearSelection(false); },
    // Full pick-mode off (toolbar toggle / tab hide).
    exitPickMode() { controller.exitPickMode(); },
    clearAnnotations() { controller.clearAnnotations?.(); },
    syncOverlays() { controller.syncOverlays?.(); },
    destroy() { controller.destroy(); },
  };
})();
`;
}
