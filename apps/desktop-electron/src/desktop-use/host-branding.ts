/**
 * Product-named host serve path so Activity Monitor does not show the
 * upstream engine filename. Does not rotate codesign (TCC stays).
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
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mainLog } from "../main-log.js";
import { atmosHomeDir, desktopUseDriverStop, isAtmosCliInstalled } from "./client.js";

const execFileAsync = promisify(execFile);

export const HOST_APP_NAME = "Atmos Desktop Use";

/** On-disk filename from the pinned upstream archive. Internal only. */
const UPSTREAM_HOST_EXEC = "cua-driver";

const ENGINE_BINARY_MIN_BYTES = 64 * 1024;

export type HostBrandingResult = {
  hostApp: string | null;
  aliased: boolean;
  trampoline: boolean;
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

export async function ensureDesktopUseHostBranding(): Promise<HostBrandingResult> {
  if (process.platform !== "darwin") {
    return { hostApp: null, aliased: false, trampoline: false, restarted: false };
  }
  const hostApp = resolveDesktopUseHostApp();
  if (!hostApp) {
    return { hostApp: null, aliased: false, trampoline: false, restarted: false };
  }

  const before = applyHostServeAlias(hostApp);
  let restarted = false;

  const needsRestart = before.aliased || before.trampoline || (await isVendorNamedServeLive(hostApp));
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

  if (before.aliased || before.trampoline || restarted) {
    mainLog(
      `[desktop-use] host branding aliased=${before.aliased} trampoline=${before.trampoline} restarted=${restarted}`,
    );
  }

  return {
    hostApp,
    aliased: before.aliased,
    trampoline: before.trampoline,
    restarted,
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
