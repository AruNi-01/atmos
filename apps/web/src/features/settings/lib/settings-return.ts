type HistoryEntryLike = { url?: string | null };

const SETTINGS_RETURN_PATH_KEY = "atmos:settings-return-path";
const FALLBACK_RETURN_PATH = "/";

let memoryReturnPath: string | null = null;

export function isSettingsPathname(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname || "/";
  return normalized === "/settings";
}

export function sanitizeSettingsReturnPath(
  href: string,
  origin: string,
): string | null {
  try {
    const url = new URL(href, origin);
    if (url.origin !== new URL(origin).origin) return null;
    if (isSettingsPathname(url.pathname)) return null;
    url.searchParams.delete("settingsModal");
    url.searchParams.delete("activeSettingTab");
    return `${url.pathname}${url.search}${url.hash}` || FALLBACK_RETURN_PATH;
  } catch {
    return null;
  }
}

/** Last same-origin href that is not the settings route, or null if none. */
export function findSettingsReturnHref(
  entries: HistoryEntryLike[],
  origin: string,
): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const raw = entries[i]?.url;
    if (!raw) continue;
    const sanitized = sanitizeSettingsReturnPath(raw, origin);
    if (sanitized) return sanitized;
  }
  return null;
}

/** Last same-origin href that is not the settings route, or `/` if none. */
export function resolveSettingsReturnHref(
  entries: HistoryEntryLike[],
  origin: string,
): string {
  return findSettingsReturnHref(entries, origin) ?? FALLBACK_RETURN_PATH;
}

function currentOrigin(): string {
  return typeof window === "undefined" ? "http://local.invalid" : window.location.origin;
}

function readStoredReturnPath(): string | null {
  if (memoryReturnPath) return memoryReturnPath;
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(SETTINGS_RETURN_PATH_KEY);
  } catch {
    return null;
  }
}

function writeStoredReturnPath(path: string): void {
  memoryReturnPath = path;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SETTINGS_RETURN_PATH_KEY, path);
  } catch {
    // Private mode / quota — in-memory path is enough for this session.
  }
}

export function rememberSettingsReturnPath(href?: string): void {
  if (typeof window === "undefined" && href == null) return;
  const raw = href ?? `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const sanitized = sanitizeSettingsReturnPath(raw, currentOrigin());
  if (!sanitized) return;
  writeStoredReturnPath(sanitized);
}

export function resolveStoredSettingsReturnPath(): string | null {
  const origin = currentOrigin();
  const stored = readStoredReturnPath();
  const fromStored = stored ? sanitizeSettingsReturnPath(stored, origin) : null;
  if (fromStored) return fromStored;

  if (typeof document !== "undefined" && document.referrer) {
    return sanitizeSettingsReturnPath(document.referrer, origin);
  }

  return null;
}

export function __resetSettingsReturnPathForTests(): void {
  memoryReturnPath = null;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SETTINGS_RETURN_PATH_KEY);
  } catch {
    // ignore
  }
}