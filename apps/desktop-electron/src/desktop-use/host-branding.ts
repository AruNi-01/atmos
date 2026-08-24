/**
 * Keep the installed Desktop Use host looking like Atmos:
 * 1. Product-named serve binary (Activity Monitor process name)
 * 2. Current Atmos app icon (Activity Monitor / Settings TCC list)
 *
 * Does not rotate codesign (TCC stays). Installed CLIs may still rewrite the
 * host icns from their own embed on `driver ensure` — call this after ensure
 * so Desktop's icon wins.
 */

import {
  copyFileSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { mainLog } from "../main-log.js";
import {
  atmosHomeDir,
  desktopUseDriverStop,
  isAtmosCliInstalled,
} from "./client.js";

const execFileAsync = promisify(execFile);

export const HOST_APP_NAME = "Atmos Desktop Use";

/** On-disk filename from the pinned upstream archive. Internal only. */
const UPSTREAM_HOST_EXEC = "cua-driver";

const ENGINE_BINARY_MIN_BYTES = 64 * 1024;
const ICNS_MAGIC = Buffer.from("icns");
const LSREGISTER =
  "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

export type HostBrandingResult = {
  hostApp: string | null;
  aliased: boolean;
  trampoline: boolean;
  iconUpdated: boolean;
  restarted: boolean;
};

export function resolveDesktopUseHostApp(opts?: { home?: string }): string | null {
  const candidates: string[] = [];
  if (process.env.ATMOS_DESKTOP_USE_HOME) {
    candidates.push(
      join(process.env.ATMOS_DESKTOP_USE_HOME, "host", `${HOST_APP_NAME}.app`),
    );
  }
  const home = atmosHomeDir(opts);
  candidates.push(join(home, "desktop-use", "host", `${HOST_APP_NAME}.app`));
  candidates.push(join(home, "data", "desktop-use", "host", `${HOST_APP_NAME}.app`));
  if (!opts?.home) {
    candidates.push(join(homedir(), ".atmos", "desktop-use", "host", `${HOST_APP_NAME}.app`));
  }
  for (const app of candidates) {
    if (existsSync(app)) return app;
  }
  return null;
}

export function applyHostServeAlias(appPath: string): {
  aliased: boolean;
  trampoline: boolean;
} {
  const macos = join(appPath, "Contents", "MacOS");
  const branded = join(macos, HOST_APP_NAME);
  const upstream = join(macos, UPSTREAM_HOST_EXEC);
  let aliased = false;
  let trampoline = false;

  if (!existsSync(macos)) {
    return { aliased, trampoline };
  }

  if (!existsSync(branded) && existsSync(upstream)) {
    if (isEngineMachO(upstream)) {
      try {
        renameSync(upstream, branded);
        writeTrampoline(upstream);
        return { aliased: true, trampoline: true };
      } catch {
        /* fall through to link */
      }
    }
    try {
      linkSync(upstream, branded);
      aliased = true;
    } catch {
      try {
        symlinkSync(UPSTREAM_HOST_EXEC, branded);
        aliased = true;
      } catch {
        /* leave spawn on upstream filename */
      }
    }
  }

  if (existsSync(branded) && existsSync(upstream) && isEngineMachO(upstream)) {
    try {
      if (sameFile(upstream, branded)) {
        const tmp = `${branded}.mach-o-tmp`;
        copyFileSync(upstream, tmp);
        rmSync(branded);
        renameSync(tmp, branded);
      }
      writeTrampoline(upstream);
      trampoline = true;
    } catch {
      /* keep the Mach-O at the upstream name */
    }
  }

  return { aliased, trampoline };
}

function writeTrampoline(upstreamPath: string): void {
  const script = `#!/bin/sh\nexec "$(dirname "$0")/${HOST_APP_NAME}" "$@"\n`;
  const tmp = `${upstreamPath}.trampoline-tmp`;
  writeFileSync(tmp, script, { mode: 0o755 });
  renameSync(tmp, upstreamPath);
}

function sameFile(a: string, b: string): boolean {
  try {
    const la = lstatSync(a);
    const lb = lstatSync(b);
    return la.dev === lb.dev && la.ino === lb.ino;
  } catch {
    return false;
  }
}

function isEngineMachO(path: string): boolean {
  try {
    return lstatSync(path).isFile() && lstatSync(path).size > ENGINE_BINARY_MIN_BYTES;
  } catch {
    return false;
  }
}

/** Product icns for the host app (same plate as Atmos.app). */
export function resolveHostAppIconPath(opts?: {
  extraRoots?: string[];
}): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const resourcesPath =
    typeof process.resourcesPath === "string" ? process.resourcesPath : "";
  const roots = [
    ...(opts?.extraRoots ?? []),
    join(resourcesPath, "icons"),
    resourcesPath,
    join(here, "resources", "icons"),
    join(here, "..", "resources", "icons"),
    join(here, "..", "..", "resources", "icons"),
    join(here, "..", "..", "..", "resources", "icons"),
    join(here, "..", "..", "..", "..", "crates", "desktop-use", "assets"),
    join(here, "..", "..", "..", "crates", "desktop-use", "assets"),
  ];
  for (const root of roots) {
    if (!root) continue;
    for (const name of ["icon.icns", "host-app-icon.icns"]) {
      const p = join(root, name);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

/**
 * Replace `Contents/Resources/AppIcon.icns` when bytes differ.
 * Returns true when the file was written. Does not codesign.
 */
export function applyHostAppIcon(appPath: string, icnsPath: string): boolean {
  if (!existsSync(icnsPath)) return false;
  let next: Buffer;
  try {
    next = readFileSync(icnsPath);
  } catch {
    return false;
  }
  if (next.length < 16 || !next.subarray(0, 4).equals(ICNS_MAGIC)) {
    return false;
  }
  const dest = join(appPath, "Contents", "Resources", "AppIcon.icns");
  try {
    if (existsSync(dest) && readFileSync(dest).equals(next)) {
      return false;
    }
  } catch {
    /* replace */
  }
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp`;
  writeFileSync(tmp, next);
  renameSync(tmp, dest);
  return true;
}

const CF_BUNDLE_ICON_NAME_XML =
  /\s*<key>CFBundleIconName<\/key>\s*<string>[^<]*<\/string>/;

/**
 * Without Assets.car, CFBundleIconName makes LaunchServices keep a stale
 * catalog icon (the old vendor plate) instead of AppIcon.icns.
 */
export function preferHostIcnsOverCatalog(appPath: string): boolean {
  const assetsCar = join(appPath, "Contents", "Resources", "Assets.car");
  const plist = join(appPath, "Contents", "Info.plist");
  if (!existsSync(plist) || existsSync(assetsCar)) return false;
  if (stripIconNameWithPlutil(plist)) return true;
  return stripIconNameFromXmlPlist(plist);
}

function stripIconNameWithPlutil(plist: string): boolean {
  try {
    const extracted = spawnSync(
      "plutil",
      ["-extract", "CFBundleIconName", "raw", "-o", "-", plist],
      { encoding: "utf8" },
    );
    if (extracted.error || extracted.status !== 0) return false;
    const removed = spawnSync("plutil", ["-remove", "CFBundleIconName", plist], {
      stdio: "ignore",
    });
    return !removed.error && removed.status === 0;
  } catch {
    return false;
  }
}

/** Fallback when plutil is missing (Linux unit tests). */
function stripIconNameFromXmlPlist(plist: string): boolean {
  try {
    const raw = readFileSync(plist);
    if (raw.subarray(0, 8).toString("ascii") === "bplist00") return false;
    const text = raw.toString("utf8");
    const next = text.replace(CF_BUNDLE_ICON_NAME_XML, "");
    if (next === text) return false;
    writeFileSync(plist, next);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDesktopUseHostBranding(opts?: {
  icnsPath?: string | null;
}): Promise<HostBrandingResult> {
  const empty: HostBrandingResult = {
    hostApp: null,
    aliased: false,
    trampoline: false,
    iconUpdated: false,
    restarted: false,
  };
  if (process.platform !== "darwin") {
    return empty;
  }
  const hostApp = resolveDesktopUseHostApp();
  if (!hostApp) {
    return empty;
  }

  const before = applyHostServeAlias(hostApp);
  const icnsPath =
    opts?.icnsPath === undefined ? resolveHostAppIconPath() : opts.icnsPath;
  const iconWritten =
    Boolean(icnsPath) && applyHostAppIcon(hostApp, icnsPath as string);
  const catalogCleared = preferHostIcnsOverCatalog(hostApp);
  const iconUpdated = iconWritten || catalogCleared;
  let restarted = false;

  const wasLive = await isHostServeLive(hostApp);
  const needsRestart =
    before.aliased ||
    before.trampoline ||
    (wasLive && iconUpdated) ||
    (await isVendorNamedServeLive(hostApp));
  if (needsRestart) {
    try {
      if (isAtmosCliInstalled()) {
        await desktopUseDriverStop();
      }
    } catch (e) {
      mainLog(
        `[desktop-use] host branding stop failed: ${e instanceof Error ? e.message : String(e)}`,
        "warn",
      );
    }
    try {
      await execFileAsync(
        "pkill",
        ["-f", `${HOST_APP_NAME}.app/Contents/MacOS/.*serve`],
        { timeout: 3_000 },
      );
    } catch {
      /* no match */
    }
    // Trampoline write may have been skipped while the Mach-O was mapped.
    applyHostServeAlias(hostApp);
    restarted = true;
  }

  if (iconUpdated) {
    await refreshHostIconCache(hostApp);
    if (wasLive) {
      try {
        await execFileAsync(
          "open",
          [
            "-n",
            "-g",
            "-a",
            hostApp,
            "--args",
            "serve",
            "--socket",
            desktopUseSocketPath(),
            "--no-permissions-gate",
          ],
          { timeout: 5_000 },
        );
      } catch (e) {
        mainLog(
          `[desktop-use] host icon relaunch failed: ${e instanceof Error ? e.message : String(e)}`,
          "warn",
        );
      }
    }
  }

  if (before.aliased || before.trampoline || iconUpdated || restarted) {
    mainLog(
      `[desktop-use] host branding aliased=${before.aliased} trampoline=${before.trampoline} icon=${iconUpdated} restarted=${restarted}`,
    );
  }

  return {
    hostApp,
    aliased: before.aliased,
    trampoline: before.trampoline,
    iconUpdated,
    restarted,
  };
}

async function isVendorNamedServeLive(hostApp: string): Promise<boolean> {
  return isServeNeedleLive(
    `${hostApp}/Contents/MacOS/${UPSTREAM_HOST_EXEC} serve`,
  );
}

async function isHostServeLive(hostApp: string): Promise<boolean> {
  return (
    (await isServeNeedleLive(
      `${hostApp}/Contents/MacOS/${HOST_APP_NAME} serve`,
    )) || (await isVendorNamedServeLive(hostApp))
  );
}

async function isServeNeedleLive(needle: string): Promise<boolean> {
  try {
    await execFileAsync("pgrep", ["-f", needle], { timeout: 2_000 });
    return true;
  } catch {
    return false;
  }
}

function desktopUseSocketPath(): string {
  const root = process.env.ATMOS_DESKTOP_USE_HOME
    ? process.env.ATMOS_DESKTOP_USE_HOME
    : join(atmosHomeDir(), "desktop-use");
  return join(root, "engine.sock");
}

async function refreshHostIconCache(appPath: string): Promise<void> {
  try {
    const now = new Date();
    utimesSync(appPath, now, now);
    const icns = join(appPath, "Contents", "Resources", "AppIcon.icns");
    if (existsSync(icns)) utimesSync(icns, now, now);
  } catch {
    /* best-effort */
  }
  try {
    await execFileAsync(LSREGISTER, ["-f", appPath], { timeout: 4_000 });
  } catch {
    /* LaunchServices helper missing on some hosts */
  }
}

/** Test helper: create the host MacOS dir if missing. */
export function ensureHostMacosDir(appPath: string): string {
  const macos = join(appPath, "Contents", "MacOS");
  mkdirSync(macos, { recursive: true });
  return macos;
}
