/**
 * Accessibility grant overlay (desktop shell).
 *
 * Opens after System Settings → Accessibility. Primary action is enable the
 * host toggle when the app is already listed; optional drag adds the host
 * `.app` when it is missing from the list.
 *
 * Drag uses Electron `webContents.startDrag` from a **dragstart** handler
 * (mousedown + async IPC does not start a macOS file drag).
 */

import { BrowserWindow, ipcMain, nativeImage, screen } from "electron";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type GrantOverlayOptions = {
  hostAppPath: string;
  hostAppName?: string;
  /** BCP-47-ish language tag; used for in-panel copy. */
  locale?: string;
};

type GrantState = {
  hostAppPath: string;
  hostAppName: string;
  title: string;
  secondary: string;
  chipLabel: string;
};

let grantWindow: BrowserWindow | null = null;
let grantState: GrantState | null = null;
let ipcWired = false;

function grantPreloadPath(): string {
  const besideMain = join(
    dirname(fileURLToPath(import.meta.url)),
    "grant-preload.cjs",
  );
  if (existsSync(besideMain)) return besideMain;
  return join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "dist",
    "grant-preload.cjs",
  );
}

function isZh(locale: string | undefined): boolean {
  return (locale ?? "").toLowerCase().startsWith("zh");
}

function buildCopy(
  hostAppName: string,
  locale?: string,
): Pick<GrantState, "title" | "secondary" | "chipLabel"> {
  if (isZh(locale)) {
    return {
      title: `在列表中找到「${hostAppName}」并打开右侧开关`,
      secondary: "列表里没有？按住下方芯片拖入列表添加",
      chipLabel: hostAppName,
    };
  }
  return {
    title: `Find “${hostAppName}” in the list and turn the toggle on`,
    secondary: "Not listed? Drag the chip below into the list to add it",
    chipLabel: hostAppName,
  };
}

function resolveDragIcon(hostAppPath: string): Electron.NativeImage {
  const candidates = [
    join(hostAppPath, "Contents", "Resources", "AppIcon.icns"),
    join(hostAppPath, "Contents", "Resources", "icon.icns"),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) {
      return img.resize({ width: 32, height: 32 });
    }
  }
  // Minimal non-empty 32×32 blue PNG (required on some platforms).
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAaElEQVRYR+2WMQ4AIAgD7f8f" +
      "zcbBxMHB2kBJuAZSWigAZgYz8z0zO+8dERExM7M+gPkA5gOYD2A+gPkA5gOYD2A+gPkA5gOY" +
      "D2A+gPkA5gOYD2A+gPkA5gOYD2A+gPkA5gOYD2A+gPkA5gOYD/gA1dYBvQ1vS5QAAAAASUVO" +
      "RK5CYII=",
    "base64",
  );
  const fallback = nativeImage.createFromBuffer(png);
  return fallback.isEmpty() ? nativeImage.createEmpty() : fallback;
}

function panelHtml(state: GrantState, locale?: string): string {
  const title = escapeHtml(state.title);
  const secondary = escapeHtml(state.secondary);
  const chip = escapeHtml(state.chipLabel);
  const closeLabel = isZh(locale) ? "关闭" : "Close";
  return `<!DOCTYPE html>
<html lang="${isZh(locale) ? "zh" : "en"}">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" />
  <title>Desktop Use permissions</title>
  <style>
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%;
      overflow: hidden; background: transparent;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      user-select: none; -webkit-user-select: none;
    }
    .shell {
      box-sizing: border-box;
      margin: 8px;
      height: calc(100% - 16px);
      padding: 14px 14px 12px 16px;
      border-radius: 16px;
      background: rgba(22, 22, 24, 0.96);
      border: 1px solid rgba(255,255,255,0.12);
      box-shadow: 0 12px 40px rgba(0,0,0,0.45);
      color: #f2f2f2;
      display: flex;
      flex-direction: column;
      gap: 10px;
      -webkit-app-region: drag;
    }
    .row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .title {
      flex: 1;
      font-size: 13px;
      line-height: 1.4;
      font-weight: 500;
      color: rgba(255,255,255,0.92);
    }
    .secondary {
      font-size: 11.5px;
      line-height: 1.35;
      color: rgba(255,255,255,0.52);
      -webkit-app-region: no-drag;
    }
    .close {
      -webkit-app-region: no-drag;
      border: 0; background: transparent;
      color: rgba(255,255,255,0.55);
      font-size: 14px; cursor: pointer;
      width: 24px; height: 24px; border-radius: 6px; line-height: 1;
    }
    .close:hover { background: rgba(255,255,255,0.08); color: #fff; }
    .chip {
      -webkit-app-region: no-drag;
      display: flex;
      align-items: center;
      gap: 10px;
      height: 48px;
      padding: 0 14px;
      border-radius: 12px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.14);
      cursor: grab;
    }
    .chip:active { cursor: grabbing; background: rgba(255,255,255,0.12); }
    .icon {
      width: 28px; height: 28px; border-radius: 7px;
      background: linear-gradient(145deg, #3b82f6, #1d4ed8);
      flex-shrink: 0;
    }
    .name {
      font-size: 14px; font-weight: 500;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="row">
      <div class="title">${title}</div>
      <button class="close" type="button" title="${closeLabel}" id="close">✕</button>
    </div>
    <div class="secondary">${secondary}</div>
    <div class="chip" id="chip" draggable="true" title="${chip}">
      <div class="icon"></div>
      <div class="name">${chip}</div>
    </div>
  </div>
  <script>
    const chip = document.getElementById('chip');
    const close = document.getElementById('close');
    // Electron file drag: must use dragstart (not mousedown) and call startDrag
    // before the handler returns — preload uses sendSync.
    chip.addEventListener('dragstart', (e) => {
      e.preventDefault();
      window.atmosGrant?.startDrag();
    });
    close.addEventListener('click', () => window.atmosGrant?.close());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') window.atmosGrant?.close();
    });
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wireIpcOnce(): void {
  if (ipcWired) return;
  ipcWired = true;

  // sendSync so startDrag runs inside the dragstart stack (required on macOS).
  ipcMain.on("desktop-use-grant-drag-start", (event) => {
    const path = grantState?.hostAppPath;
    if (!path || !existsSync(path)) {
      event.returnValue = { ok: false, error: "missing_host" };
      return;
    }
    try {
      const icon = resolveDragIcon(path);
      event.sender.startDrag({
        file: path,
        icon,
      });
      event.returnValue = { ok: true };
    } catch (err) {
      console.warn("[desktop-use] startDrag failed", err);
      event.returnValue = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.on("desktop-use-grant-close", () => {
    closeAccessibilityGrantOverlay();
  });
}

function positionBottomCenter(win: BrowserWindow): void {
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh, x: sx, y: sy } = display.workArea;
  const size = win.getSize();
  const ww = size[0] ?? 400;
  const wh = size[1] ?? 150;
  const x = Math.round(sx + (sw - ww) / 2);
  const y = Math.round(sy + sh - wh - 36);
  win.setPosition(x, y);
}

/** Show (or focus) the Accessibility grant panel for the host app. */
export function showAccessibilityGrantOverlay(
  opts: GrantOverlayOptions,
): { ok: boolean; error?: string } {
  if (process.platform !== "darwin") {
    return { ok: false, error: "Grant overlay is only supported on macOS" };
  }
  if (!opts.hostAppPath || !existsSync(opts.hostAppPath)) {
    return {
      ok: false,
      error: "Host app path missing; install the control engine first",
    };
  }

  wireIpcOnce();

  const hostAppName =
    opts.hostAppName?.trim() ||
    opts.hostAppPath.split("/").pop()?.replace(/\.app$/i, "") ||
    "Atmos Desktop Use";
  const copy = buildCopy(hostAppName, opts.locale);
  grantState = {
    hostAppPath: opts.hostAppPath,
    hostAppName,
    ...copy,
  };

  if (grantWindow && !grantWindow.isDestroyed()) {
    void grantWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(panelHtml(grantState, opts.locale))}`,
    );
    positionBottomCenter(grantWindow);
    grantWindow.showInactive();
    return { ok: true };
  }

  const preload = grantPreloadPath();
  // Prefer a normal always-on-top window over type:"panel" — panel windows
  // often break HTML5/Electron file drag on macOS.
  const win = new BrowserWindow({
    width: 400,
    height: 150,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    focusable: true,
    webPreferences: {
      preload: existsSync(preload) ? preload : undefined,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  grantWindow = win;
  win.on("closed", () => {
    if (grantWindow === win) grantWindow = null;
  });

  void win
    .loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(panelHtml(grantState, opts.locale))}`,
    )
    .then(() => {
      positionBottomCenter(win);
      win.showInactive();
    });

  return { ok: true };
}

export function closeAccessibilityGrantOverlay(): void {
  if (grantWindow && !grantWindow.isDestroyed()) {
    grantWindow.close();
  }
  grantWindow = null;
}
