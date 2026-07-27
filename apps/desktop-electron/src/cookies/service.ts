/**
 * Browser cookie sync for Electron preview partition (APP-041 / APP-045).
 * List + Chromium extract use Rust helper `atmos-browser-cookies` (Keychain).
 * Inject into Electron `persist:atmos-preview` session.
 */

import type { Session } from "electron";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type BrowserProfileDto = {
  profile_handle: string;
  browser: string;
  display_name: string;
  running: boolean;
};

export type ImportReport = {
  discovered: number;
  imported_verified: number;
  skipped_expired: number;
  skipped_decrypt: number;
  skipped_parse: number;
  skipped_unsupported: number;
  failed_injection: number;
};

type ImportedCookie = {
  identity: { name: string; domain: string; path: string };
  value: string;
  host_only: boolean;
  secure: boolean;
  http_only: boolean;
  same_site: string;
  expires: number | null;
  has_expires: boolean;
};

type ExtractionResult = {
  cookies: ImportedCookie[];
  skipped_expired: number;
  skipped_decrypt: number;
  skipped_parse: number;
  skipped_unsupported: number;
};

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, "crates/browser-cookies/Cargo.toml"))) return dir;
    if (existsSync(join(dir, "apps/desktop/src-tauri"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(start, "../../..");
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = findRepoRoot(__dirname);

/** Prefer built release/debug helper; fall back to cargo run. */
export function resolveBrowserCookiesHelper(): {
  mode: "bin" | "cargo";
  path: string;
  argsPrefix: string[];
} {
  const triples = [
    join(REPO_ROOT, "target/release/atmos-browser-cookies"),
    join(REPO_ROOT, "target/debug/atmos-browser-cookies"),
  ];
  for (const p of triples) {
    if (existsSync(p)) return { mode: "bin", path: p, argsPrefix: [] };
  }
  return {
    mode: "cargo",
    path: "cargo",
    argsPrefix: [
      "run",
      "-q",
      "-p",
      "browser-cookies",
      "--bin",
      "atmos-browser-cookies",
      "--",
    ],
  };
}

function runHelper(args: string[]): { ok: boolean; stdout: string; stderr: string; status: number } {
  const helper = resolveBrowserCookiesHelper();
  const fullArgs = [...helper.argsPrefix, ...args];
  const r = spawnSync(helper.path, fullArgs, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
    cwd: REPO_ROOT,
  });
  return {
    ok: r.status === 0,
    stdout: r.stdout?.toString() ?? "",
    stderr: r.stderr?.toString() ?? "",
    status: r.status ?? 1,
  };
}

function throwCookieError(stdout: string, fallback: string): never {
  try {
    const parsed = JSON.parse(stdout) as {
      error?: { code?: string; message?: string };
    };
    if (parsed.error?.code) {
      throw {
        code: parsed.error.code,
        message: parsed.error.message ?? parsed.error.code,
      };
    }
  } catch (e) {
    if (e && typeof e === "object" && "code" in e) throw e;
  }
  throw { code: fallback, message: stdout || "cookie helper failed" };
}

export function listImportableBrowsers(): BrowserProfileDto[] {
  if (process.platform !== "darwin") {
    throw { code: "UnsupportedPlatform" };
  }
  const r = runHelper(["list"]);
  if (!r.ok) throwCookieError(r.stdout || r.stderr, "Io");
  const data = JSON.parse(r.stdout) as BrowserProfileDto[];
  return Array.isArray(data) ? data : [];
}

export async function clearBrowserCache(
  previewSession: Session,
): Promise<{ ok: true }> {
  await previewSession.clearCache();
  return { ok: true };
}

export async function clearBrowserSiteData(
  previewSession: Session,
): Promise<{ ok: true }> {
  await previewSession.clearStorageData({
    storages: [
      "cookies",
      "localstorage",
      "indexdb",
      "shadercache",
      "websql",
      "serviceworkers",
      "cachestorage",
    ],
  });
  await previewSession.clearCache();
  return { ok: true };
}

function sameSiteToElectron(
  s: string,
): "unspecified" | "no_restriction" | "lax" | "strict" {
  switch (s) {
    case "none":
      return "no_restriction";
    case "lax":
      return "lax";
    case "strict":
      return "strict";
    default:
      return "unspecified";
  }
}

export async function importBrowserCookies(
  previewSession: Session,
  profileHandle: string,
): Promise<ImportReport> {
  if (process.platform !== "darwin") {
    throw { code: "UnsupportedPlatform" };
  }
  if (!profileHandle.trim()) {
    throw { code: "ProfileNotFound" };
  }

  const r = runHelper(["extract", "--handle", profileHandle]);
  if (!r.ok) throwCookieError(r.stdout || r.stderr, "Io");

  const extraction = JSON.parse(r.stdout) as ExtractionResult;
  const cookies = extraction.cookies ?? [];
  let imported = 0;
  let failed = 0;

  for (const c of cookies) {
    const domain = c.identity.domain;
    const urlHost = domain.startsWith(".") ? domain.slice(1) : domain;
    const scheme = c.secure ? "https" : "http";
    try {
      // Host-only: omit `domain` so Chromium treats the cookie as host-only
      // (Electron/Chromium ignore hostOnly flags; domain presence decides).
      await previewSession.cookies.set({
        url: `${scheme}://${urlHost}${c.identity.path || "/"}`,
        name: c.identity.name,
        value: c.value,
        ...(c.host_only ? {} : { domain }),
        path: c.identity.path || "/",
        secure: c.secure,
        httpOnly: c.http_only,
        expirationDate:
          c.has_expires && c.expires != null ? c.expires : undefined,
        sameSite: sameSiteToElectron(c.same_site),
      });
      imported += 1;
    } catch (e) {
      console.error(
        `[cookies] inject failed name=${c.identity.name} domain=${domain}`,
        e,
      );
      failed += 1;
    }
  }

  return {
    discovered: cookies.length,
    imported_verified: imported,
    skipped_expired: extraction.skipped_expired ?? 0,
    skipped_decrypt: extraction.skipped_decrypt ?? 0,
    skipped_parse: extraction.skipped_parse ?? 0,
    skipped_unsupported: extraction.skipped_unsupported ?? 0,
    failed_injection: failed,
  };
}

/** Test helper: ensure binary can be resolved or cargo fallback works. */
export function helperProbe(): string {
  const h = resolveBrowserCookiesHelper();
  return `${h.mode}:${h.path}`;
}

void execFileSync;
