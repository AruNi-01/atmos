/**
 * Product-named host serve path so Activity Monitor does not show the
 * upstream engine filename. Serve alias does not rotate codesign (TCC stays).
 *
 * Host AppIcon is kept in lockstep with the Desktop product icns so the
 * grant overlay drag ghost and System Settings (Accessibility / Screen
 * Recording) show the same mark. Replacing the icns re-signs ad-hoc and
 * can drop those grants once — same as the Rust ensure/rebrand path.
 *
 * Existing CLIs still exec `Contents/MacOS/<upstream>` — that path becomes a
 * tiny `exec` shim once the Mach-O is reachable under the product name.
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
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mainLog } from "../main-log.js";
import { atmosHomeDir, desktopUseDriverStop, isAtmosCliInstalled } from "./client.js";

const execFileAsync = promisify(execFile);

export const HOST_APP_NAME = "Atmos Desktop Use";

const LSREGISTER =
  "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

/** On-disk filename from the pinned upstream archive. Internal only. */
const UPSTREAM_HOST_EXEC = "cua-driver";

const ENGINE_BINARY_MIN_BYTES = 64 * 1024;

export type HostBrandingResult = {
  hostApp: string | null;
  aliased: boolean;
  trampoline: boolean;
  restarted: boolean;
  iconUpdated: boolean;
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

/** Product icns used for Atmos Desktop Use.app (System Settings / TCC list). */
export function resolveHostAppIconSource(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const resourcesPath =
    typeof process.resourcesPath === "string" ? process.resourcesPath : "";
  const roots = [
    resourcesPath ? join(resourcesPath, "icons") : "",
    join(here, "..", "resources", "icons"),
    join(here, "..", "..", "resources", "icons"),
    join(here, "..", "..", "..", "resources", "icons"),
    join(here, "..", "..", "..", "crates", "desktop-use", "assets"),
    join(here, "..", "..", "crates", "desktop-use", "assets"),
  ].filter((root) => root.length > 0);
  for (const root of roots) {
    for (const name of ["icon.icns", "host-app-icon.icns"]) {
      const p = join(root, name);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

/**
 * Write the current product icns onto the host bundle.
 * Returns true when bytes changed (caller should re-sign + lsregister).
 */
export function applyHostAppIcon(
  appPath: string,
  sourceIcns: string | null = resolveHostAppIconSource(),
): boolean {
  if (!sourceIcns || !existsSync(sourceIcns) || !existsSync(appPath)) {
    return false;
  }
  const destDir = join(appPath, "Contents", "Resources");
  const dest = join(destDir, "AppIcon.icns");
  let want: Buffer;
  try {
    want = readFileSync(sourceIcns);
  } catch {
    return false;
  }
  if (want.length === 0) return false;
  try {
    if (existsSync(dest) && readFileSync(dest).equals(want)) {
      return false;
    }
  } catch {
    /* replace */
  }
  mkdirSync(destDir, { recursive: true });
  writeFileSync(dest, want);
  return true;
}

/** Ad-hoc re-sign + Launch Services / Icon Services refresh after an icon write. */
export async function refreshHostAppIconRegistration(
  appPath: string,
): Promise<void> {
  if (process.platform !== "darwin" || !existsSync(appPath)) return;
  try {
    await execFileAsync("codesign", ["--force", "--deep", "-s", "-", appPath], {
      timeout: 20_000,
    });
  } catch (e) {
    mainLog(
      `[desktop-use] host icon codesign failed: ${e instanceof Error ? e.message : String(e)}`,
      "warn",
    );
  }
  try {
    await execFileAsync(LSREGISTER, ["-f", appPath], { timeout: 8_000 });
  } catch {
    /* best-effort */
  }
  try {
    await execFileAsync(
      "touch",
      [appPath, join(appPath, "Contents", "Resources", "AppIcon.icns")],
      { timeout: 3_000 },
    );
  } catch {
    /* best-effort */
  }
  try {
    await execFileAsync("killall", ["iconservicesagent"], { timeout: 2_000 });
  } catch {
    /* agent restarts */
  }
}

export async function ensureDesktopUseHostBranding(): Promise<HostBrandingResult> {
  if (process.platform !== "darwin") {
    return {
      hostApp: null,
      aliased: false,
      trampoline: false,
      restarted: false,
      iconUpdated: false,
    };
  }
  const hostApp = resolveDesktopUseHostApp();
  if (!hostApp) {
    return {
      hostApp: null,
      aliased: false,
      trampoline: false,
      restarted: false,
      iconUpdated: false,
    };
  }

  const before = applyHostServeAlias(hostApp);
  let iconUpdated = applyHostAppIcon(hostApp);
  let restarted = false;

  const needsRestart =
    before.aliased ||
    before.trampoline ||
    iconUpdated ||
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
    iconUpdated = applyHostAppIcon(hostApp) || iconUpdated;
    restarted = true;
  }

  if (iconUpdated) {
    await refreshHostAppIconRegistration(hostApp);
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
    restarted,
    iconUpdated,
  };
}

async function isVendorNamedServeLive(hostApp: string): Promise<boolean> {
  const needle = `${hostApp}/Contents/MacOS/${UPSTREAM_HOST_EXEC} serve`;
  try {
    await execFileAsync("pgrep", ["-f", needle], { timeout: 2_000 });
    return true;
  } catch {
    return false;
  }
}

/** Test helper: create the host MacOS dir if missing. */
export function ensureHostMacosDir(appPath: string): string {
  const macos = join(appPath, "Contents", "MacOS");
  mkdirSync(macos, { recursive: true });
  return macos;
}
