/**
 * CGWindowList frontmost geometry (Tauri AppShot parity).
 *
 * Prefer this over System Events for window bounds: Electron / Chromium /
 * custom-UI apps often expose an empty AX tree but still have CG windows.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { DesktopUseFrontmost } from "./capture.js";

const execFileAsync = promisify(execFile);

export type CgFrontmostJson = {
  ok?: boolean;
  error?: string;
  app_name?: string;
  process_id?: number | null;
  window_id?: string | null;
  window_title?: string | null;
  bundle_id?: string | null;
  x?: number | null;
  y?: number | null;
  width?: number | null;
  height?: number | null;
  source?: string;
};

function resolveFrontmostBinary(): string | null {
  const name = "atmos-appshot-frontmost";
  const candidates: string[] = [];
  try {
    // Lazy: electron app may not be ready in unit tests
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require("electron") as typeof import("electron");
    const appPath = app.getAppPath();
    if (appPath.endsWith(".asar")) {
      candidates.push(join(`${appPath}.unpacked`, "resources", "bin", name));
    }
    candidates.push(join(appPath, "resources", "bin", name));
    if (typeof process.resourcesPath === "string" && process.resourcesPath) {
      candidates.push(join(process.resourcesPath, "bin", name));
      candidates.push(
        join(
          process.resourcesPath,
          "app.asar.unpacked",
          "resources",
          "bin",
          name,
        ),
      );
    }
  } catch {
    /* not electron / tests */
  }
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    candidates.push(join(here, "../../resources/bin", name));
    candidates.push(join(here, "../resources/bin", name));
  } catch {
    /* ignore */
  }
  candidates.push(
    join(process.cwd(), "apps/desktop-electron/resources/bin", name),
  );
  candidates.push(join(process.cwd(), "resources/bin", name));
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function parseCgFrontmostJson(raw: string): DesktopUseFrontmost | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let parsed: CgFrontmostJson;
  try {
    parsed = JSON.parse(raw.slice(start)) as CgFrontmostJson;
  } catch {
    return null;
  }
  if (parsed.ok === false) return null;
  const appName = (parsed.app_name ?? "").trim() || "Unknown App";
  const rawW = typeof parsed.width === "number" ? parsed.width : null;
  const rawH = typeof parsed.height === "number" ? parsed.height : null;
  // Both edges must be usable content size (reject title-bar strips).
  const usable =
    rawW != null && rawH != null && rawW >= 64 && rawH >= 64;
  return {
    appName,
    windowTitle: parsed.window_title?.trim() || null,
    bundleId: parsed.bundle_id?.trim() || null,
    processId:
      typeof parsed.process_id === "number" && Number.isFinite(parsed.process_id)
        ? parsed.process_id
        : null,
    windowId:
      typeof parsed.window_id === "string" && parsed.window_id.trim()
        ? parsed.window_id.trim()
        : typeof parsed.window_id === "number"
          ? String(parsed.window_id)
          : null,
    x: usable && typeof parsed.x === "number" ? parsed.x : null,
    y: usable && typeof parsed.y === "number" ? parsed.y : null,
    width: usable ? rawW : null,
    height: usable ? rawH : null,
  };
}

/**
 * Read frontmost app + largest content CG window (fast native helper).
 * Returns null when binary missing or failed — caller falls back to SE / host.
 */
export async function readFrontmostViaCgWindowList(): Promise<DesktopUseFrontmost | null> {
  if (process.platform !== "darwin") return null;
  const bin = resolveFrontmostBinary();
  if (!bin) return null;
  try {
    const { stdout, stderr } = await execFileAsync(bin, [], {
      timeout: 2_500,
      maxBuffer: 256 * 1024,
    });
    const text = (stdout || "").trim() || (stderr || "").trim();
    return parseCgFrontmostJson(text);
  } catch {
    return null;
  }
}
