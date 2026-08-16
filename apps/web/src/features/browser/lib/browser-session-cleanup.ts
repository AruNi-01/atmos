import { isDesktopRuntime } from "@/shared/lib/desktop-runtime";
import { invokeDesktopBrowserBridge } from "@/shared/lib/desktop-browser-bridge";
import type { ConnectionInstanceId } from "@/features/connection/lib/connection-instance";
import { useUiPrefStore } from "@/shared/stores/use-ui-pref-store";

import {
  DEFAULT_PREVIEW_BROWSER_PREFS,
  type PreviewBrowserPrefs,
} from "./browser-labels";
import {
  omitPreviewBrowserContext,
  sessionIdsForBrowserContext,
} from "./browser-session-cleanup-policy";
import { useBrowserSessionMapStore } from "../store/use-browser-session-map";

export { omitPreviewBrowserContext, sessionIdsForBrowserContext };

/** Close in-memory + desktop guests for these session ids. Idempotent. */
export function closeDesktopBrowserSessions(sessionIds: string[]): void {
  const unique = [...new Set(sessionIds.filter(Boolean))];
  if (unique.length === 0) return;
  const map = useBrowserSessionMapStore.getState();
  for (const sessionId of unique) {
    const binding = map.findBySession(sessionId);
    if (binding) {
      map.unbindTab(binding.tabId);
    }
  }
  if (!isDesktopRuntime()) return;
  for (const sessionId of unique) {
    void invokeDesktopBrowserBridge("browser_bridge_close", { sessionId }).catch(
      () => undefined,
    );
  }
}

/** Drop every guest + routing row for a Browser panel that is leaving the tree. */
export function closeDesktopBrowserContext(browserContextId: string): void {
  const map = useBrowserSessionMapStore.getState();
  closeDesktopBrowserSessions(
    sessionIdsForBrowserContext(map.bySession, browserContextId),
  );
  useBrowserSessionMapStore.getState().unregisterPanel(browserContextId);
}

export function dropPreviewBrowserContext(
  instanceId: ConnectionInstanceId,
  browserContextId: string,
): void {
  const prefs =
    (useUiPrefStore
      .getState()
      .readSlice(instanceId, "previewBrowser", DEFAULT_PREVIEW_BROWSER_PREFS) as
      | PreviewBrowserPrefs
      | undefined) ?? DEFAULT_PREVIEW_BROWSER_PREFS;
  const next = omitPreviewBrowserContext(prefs, browserContextId);
  if (next === prefs) return;
  useUiPrefStore.getState().writeSlice(instanceId, "previewBrowser", next);
}
