/**
 * Pure attach-policy helpers for desktop `<webview>` guests (APP-053).
 * No Electron imports — unit-tested without launching Chromium.
 */

export const BROWSER_PARTITION = "persist:atmos-browser";

export type RegisteredBrowserSession = {
  sessionId: string;
  /** Last registered / current URL for this session (may be about:blank). */
  url: string;
  pendingAttach: boolean;
};

export type WillAttachInput = {
  partition: string | undefined | null;
  src: string | undefined | null;
  /**
   * Registered sessions in stable registration order.
   * Pending sessions must be consumed (pendingAttach cleared) after a successful
   * allow so two tabs with the same URL never both resolve to the first session.
   */
  registered: ReadonlyArray<RegisteredBrowserSession>;
};

export type WillAttachResult =
  | { allow: true; sessionId: string }
  | { allow: false; reason: string };

/**
 * True when src may create/navigate a guest.
 * Empty string is only a bootstrap placeholder (see evaluateWillAttach).
 */
export function isAllowedBrowserSrc(src: string): boolean {
  const trimmed = src.trim();
  if (!trimmed) return false;
  if (trimmed === "about:blank") return true;
  try {
    const u = new URL(trimmed);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Empty / about:blank bootstrap attach for a pending session. */
export function isBootstrapAttachSrc(src: string): boolean {
  const trimmed = src.trim();
  return !trimmed || trimmed === "about:blank";
}

/**
 * Default-deny evaluate for will-attach-webview.
 *
 * Binding rules (pending sessions only, registration order = FIFO):
 * 1. First pending session whose url loosely equals src
 * 2. Else if bootstrap src (empty / about:blank): first pending session
 *    (Electron often fires will-attach before React sets src)
 * 3. Else if exactly one pending session: that session
 * 4. Else re-attach existing non-pending session by URL
 * 5. Else deny
 *
 * Callers MUST clear `pendingAttach` for the returned sessionId immediately after
 * allow (see BrowserSurfaceManager.markAttachAllowed).
 */
export function evaluateWillAttach(input: WillAttachInput): WillAttachResult {
  const partition = (input.partition ?? "").trim();
  if (partition !== BROWSER_PARTITION) {
    return {
      allow: false,
      reason: `partition not allowed: ${partition || "(empty)"}`,
    };
  }

  const src = (input.src ?? "").trim();
  const bootstrap = isBootstrapAttachSrc(src);

  if (!bootstrap && !isAllowedBrowserSrc(src)) {
    return { allow: false, reason: `src not allowed: ${src || "(empty)"}` };
  }

  if (!input.registered.length) {
    return { allow: false, reason: "no registered browser sessions" };
  }

  const pending = input.registered.filter((s) => s.pendingAttach);

  if (pending.length > 0) {
    if (!bootstrap) {
      const pendingExact = pending.find((s) => urlsLooselyEqual(s.url, src));
      if (pendingExact) {
        return { allow: true, sessionId: pendingExact.sessionId };
      }
    }

    // Bootstrap (empty/about:blank) or single pending: bind first pending FIFO.
    // Empty src is the common Electron path when <webview> mounts before src is set.
    if (bootstrap || pending.length === 1) {
      return { allow: true, sessionId: pending[0]!.sessionId };
    }

    return {
      allow: false,
      reason: "ambiguous pending sessions; src does not match a pending URL",
    };
  }

  // No pending: never allow empty bootstrap — only real navigations for known sessions.
  if (bootstrap) {
    return { allow: false, reason: "bootstrap src with no pending session" };
  }

  const byUrl = input.registered.find((s) => urlsLooselyEqual(s.url, src));
  if (byUrl) {
    return { allow: true, sessionId: byUrl.sessionId };
  }

  return { allow: false, reason: "src not registered for any session" };
}

/**
 * Pure helper used by tests and managers: mark one session no longer pending.
 * Returns a new array (does not mutate input).
 */
export function consumePendingAttach(
  registered: ReadonlyArray<RegisteredBrowserSession>,
  sessionId: string,
): RegisteredBrowserSession[] {
  return registered.map((s) =>
    s.sessionId === sessionId ? { ...s, pendingAttach: false } : { ...s },
  );
}

export function urlsLooselyEqual(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.href === ub.href;
  } catch {
    return false;
  }
}

/**
 * Force safe guest webPreferences. Mutates and returns the same object.
 */
export function forceGuestWebPreferences(
  prefs: Record<string, unknown>,
  absolutePreloadPath: string,
): Record<string, unknown> {
  prefs.nodeIntegration = false;
  prefs.nodeIntegrationInSubFrames = false;
  prefs.nodeIntegrationInWorker = false;
  prefs.contextIsolation = true;
  prefs.sandbox = true;
  prefs.webSecurity = true;
  prefs.allowRunningInsecureContent = false;
  prefs.preload = absolutePreloadPath;
  delete prefs.preloadURL;
  return prefs;
}

/** `<webview preload>` must be an absolute file:// URL. */
export function toPreloadFileUrl(absolutePath: string): string {
  if (!absolutePath) return "";
  if (absolutePath.startsWith("file:")) return absolutePath;
  const normalized = absolutePath.replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${normalized}`;
  }
  if (normalized.startsWith("/")) {
    return `file://${normalized}`;
  }
  return `file://${normalized}`;
}
