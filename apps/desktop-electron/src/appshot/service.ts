/**
 * AppShot for Electron — DTOs match apps/web Appshot* types / Tauri serde shapes.
 *
 * Layout (aligned with Tauri records):
 *   ~/.atmos/appshot/records/<timestamp>/
 *     snapshot.png
 *     context.txt
 *     metadata.json
 */

import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { AppState } from "../app-state.js";

const execFileAsync = promisify(execFile);

function appshotRoot(): string {
  return join(homedir(), ".atmos", "appshot");
}

function recordsRoot(): string {
  return join(appshotRoot(), "records");
}

function recordDir(timestamp: string): string {
  return join(recordsRoot(), timestamp);
}

export type AppshotPermissionState = {
  name: "accessibility" | "screen_recording";
  display_name: string;
  granted: boolean;
  required_for: string[];
  recovery_action: {
    label: string;
    target: "accessibility" | "screen_recording" | "privacy_security";
    manual_steps: string[];
  } | null;
};

export type AppshotStatus = {
  supported: boolean;
  platform: "macos" | "windows" | "linux" | "unknown";
  reason: string | null;
  trigger: {
    mode:
      | "macos_modifier_gesture"
      | "regular_hotkey_fallback"
      | "unsupported";
    enabled: boolean;
    required_modifiers: string[];
    last_error: string | null;
    permissions: AppshotPermissionState[];
  };
  permissions: AppshotPermissionState[];
};

export type AppshotRecordListItem = {
  timestamp: string;
  record_dir: string;
};

export type AppshotRecordDetail = {
  timestamp: string;
  metadata: {
    timestamp: string;
    captured_at: string;
    platform: "macos" | "windows" | "linux" | "unknown";
    app_name: string;
    bundle_id: string | null;
    process_id: number | null;
    window_title: string | null;
    window_id: string | null;
    quality: string;
    record_dir: string;
    snapshot_path: string;
    context_path: string;
    metadata_path: string;
    screenshot: {
      available: boolean;
      width: number | null;
      height: number | null;
      media_type: string;
    };
    warnings: string[];
    context_bytes: number;
  };
  context_preview: string;
  snapshot_url: string | null;
};

/** Same contract as Tauri `data_url_for_png` — http UI cannot load file:// images. */
export function dataUrlForPng(bytes: Buffer | Uint8Array): string {
  const b64 = Buffer.from(bytes).toString("base64");
  return `data:image/png;base64,${b64}`;
}

export function dataUrlForPngFile(path: string): string | null {
  if (!existsSync(path)) return null;
  try {
    return dataUrlForPng(readFileSync(path));
  } catch {
    return null;
  }
}

/** Minimal valid 1×1 PNG for tests/fixtures. */
export const MINIMAL_PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function macosPermissions(): AppshotPermissionState[] {
  return [
    {
      name: "screen_recording",
      display_name: "Screen Recording",
      granted: true,
      required_for: ["screenshot"],
      recovery_action: {
        label: "Open Screen Recording settings",
        target: "screen_recording",
        manual_steps: [
          "System Settings → Privacy & Security → Screen Recording",
          "Enable Atmos Electron",
        ],
      },
    },
    {
      name: "accessibility",
      display_name: "Accessibility",
      granted: false,
      required_for: ["accessibility_tree"],
      recovery_action: {
        label: "Open Accessibility settings",
        target: "accessibility",
        manual_steps: [
          "System Settings → Privacy & Security → Accessibility",
          "Enable Atmos Electron for richer capture (Tauri parity)",
        ],
      },
    },
  ];
}

export async function appshotStatus(): Promise<AppshotStatus> {
  if (process.platform !== "darwin") {
    return {
      supported: false,
      platform: process.platform === "win32" ? "windows" : "linux",
      reason: "AppShot capture is only supported on macOS",
      trigger: {
        mode: "unsupported",
        enabled: false,
        required_modifiers: [],
        last_error: null,
        permissions: [],
      },
      permissions: [],
    };
  }

  const permissions = macosPermissions();
  return {
    supported: true,
    platform: "macos",
    reason: null,
    trigger: {
      mode: "regular_hotkey_fallback",
      enabled: true,
      required_modifiers: [],
      last_error: null,
      permissions,
    },
    permissions,
  };
}

export async function listRecords(): Promise<AppshotRecordListItem[]> {
  const root = recordsRoot();
  if (!existsSync(root)) return [];
  const items: AppshotRecordListItem[] = [];
  for (const name of readdirSync(root)) {
    const dir = join(root, name);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    // Accept either dir layout or legacy flat json
    const meta = join(dir, "metadata.json");
    const legacy = join(root, `${name}.json`);
    if (existsSync(meta) || existsSync(join(dir, "snapshot.png"))) {
      items.push({ timestamp: name, record_dir: dir });
    } else if (existsSync(legacy)) {
      items.push({ timestamp: name.replace(/\.json$/, ""), record_dir: root });
    }
  }
  // also scan legacy flat files
  for (const name of readdirSync(root)) {
    if (!name.endsWith(".json")) continue;
    const ts = name.replace(/\.json$/, "");
    if (items.some((i) => i.timestamp === ts)) continue;
    items.push({
      timestamp: ts,
      record_dir: root,
    });
  }
  items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return items;
}

function buildMetadata(
  timestamp: string,
  dir: string,
  opts: { title?: string; capturedAt?: string; contextBytes?: number } = {},
) {
  const snapshotPath = join(dir, "snapshot.png");
  const contextPath = join(dir, "context.txt");
  const metadataPath = join(dir, "metadata.json");
  const available = existsSync(snapshotPath);
  return {
    timestamp,
    captured_at: opts.capturedAt ?? new Date().toISOString(),
    platform: "macos" as const,
    app_name: "Atmos",
    bundle_id: null,
    process_id: null,
    window_title: opts.title ?? "Screenshot",
    window_id: null,
    quality: "screenshot_only",
    record_dir: dir,
    snapshot_path: snapshotPath,
    context_path: contextPath,
    metadata_path: metadataPath,
    screenshot: {
      available,
      width: null as number | null,
      height: null as number | null,
      media_type: "image/png",
    },
    warnings: [
      "electron_screencapture_backend",
      "accessibility_tree_not_available_on_electron",
    ],
    context_bytes: opts.contextBytes ?? 0,
  };
}

export async function readRecords(
  timestamps: string[],
): Promise<AppshotRecordDetail[]> {
  const out: AppshotRecordDetail[] = [];
  for (const ts of timestamps) {
    const dir = recordDir(ts);
    const metaPath = join(dir, "metadata.json");
    let metadata;
    if (existsSync(metaPath)) {
      metadata = JSON.parse(readFileSync(metaPath, "utf8")) as AppshotRecordDetail["metadata"];
    } else if (existsSync(join(recordsRoot(), `${ts}.json`))) {
      // legacy flat
      const legacy = JSON.parse(
        readFileSync(join(recordsRoot(), `${ts}.json`), "utf8"),
      ) as { timestamp?: string; title?: string; image_path?: string };
      metadata = buildMetadata(ts, recordsRoot(), {
        title: legacy.title,
      });
      if (legacy.image_path) {
        metadata.snapshot_path = legacy.image_path;
        metadata.screenshot.available = existsSync(legacy.image_path);
      }
    } else {
      continue;
    }
    let contextPreview = "";
    try {
      if (existsSync(metadata.context_path)) {
        contextPreview = readFileSync(metadata.context_path, "utf8").slice(
          0,
          2000,
        );
      }
    } catch {
      /* ignore */
    }
    const snapshotUrl = dataUrlForPngFile(metadata.snapshot_path);
    out.push({
      timestamp: ts,
      metadata,
      context_preview: contextPreview,
      snapshot_url: snapshotUrl,
    });
  }
  return out;
}

export async function readSnapshot(
  timestamp: string,
): Promise<{ timestamp: string; snapshot_url: string }> {
  const dir = recordDir(timestamp);
  const png = join(dir, "snapshot.png");
  const fromDir = dataUrlForPngFile(png);
  if (fromDir) {
    return { timestamp, snapshot_url: fromDir };
  }
  const legacy = join(recordsRoot(), `${timestamp}.png`);
  const fromLegacy = dataUrlForPngFile(legacy);
  if (fromLegacy) {
    return { timestamp, snapshot_url: fromLegacy };
  }
  throw new Error("record not found");
}

export async function copyRecord(
  timestamp: string,
): Promise<{ timestamp: string; protocol_text: string; copied: boolean }> {
  const details = await readRecords([timestamp]);
  const detail = details[0];
  if (!detail) throw new Error("record not found");
  const protocolText = JSON.stringify(detail.metadata, null, 2);
  const { clipboard, nativeImage } = await import("electron");
  if (existsSync(detail.metadata.snapshot_path)) {
    try {
      clipboard.writeImage(
        nativeImage.createFromPath(detail.metadata.snapshot_path),
      );
      return { timestamp, protocol_text: protocolText, copied: true };
    } catch {
      /* fall through */
    }
  }
  clipboard.writeText(protocolText);
  return { timestamp, protocol_text: protocolText, copied: true };
}

export async function deleteRecord(timestamp: string): Promise<void> {
  const dir = recordDir(timestamp);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  const legacyJson = join(recordsRoot(), `${timestamp}.json`);
  if (existsSync(legacyJson)) rmSync(legacyJson);
  const legacyPng = join(recordsRoot(), `${timestamp}.png`);
  if (existsSync(legacyPng)) rmSync(legacyPng);
}

export async function triggerCapture(state: AppState): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error("AppShot capture is only supported on macOS");
  }
  mkdirSync(recordsRoot(), { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = recordDir(timestamp);
  mkdirSync(dir, { recursive: true });
  const png = join(dir, "snapshot.png");
  try {
    await execFileAsync("screencapture", ["-i", "-x", png]);
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(
      `screencapture failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!existsSync(png)) {
    rmSync(dir, { recursive: true, force: true });
    return;
  }
  const context = "Captured via Electron screencapture backend.\n";
  writeFileSync(join(dir, "context.txt"), context, "utf8");
  const metadata = buildMetadata(timestamp, dir, {
    title: "Screenshot",
    contextBytes: Buffer.byteLength(context),
  });
  writeFileSync(join(dir, "metadata.json"), JSON.stringify(metadata, null, 2));
  state.mainWindow?.webContents.send("atmos:desktop-event:appshot://preview", {
    preview_id: timestamp,
    app_name: "Atmos",
    window_title: "Screenshot",
    captured_at: metadata.captured_at,
    quality: "screenshot_only",
    screenshot_preview_base64: null,
    source_bounds: null,
    permissions: macosPermissions(),
    warnings: metadata.warnings,
    expires_in_ms: 60_000,
  });
}

export async function openPermissions(target: string): Promise<void> {
  if (process.platform !== "darwin") return;
  const urls: Record<string, string> = {
    screen_recording:
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    screen:
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    accessibility:
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    privacy_security:
      "x-apple.systempreferences:com.apple.preference.security?Privacy",
    all: "x-apple.systempreferences:com.apple.preference.security?Privacy",
  };
  const url = urls[target] ?? urls.all!;
  const { shell } = await import("electron");
  await shell.openExternal(url);
}

export async function acceptPending(
  previewId: string,
): Promise<{
  timestamp: string;
  record_dir: string;
  protocol_text: string;
  metadata: AppshotRecordDetail["metadata"];
}> {
  const details = await readRecords([previewId]);
  const detail = details[0];
  if (!detail) {
    // Capture may have written already
    const dir = recordDir(previewId);
    const meta = buildMetadata(previewId, dir);
    return {
      timestamp: previewId,
      record_dir: dir,
      protocol_text: JSON.stringify(meta, null, 2),
      metadata: meta,
    };
  }
  return {
    timestamp: previewId,
    record_dir: detail.metadata.record_dir,
    protocol_text: JSON.stringify(detail.metadata, null, 2),
    metadata: detail.metadata,
  };
}

export async function discardPending(previewId: string): Promise<void> {
  await deleteRecord(previewId);
}

export async function setPendingAutoAccept(_req: unknown): Promise<void> {
  /* no-op */
}

/** Test helpers */
export function appshotRecordsDirForTest(): string {
  return recordsRoot();
}

export function writeTestRecord(
  timestamp: string,
  title: string,
  opts: { withPng?: boolean } = {},
): void {
  const dir = recordDir(timestamp);
  mkdirSync(dir, { recursive: true });
  const context = `test ${title}\n`;
  writeFileSync(join(dir, "context.txt"), context, "utf8");
  const withPng = opts.withPng !== false;
  if (withPng) {
    writeFileSync(join(dir, "snapshot.png"), MINIMAL_PNG_BYTES);
  }
  const metadata = buildMetadata(timestamp, dir, {
    title,
    contextBytes: Buffer.byteLength(context),
  });
  metadata.screenshot.available = withPng;
  writeFileSync(join(dir, "metadata.json"), JSON.stringify(metadata, null, 2));
}
