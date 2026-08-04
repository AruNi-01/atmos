/**
 * Install will-attach-webview / did-attach-webview on product UI windows (APP-053).
 */

import type { BrowserWindow, WebContents } from "electron";
import type { BrowserSurfaceManager } from "./surface-manager.js";
import {
  evaluateWillAttach,
  extractPreferredSessionId,
  forceGuestWebPreferences,
  BROWSER_PARTITION,
} from "./webview-attach-policy.js";

const wired = new WeakSet<WebContents>();

/**
 * Wire attach security + guest binding for a host BrowserWindow that may embed `<webview>`.
 */
export function installBrowserWebviewHooks(
  win: BrowserWindow,
  manager: BrowserSurfaceManager,
): void {
  const hostWc = win.webContents;
  if (wired.has(hostWc)) return;
  wired.add(hostWc);

  hostWc.on("will-attach-webview", (event, webPreferences, params) => {
    const paramsRecord = (params ?? {}) as Record<string, unknown>;
    const prefsRecord = webPreferences as unknown as Record<string, unknown>;

    const partitionFromPrefs =
      typeof webPreferences.partition === "string"
        ? webPreferences.partition
        : "";
    const partitionFromParams =
      typeof paramsRecord.partition === "string"
        ? (paramsRecord.partition as string)
        : "";
    const tagPartition =
      partitionFromParams || partitionFromPrefs || BROWSER_PARTITION;

    const src =
      typeof paramsRecord.src === "string" ? (paramsRecord.src as string) : "";

    const preferredSessionId = extractPreferredSessionId(
      paramsRecord,
      prefsRecord,
    );

    const decision = evaluateWillAttach({
      partition: tagPartition,
      src,
      preferredSessionId,
      registered: manager.listRegisteredSessions(),
    });

    if (!decision.allow) {
      console.warn(
        `[browser] will-attach-webview DENY: ${decision.reason} src=${src || "(empty)"} partition=${tagPartition} preferred=${preferredSessionId ?? "(none)"} registered=${manager.listRegisteredSessions().map((s) => `${s.sessionId.slice(0, 8)}:pending=${s.pendingAttach}`).join(",")}`,
      );
      event.preventDefault();
      return;
    }

    forceGuestWebPreferences(
      prefsRecord,
      manager.getPreloadAbsolutePath(),
    );
    webPreferences.partition = BROWSER_PARTITION;

    const existingArgs = Array.isArray(webPreferences.additionalArguments)
      ? webPreferences.additionalArguments
      : [];
    webPreferences.additionalArguments = [
      ...existingArgs.filter(
        (a) =>
          typeof a !== "string" || !a.startsWith("--atmos-browser-session="),
      ),
      `--atmos-browser-session=${decision.sessionId}`,
    ];

    console.log(
      `[browser] will-attach-webview ALLOW session=${decision.sessionId} src=${src || "(empty)"} preferred=${preferredSessionId ?? "(none)"}`,
    );
    manager.markAttachAllowed(decision.sessionId, src);
  });

  hostWc.on("did-attach-webview", (_event, guestWc) => {
    manager.onGuestAttached(guestWc);
  });
}
