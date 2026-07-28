/**
 * AppShot for Electron — production contracts match Tauri APP-021:
 *   ~/.atmos/appshots/records/<13-digit-ts>/{snapshot.png,context.md,metadata.json}
 *   protocol: atmos://appshots/{ts}
 *   pending preview + auto-accept hold/resume
 *   non-interactive frontmost-window capture
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import type { AppState } from "../app-state.js";
import { APP_PRODUCT_NAME } from "../branding-paths.js";
import {
  playCaptureAnimation,
  shouldPlayCaptureAnimation,
  type CaptureAnimationBounds,
} from "./capture-animation.js";
import {
  captureFrontmostWindow,
  readFrontmostWindow,
} from "./frontmost.js";
import { mainLog } from "../main-log.js";
import {
  CONTEXT_FILE,
  METADATA_FILE,
  recordDir as recordDirPath,
  recordsRoot,
  SNAPSHOT_FILE,
  tmpRoot,
} from "./paths.js";
import {
  globalPendingStore,
  type PendingCapture,
  PREVIEW_EXPIRES_IN_MS,
} from "./pending.js";
import {
  allocateTimestamp,
  formatProtocolPrompt,
  isValidTimestamp,
} from "./protocol.js";
import {
  buildInlineSnapshotDataUrl,
  buildScreenshotPreviewBase64,
} from "./thumbnail.js";

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
    /** Present on Electron for diagnostics: event-tap | none */
    backend?: string | null;
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
  metadata: AppshotRecordMetadata;
  context_preview: string;
  snapshot_url: string | null;
};

export type AppshotRecordMetadata = {
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

/**
 * Build permission DTOs from real (or injected) grant flags.
 * Shape matches Tauri: recovery_action is null once granted.
 */
export function buildMacosPermissions(flags: {
  accessibility: boolean;
  screenRecording: boolean;
  productName?: string;
}): AppshotPermissionState[] {
  const product = flags.productName ?? APP_PRODUCT_NAME;
  return [
    permissionState({
      name: "accessibility",
      display_name: "Accessibility",
      granted: flags.accessibility,
      required_for: ["accessibility_tree", "global_trigger"],
      target: "accessibility",
      manual_steps: [
        "System Settings → Privacy & Security → Accessibility",
        `Enable ${product}, then return here and Refresh (restart the app if it stays off)`,
      ],
    }),
    permissionState({
      name: "screen_recording",
      display_name: "Screen Recording",
      granted: flags.screenRecording,
      required_for: ["screenshot"],
      target: "screen_recording",
      manual_steps: [
        "System Settings → Privacy & Security → Screen & System Audio Recording",
        `Enable ${product}, then return here and Refresh (restart the app if it stays off)`,
      ],
    }),
  ];
}

function permissionState(opts: {
  name: AppshotPermissionState["name"];
  display_name: string;
  granted: boolean;
  required_for: string[];
  target: NonNullable<AppshotPermissionState["recovery_action"]>["target"];
  manual_steps: string[];
}): AppshotPermissionState {
  return {
    name: opts.name,
    display_name: opts.display_name,
    granted: opts.granted,
    required_for: opts.required_for,
    recovery_action: opts.granted
      ? null
      : {
          label: "Grant",
          target: opts.target,
          manual_steps: opts.manual_steps,
        },
  };
}

/**
 * Query live macOS TCC state via Electron systemPreferences.
 * Outside the Electron main process (e.g. bun unit tests) both return false.
 */
export async function queryMacosPermissionFlags(): Promise<{
  accessibility: boolean;
  screenRecording: boolean;
}> {
  if (process.platform !== "darwin") {
    return { accessibility: false, screenRecording: false };
  }
  try {
    const { systemPreferences } = await import("electron");
    const accessibility = systemPreferences.isTrustedAccessibilityClient(false);
    const screenStatus = systemPreferences.getMediaAccessStatus("screen");
    return {
      accessibility: Boolean(accessibility),
      screenRecording: screenStatus === "granted",
    };
  } catch {
    return { accessibility: false, screenRecording: false };
  }
}

async function macosPermissions(): Promise<AppshotPermissionState[]> {
  const flags = await queryMacosPermissionFlags();
  return buildMacosPermissions(flags);
}

/**
 * Report live status and (re)arm the dual-shift listener when Accessibility is on.
 */
export async function appshotStatus(state?: AppState): Promise<AppshotStatus> {
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

  const flags = await queryMacosPermissionFlags();
  const permissions = buildMacosPermissions(flags);

  let triggerEnabled = false;
  let triggerLastError: string | null = null;
  if (state) {
    const { ensureTriggerListener, triggerListenerStatus } = await import(
      "./trigger.js"
    );
    // In-process CGEventTap FlagsChanged (Tauri parity). Always (re)arm so a
    // false TCC reading cannot leave the shortcut dead.
    await ensureTriggerListener(state, triggerCapture, flags.accessibility);
    const listener = triggerListenerStatus();
    triggerEnabled = listener.enabled || listener.starting;
    triggerLastError = listener.lastError;
  }

  const backend =
    state != null
      ? (await import("./trigger.js")).triggerListenerStatus().mode
      : null;

  return {
    supported: true,
    platform: "macos",
    reason: null,
    trigger: {
      mode: "macos_modifier_gesture",
      enabled: triggerEnabled,
      required_modifiers: ["left_shift", "right_shift"],
      last_error: triggerLastError,
      backend,
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
    if (!isValidTimestamp(name)) continue;
    const dir = join(root, name);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    items.push({ timestamp: name, record_dir: dir });
  }
  items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return items;
}

function buildMetadataFromCapture(
  timestamp: string,
  dir: string,
  capture: PendingCapture,
): AppshotRecordMetadata {
  const snapshotPath = join(dir, SNAPSHOT_FILE);
  const contextPath = join(dir, CONTEXT_FILE);
  const metadataPath = join(dir, METADATA_FILE);
  const available =
    capture.screenshotPng != null && capture.screenshotPng.length > 0;
  return {
    timestamp,
    captured_at: capture.capturedAt,
    platform: capture.platform,
    app_name: capture.appName,
    bundle_id: capture.bundleId,
    process_id: capture.processId,
    window_title: capture.windowTitle,
    window_id: capture.windowId,
    quality: capture.quality,
    record_dir: dir,
    snapshot_path: snapshotPath,
    context_path: contextPath,
    metadata_path: metadataPath,
    screenshot: {
      available,
      width: capture.sourceBounds?.width ?? null,
      height: capture.sourceBounds?.height ?? null,
      media_type: "image/png",
    },
    warnings: capture.warnings,
    context_bytes: Buffer.byteLength(capture.contextMarkdown),
  };
}

export function writeRecordFromCapture(capture: PendingCapture): {
  timestamp: string;
  record_dir: string;
  protocol_text: string;
  metadata: AppshotRecordMetadata;
} {
  const root = recordsRoot();
  const tmp = tmpRoot();
  mkdirSync(root, { recursive: true });
  mkdirSync(tmp, { recursive: true });
  const timestamp = allocateTimestamp(root, existsSync, Date.now(), join);
  const tmpDir = join(tmp, timestamp);
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  const png = capture.screenshotPng ?? MINIMAL_PNG_BYTES;
  writeFileSync(join(tmpDir, SNAPSHOT_FILE), png);
  writeFileSync(join(tmpDir, CONTEXT_FILE), capture.contextMarkdown, "utf8");

  const finalDir = join(root, timestamp);
  const metadata = buildMetadataFromCapture(timestamp, finalDir, capture);
  writeFileSync(
    join(tmpDir, METADATA_FILE),
    JSON.stringify(metadata, null, 2),
    "utf8",
  );

  if (existsSync(finalDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw new Error(`appshot record already exists: ${timestamp}`);
  }
  renameSync(tmpDir, finalDir);
  const protocol_text = formatProtocolPrompt(timestamp);
  return { timestamp, record_dir: finalDir, protocol_text, metadata };
}

export async function readRecords(
  timestamps: string[],
): Promise<AppshotRecordDetail[]> {
  const out: AppshotRecordDetail[] = [];
  for (const ts of timestamps) {
    if (!isValidTimestamp(ts)) continue;
    const dir = recordDirPath(ts);
    const metaPath = join(dir, METADATA_FILE);
    if (!existsSync(metaPath)) continue;
    let metadata: AppshotRecordMetadata;
    try {
      metadata = JSON.parse(
        readFileSync(metaPath, "utf8"),
      ) as AppshotRecordMetadata;
    } catch {
      continue;
    }
    let contextPreview = "";
    try {
      const ctxPath = metadata.context_path || join(dir, CONTEXT_FILE);
      if (existsSync(ctxPath)) {
        contextPreview = readFileSync(ctxPath, "utf8").slice(0, 2000);
      }
    } catch {
      /* ignore */
    }
    const snapPath = metadata.snapshot_path || join(dir, SNAPSHOT_FILE);
    // History rows only need a small thumb — full Retina PNG gets stripped by web guards.
    const snapshotUrl = await buildInlineSnapshotDataUrl(snapPath);
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
  if (!isValidTimestamp(timestamp)) throw new Error("invalid appshot timestamp");
  const png = join(recordDirPath(timestamp), SNAPSHOT_FILE);
  const fromDir = dataUrlForPngFile(png);
  if (fromDir) return { timestamp, snapshot_url: fromDir };
  throw new Error("record not found");
}

export async function copyRecord(
  timestamp: string,
): Promise<{ timestamp: string; protocol_text: string; copied: boolean }> {
  if (!isValidTimestamp(timestamp)) throw new Error("invalid appshot timestamp");
  const dir = recordDirPath(timestamp);
  if (!existsSync(dir)) throw new Error("record not found");
  const protocolText = formatProtocolPrompt(timestamp);
  const { clipboard } = await import("electron");
  clipboard.writeText(protocolText);
  return { timestamp, protocol_text: protocolText, copied: true };
}

export async function deleteRecord(timestamp: string): Promise<void> {
  if (!isValidTimestamp(timestamp)) return;
  const dir = recordDirPath(timestamp);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}



export async function triggerCapture(state: AppState): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error("AppShot capture is only supported on macOS");
  }

  // Play border/flash on the *current* frontmost window before screenshot so
  // snapshot.png does not include the affordance (Tauri APP-021 parity).
  // Do not activate Atmos until after capture completes.
  const permissions = await macosPermissions();
  await playCaptureAnimationIfPossible();

  const result = await captureFrontmostWindow();
  const pngBytes = result.png?.length ?? 0;
  mainLog(
    `[appshot-capture] frontmost="${result.frontmost.appName}" title=${JSON.stringify(result.frontmost.windowTitle)} png=${pngBytes} quality=${result.quality} warnings=${result.warnings.join(" | ") || "none"}`,
  );

  const capturedAt = new Date().toISOString();
  const previewId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Retina full-window PNGs often exceed the web inline budget (~512KB data URL).
  // Always build a bounded thumbnail for the pending popover (Tauri parity).
  const screenshotPreviewBase64 = await buildScreenshotPreviewBase64(result.png);
  if (result.png && result.png.length > 0 && !screenshotPreviewBase64) {
    result.warnings.push(
      "Screenshot preview was hidden because the inline image payload is too large.",
    );
  }
  const capture: PendingCapture = {
    previewId,
    appName: result.frontmost.appName,
    windowTitle: result.frontmost.windowTitle,
    capturedAt,
    quality: result.quality,
    screenshotPng: result.png,
    screenshotPreviewBase64,
    contextMarkdown: result.contextMarkdown,
    sourceBounds:
      result.frontmost.x != null &&
      result.frontmost.y != null &&
      result.frontmost.width != null &&
      result.frontmost.height != null
        ? {
            x: result.frontmost.x,
            y: result.frontmost.y,
            width: result.frontmost.width,
            height: result.frontmost.height,
          }
        : null,
    permissions,
    warnings: result.warnings,
    bundleId: result.frontmost.bundleId,
    processId: result.frontmost.processId,
    windowId: result.frontmost.windowId,
    platform: "macos",
  };

  const { expiresInMs } = globalPendingStore.insert(capture);

  // Bring Atmos to front for the preview sheet (steal focus from the captured app).
  const { app } = await import("electron");
  try {
    if (process.platform === "darwin") {
      app.focus({ steal: true });
      app.dock?.show();
    }
  } catch {
    /* ignore */
  }
  if (!state.mainWindow || state.mainWindow.isDestroyed()) {
    mainLog(
      "[appshot-capture] mainWindow missing — preview event has no target",
      "error",
    );
  } else {
    if (state.mainWindow.isMinimized()) state.mainWindow.restore();
    state.mainWindow.show();
    state.mainWindow.moveTop();
    state.mainWindow.focus();
  }

  state.mainWindow?.webContents.send("atmos:desktop-event:appshot://preview", {
    preview_id: previewId,
    app_name: capture.appName,
    window_title: capture.windowTitle ?? "Untitled window",
    captured_at: capturedAt,
    quality: capture.quality,
    screenshot_preview_base64: capture.screenshotPreviewBase64,
    source_bounds: capture.sourceBounds,
    permissions,
    warnings: capture.warnings,
    expires_in_ms: expiresInMs || PREVIEW_EXPIRES_IN_MS,
  });
  mainLog(
    `[appshot-capture] preview sent id=${previewId} app=${capture.appName} bounds=${
      capture.sourceBounds
        ? `${capture.sourceBounds.x},${capture.sourceBounds.y} ${capture.sourceBounds.width}x${capture.sourceBounds.height}`
        : "none"
    }`,
  );

  if (expiresInMs > 0) {
    spawnAutoAccept(state, previewId);
  }
}

async function playCaptureAnimationIfPossible(): Promise<void> {
  try {
    const frontmost = await readFrontmostWindow();
    const bounds: CaptureAnimationBounds | null =
      frontmost.x != null &&
      frontmost.y != null &&
      frontmost.width != null &&
      frontmost.height != null
        ? {
            x: frontmost.x,
            y: frontmost.y,
            width: frontmost.width,
            height: frontmost.height,
          }
        : null;
    if (
      !shouldPlayCaptureAnimation({
        appName: frontmost.appName,
        bounds,
      }) ||
      !bounds
    ) {
      mainLog(
        `[appshot-capture] skip animation app=${frontmost.appName} bounds=${bounds ? `${bounds.width}x${bounds.height}` : "none"}`,
      );
      return;
    }
    await playCaptureAnimation(bounds);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    mainLog(`[appshot-capture] animation preflight failed: ${msg}`, "error");
  }
}

function spawnAutoAccept(state: AppState, previewId: string): void {
  const tick = async () => {
    for (;;) {
      const st = globalPendingStore.autoAcceptState(previewId);
      if (st.kind === "missing") return;
      if (st.kind === "held") {
        await sleep(250);
        continue;
      }
      if (st.kind === "wait") {
        await sleep(Math.min(st.delayMs, 500));
        continue;
      }
      // ready
      try {
        await acceptPending(previewId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.toLowerCase().includes("no longer pending")) {
          console.error("[desktop-electron] appshot auto-accept failed:", msg);
          state.mainWindow?.webContents.send(
            "atmos:desktop-event:appshot://error",
            msg,
          );
        }
      }
      return;
    }
  };
  void tick();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

export async function acceptPending(previewId: string): Promise<{
  timestamp: string;
  record_dir: string;
  protocol_text: string;
  metadata: AppshotRecordMetadata;
}> {
  const entry = globalPendingStore.take(previewId);
  if (!entry) {
    // Already saved path: try treat previewId as timestamp if valid
    if (isValidTimestamp(previewId)) {
      const details = await readRecords([previewId]);
      const d = details[0];
      if (d) {
        const protocol_text = formatProtocolPrompt(previewId);
        try {
          const { clipboard } = await import("electron");
          clipboard.writeText(protocol_text);
        } catch {
          /* tests */
        }
        return {
          timestamp: previewId,
          record_dir: d.metadata.record_dir,
          protocol_text,
          metadata: d.metadata,
        };
      }
    }
    throw new Error("appshot preview is no longer pending");
  }

  if (entry.savedTimestamp) {
    const protocol_text = formatProtocolPrompt(entry.savedTimestamp);
    try {
      const { clipboard } = await import("electron");
      clipboard.writeText(protocol_text);
    } catch {
      /* tests */
    }
    const details = await readRecords([entry.savedTimestamp]);
    const d = details[0];
    if (!d) throw new Error("appshot record not found after save");
    return {
      timestamp: entry.savedTimestamp,
      record_dir: d.metadata.record_dir,
      protocol_text,
      metadata: d.metadata,
    };
  }

  try {
    const written = writeRecordFromCapture(entry.capture);
    try {
      const { clipboard } = await import("electron");
      clipboard.writeText(written.protocol_text);
    } catch {
      /* unit tests without electron */
    }
    return written;
  } catch (e) {
    globalPendingStore.restore(previewId, entry);
    throw e;
  }
}

export async function discardPending(previewId: string): Promise<void> {
  const entry = globalPendingStore.take(previewId);
  if (entry?.savedTimestamp) {
    await deleteRecord(entry.savedTimestamp);
  }
}

export async function setPendingAutoAccept(req: unknown): Promise<void> {
  const r = (req ?? {}) as {
    preview_id?: string;
    previewId?: string;
    held?: boolean;
    resume_in_ms?: number;
    resumeInMs?: number;
  };
  const previewId = String(r.preview_id ?? r.previewId ?? "");
  if (!previewId) return;
  globalPendingStore.setAutoAcceptHold(
    previewId,
    Boolean(r.held),
    r.resume_in_ms ?? r.resumeInMs ?? null,
  );
}

/** Test helpers */
export function appshotRecordsDirForTest(): string {
  return recordsRoot();
}

export function writeTestRecord(
  timestamp: string,
  title: string,
  opts: { withPng?: boolean; appName?: string } = {},
): void {
  if (!isValidTimestamp(timestamp)) {
    // Allow tests that still use old ids by writing only when valid
    throw new Error(
      `writeTestRecord requires 13-digit timestamp, got ${timestamp}`,
    );
  }
  const appName = opts.appName ?? "TestApp";
  const capture: PendingCapture = {
    previewId: `test-${timestamp}`,
    appName,
    windowTitle: title,
    capturedAt: new Date().toISOString(),
    quality: "screenshot_only",
    screenshotPng: opts.withPng === false ? null : MINIMAL_PNG_BYTES,
    screenshotPreviewBase64: null,
    contextMarkdown: `# Appshot Context\n\n- App: ${appName}\n- Window: ${title}\n`,
    sourceBounds: null,
    permissions: [],
    warnings: [],
    bundleId: null,
    processId: null,
    windowId: null,
    platform: "macos",
  };
  // Force timestamp by writing directly
  const root = recordsRoot();
  mkdirSync(root, { recursive: true });
  const dir = join(root, timestamp);
  mkdirSync(dir, { recursive: true });
  if (opts.withPng !== false) {
    writeFileSync(join(dir, SNAPSHOT_FILE), MINIMAL_PNG_BYTES);
  }
  writeFileSync(join(dir, CONTEXT_FILE), capture.contextMarkdown, "utf8");
  const metadata = buildMetadataFromCapture(timestamp, dir, capture);
  writeFileSync(
    join(dir, METADATA_FILE),
    JSON.stringify(metadata, null, 2),
    "utf8",
  );
}

// Re-export path helpers for tests
export {
  recordsRoot as appshotRecordsRoot,
  appshotsRoot,
  setTestAppshotsRoot,
} from "./paths.js";
export {
  formatProtocolPrompt,
  isValidTimestamp,
  allocateTimestamp,
} from "./protocol.js";
export { globalPendingStore, PendingStore } from "./pending.js";
