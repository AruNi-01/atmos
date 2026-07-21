"use client";

import { isTauriRuntime } from "@/shared/lib/desktop-runtime";

/**
 * APP-040 Browser Cookie Sync — frontend command bindings.
 *
 * These wrap the four dedicated Tauri commands exposed by the desktop track. The
 * whole pipeline is local and desktop-only (macOS 14+); there is no REST/WS path
 * for cookie data. The frontend only ever sees opaque handles + typed error codes
 * and never learns filesystem paths or cookie values.
 *
 * Frozen shared contract (identical across tracks):
 *   list_importable_browsers() -> Vec<BrowserProfileDto>
 *   import_browser_cookies({ profile_handle }) -> ImportReport
 *   clear_browser_cache() -> { ok }
 *   clear_browser_site_data() -> { ok }
 */

type TauriInvoke = <T = unknown>(cmd: string, payload?: unknown) => Promise<T>;

/** Source browser family, mirrors Rust `BrowserKind`. */
export type BrowserProfileKind = "Chrome" | "Edge" | "Brave" | "Firefox";

/** DTO returned by `list_importable_browsers`. */
export interface BrowserProfileDto {
  /** Opaque handle — never a filesystem path. */
  profile_handle: string;
  /** Serialized `BrowserKind` (e.g. "Chrome"). */
  browser: string;
  /** Human-facing profile label (e.g. "用户1"). */
  display_name: string;
  /** Best-effort process check — true when the source browser is still running. */
  running: boolean;
}

/** Verified import result returned by `import_browser_cookies`. */
export interface ImportReport {
  discovered: number;
  imported_verified: number;
  skipped_expired: number;
  skipped_decrypt: number;
  skipped_parse: number;
  /** Partitioned / CHIPS / container cookies safely skipped. */
  skipped_unsupported: number;
  failed_injection: number;
}

/** Stable error codes serialized from Rust `CookieCmdError` as `{ code }`. */
export type CookieCmdErrorCode =
  | "UnsupportedPlatform"
  | "ProfileNotFound"
  | "BrowserRunning"
  | "KeychainDenied"
  | "KeychainUnavailable"
  | "DatabaseBusy"
  | "Busy"
  | "Forbidden"
  | "Io"
  | "InvalidSchema"
  | "Unknown";

const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set<CookieCmdErrorCode>([
  "UnsupportedPlatform",
  "ProfileNotFound",
  "BrowserRunning",
  "KeychainDenied",
  "KeychainUnavailable",
  "DatabaseBusy",
  "Busy",
  "Forbidden",
  "Io",
  "InvalidSchema",
  "Unknown",
]);

/**
 * Normalize whatever a rejected `invoke` gives us into a stable {@link CookieCmdErrorCode}.
 * The command layer serializes errors as `{ code: "BrowserRunning" }`, but we defensively
 * accept a bare string or an unknown shape and fall back to `Unknown`.
 */
export function extractCookieErrorCode(error: unknown): CookieCmdErrorCode {
  const candidate =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;

  if (typeof candidate === "string" && KNOWN_ERROR_CODES.has(candidate)) {
    return candidate as CookieCmdErrorCode;
  }
  return "Unknown";
}

async function getInvoke(): Promise<TauriInvoke> {
  const internals = (window as {
    __TAURI_INTERNALS__?: { invoke?: TauriInvoke };
  }).__TAURI_INTERNALS__;

  if (internals?.invoke) {
    return internals.invoke;
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke as TauriInvoke;
}

function ensureDesktop(): void {
  if (!isTauriRuntime()) {
    // Non-desktop callers should never reach these commands (menu items are hidden),
    // but guard anyway so a stray call surfaces a stable code instead of a raw throw.
    throw { code: "UnsupportedPlatform" satisfies CookieCmdErrorCode };
  }
}

/** List detected source browsers + profiles (opaque handles + display names). */
export async function listImportableBrowsers(): Promise<BrowserProfileDto[]> {
  ensureDesktop();
  const invoke = await getInvoke();
  const result = await invoke<BrowserProfileDto[]>("list_importable_browsers");
  return Array.isArray(result) ? result : [];
}

/**
 * Import cookies for the chosen profile. Accepts only the opaque `profile_handle`;
 * the Rust side re-runs discovery and resolves the canonical path internally.
 */
export async function importBrowserCookies(profileHandle: string): Promise<ImportReport> {
  ensureDesktop();
  const invoke = await getInvoke();
  return invoke<ImportReport>("import_browser_cookies", { profile_handle: profileHandle });
}

/** Clear cache-class data only (cookies + web storage preserved; stays logged in). */
export async function clearBrowserCache(): Promise<void> {
  ensureDesktop();
  const invoke = await getInvoke();
  await invoke<{ ok: boolean }>("clear_browser_cache");
}

/** Clear caches + web storage + cookies (may sign the user out of sites). */
export async function clearBrowserSiteData(): Promise<void> {
  ensureDesktop();
  const invoke = await getInvoke();
  await invoke<{ ok: boolean }>("clear_browser_site_data");
}
