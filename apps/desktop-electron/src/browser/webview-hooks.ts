/**
 * Install will-attach-webview / did-attach-webview on product UI windows (APP-053).
 */

import type { BrowserWindow, WebContents } from "electron";
import type { BrowserSurfaceManager } from "./surface-manager.js";
import {
  evaluateWillAttach,
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
    const partitionFromPrefs =
      typeof webPreferences.partition === "string"
        ? webPreferences.partition
        : "";
    const partitionFromParams =
      typeof (params as { partition?: string }).partition === "string"
        ? (params as { partition: string }).partition
        : "";
    const tagPartition =
      partitionFromParams || partitionFromPrefs || BROWSER_PARTITION;

    const src =
      typeof (params as { src?: string }).src === "string"
        ? (params as { src: string }).src
        : "";

    const decision = evaluateWillAttach({
      partition: tagPartition,
      src,
      registered: manager.listRegisteredSessions(),
    });

    if (!decision.allow) {
      console.warn(
        `[browser] will-attach-webview DENY: ${decision.reason} src=${src || "(empty)"} partition=${tagPartition}`,
      );
      event.preventDefault();
      return;
    }

    forceGuestWebPreferences(
      webPreferences as unknown as Record<string, unknown>,
      manager.getPreloadAbsolutePath(),
    );
    webPreferences.partition = BROWSER_PARTITION;

    (
      webPreferences as { additionalArguments?: string[] }
    ).additionalArguments = [
      ...((webPreferences as { additionalArguments?: string[] })
        .additionalArguments ?? []),
      `--atmos-browser-session=${decision.sessionId}`,
    ];

    console.log(
      `[browser] will-attach-webview ALLOW session=${decision.sessionId} src=${src || "(empty)"}`,
    );
    manager.markAttachAllowed(decision.sessionId, src);
  });

  hostWc.on("did-attach-webview", (_event, guestWc) => {
    manager.onGuestAttached(guestWc);
  });
}
