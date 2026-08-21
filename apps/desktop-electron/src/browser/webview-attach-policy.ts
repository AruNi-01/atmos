/**
 * Pure attach-policy helpers for desktop `<webview>` guests (APP-053).
 * No Electron imports — unit-tested without launching Chromium.
 */

export const BROWSER_PARTITION = "persist:atmos-browser";

/** Attribute the host renderer sets on <webview> so will-attach can bind uniquely. */
export const ATMOS_SESSION_ATTR = "data-atmos-session";

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
   * Preferred session from host <webview data-atmos-session="…">.
   * When present and registered, wins over URL matching (eliminates multi-tab races).
   */
  preferredSessionId?: string | null;
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

/** Normalize http(s) URLs for loose equality (trailing slash, default ports). */
export function normalizeBrowserUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "about:blank") return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return trimmed;
    // href already normalizes trailing slash for bare origins
    return u.href;
  } catch {
    return trimmed;
  }
}

export function urlsLooselyEqual(a: string, b: string): boolean {
  if (a === b) return true;
  const na = normalizeBrowserUrl(a);
  const nb = normalizeBrowserUrl(b);
  return na.length > 0 && na === nb;
}

/**
 * Pull preferred session id from Electron will-attach params / webPreferences.
 * Host sets data-atmos-session on the <webview> element.
 */
export function extractPreferredSessionId(
  params: Record<string, unknown> | null | undefined,
  webPreferences?: Record<string, unknown> | null,
): string | null {
  const candidates: unknown[] = [];
  if (params && typeof params === "object") {
    candidates.push(
      params[ATMOS_SESSION_ATTR],
      params["dataAtmosSession"],
      params["data-atmos-session"],
      params.atmosSession,
      params.sessionId,
    );
  }
  if (webPreferences && typeof webPreferences === "object") {
    const args = webPreferences.additionalArguments;
    if (Array.isArray(args)) {
      for (const arg of args) {
        if (typeof arg !== "string") continue;
        const m = /^--atmos-browser-session=(.+)$/.exec(arg);
        if (m?.[1]) candidates.push(m[1]);
      }
    }
  }
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

/**
 * Default-deny evaluate for will-attach-webview.
 *
 * Priority:
 * 1. preferredSessionId if registered (pending preferred, else any)
 * 2. First pending whose url matches src
 * 3. Bootstrap (empty/about:blank): first pending
 * 4. Single pending: that session
 * 5. Any registered session matching src (re-attach)
 * 6. Deny
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

  const preferred = (input.preferredSessionId ?? "").trim();
  if (preferred) {
    const hit = input.registered.find((s) => s.sessionId === preferred);
    if (hit) {
      return { allow: true, sessionId: hit.sessionId };
    }
    return {
      allow: false,
      reason: `preferred session not registered: ${preferred}`,
    };
  }

  const pending = input.registered.filter((s) => s.pendingAttach);

  if (pending.length > 0) {
    if (!bootstrap) {
      const pendingExact = pending.find((s) => urlsLooselyEqual(s.url, src));
      if (pendingExact) {
        return { allow: true, sessionId: pendingExact.sessionId };
      }
    }

    if (bootstrap || pending.length === 1) {
      return { allow: true, sessionId: pending[0]!.sessionId };
    }

    // Multi-pending without preferred id and without URL match: still try all
    // registered (including non-pending) by URL so re-attach during tab churn works.
    const anyExact = input.registered.find((s) => urlsLooselyEqual(s.url, src));
    if (anyExact) {
      return { allow: true, sessionId: anyExact.sessionId };
    }

    return {
      allow: false,
      reason: "ambiguous pending sessions; src does not match a pending URL",
    };
  }

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

/**
 * Guest Web API permissions that product browsing / local dev needs.
 *
 * Chromium's async Clipboard API (`navigator.clipboard.writeText`) requests
 * `clipboard-sanitized-write`. A blanket default-deny makes Next.js error
 * overlay Copy (and any in-page copy button) fail with:
 * "Failed to execute 'writeText' on 'Clipboard': Write permission denied."
 *
 * `media` (camera/mic) and `notifications` are allowed so local app previews
 * can exercise those APIs. Device/hardware ports and high-risk surfaces stay
 * denied by the surface manager (geolocation, USB/HID/serial, display-capture,
 * openExternal, fileSystem, etc.).
 */
export const BROWSER_GUEST_ALLOWED_PERMISSIONS = new Set<string>([
  "clipboard-sanitized-write",
  "clipboard-read",
  "media",
  "notifications",
  // Common preview UX; low risk compared to device ports / capture.
  "fullscreen",
  "pointerLock",
]);

/** True when a guest permission may be granted under APP-053 lockdown. */
export function isAllowedBrowserGuestPermission(permission: string): boolean {
  return BROWSER_GUEST_ALLOWED_PERMISSIONS.has(permission);
}
