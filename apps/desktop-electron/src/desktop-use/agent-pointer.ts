/**
 * Desktop Use agent pointer — synthetic cursor overlay.
 *
 * Shows where the agent is about to click/type without moving the user's
 * real mouse. Full virtual desktop, click-through, always-on-top panel.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  interpolatePoint,
  isValidScreenPoint,
  screenToOverlay,
  travelDurationMs,
  unionDisplayBounds,
  type Point,
} from "./agent-pointer-math.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBrowserWindow = any;

const PREFS_DIR = () => join(homedir(), ".atmos", "desktop-use");
const PREFS_FILE = () => join(PREFS_DIR(), "agent-pointer.json");

type PointerPrefs = {
  enabled: boolean;
};

const DEFAULT_PREFS: PointerPrefs = { enabled: true };

let overlay: AnyBrowserWindow | null = null;
let overlayReady: Promise<AnyBrowserWindow> | null = null;
let currentPos: Point = { x: 120, y: 120 };
let visible = false;
let animToken = 0;

function loadPrefs(): PointerPrefs {
  try {
    if (!existsSync(PREFS_FILE())) return { ...DEFAULT_PREFS };
    const raw = JSON.parse(readFileSync(PREFS_FILE(), "utf8")) as Partial<PointerPrefs>;
    return {
      enabled: raw.enabled !== false,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(prefs: PointerPrefs): void {
  try {
    mkdirSync(PREFS_DIR(), { recursive: true });
    writeFileSync(PREFS_FILE(), JSON.stringify(prefs, null, 2), "utf8");
  } catch {
    /* ignore */
  }
}

let prefs: PointerPrefs = loadPrefs();

export function isAgentPointerEnabled(): boolean {
  return prefs.enabled;
}

export function setAgentPointerEnabled(enabled: boolean): PointerPrefs {
  prefs = { enabled: Boolean(enabled) };
  savePrefs(prefs);
  if (!prefs.enabled) {
    void hideAgentPointer();
  }
  return prefs;
}

export function agentPointerStatus(): {
  enabled: boolean;
  visible: boolean;
  x: number;
  y: number;
} {
  return {
    enabled: prefs.enabled,
    visible,
    x: currentPos.x,
    y: currentPos.y,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function overlayHtml(): string {
  // Inline HTML: agent arrow cursor + label + click ripple + type chip
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent;
    font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;}
  #root{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;
    transform:translate3d(-100px,-100px,0); will-change:transform;}
  #cursor{position:relative;width:28px;height:28px;filter:drop-shadow(0 2px 6px rgba(0,0,0,.45));}
  #cursor svg{display:block;width:28px;height:28px;}
  #label{position:absolute;left:22px;top:18px;padding:2px 7px;border-radius:999px;
    background:rgba(99,102,241,.92);color:#fff;font-size:10px;font-weight:600;
    letter-spacing:.02em;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.3);}
  #ripple{position:absolute;left:4px;top:4px;width:16px;height:16px;border-radius:50%;
    border:2px solid rgba(129,140,248,.95);opacity:0;transform:scale(.4);
    pointer-events:none;}
  #ripple.pulse{animation:ripple .45s ease-out forwards;}
  @keyframes ripple{0%{opacity:.9;transform:scale(.4)}100%{opacity:0;transform:scale(2.6)}}
  #typechip{position:absolute;left:22px;top:-6px;max-width:220px;padding:3px 8px;
    border-radius:8px;background:rgba(15,23,42,.88);color:#e2e8f0;font-size:11px;
    opacity:0;transform:translateY(4px);transition:opacity .15s,transform .15s;
    box-shadow:0 4px 14px rgba(0,0,0,.35);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  #typechip.show{opacity:1;transform:translateY(0);}
  body.hidden #root{opacity:0;}
</style></head>
<body class="hidden">
<div id="root">
  <div id="ripple"></div>
  <div id="cursor">
    <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 3.5L4 22.5L10.2 16.8L14.8 25.5L17.6 24.1L12.9 15.2L21 15.2L4 3.5Z"
        fill="#818cf8" stroke="#312e81" stroke-width="1.2" stroke-linejoin="round"/>
    </svg>
  </div>
  <div id="label">Agent</div>
  <div id="typechip"></div>
</div>
<script>
  const root = document.getElementById('root');
  const ripple = document.getElementById('ripple');
  const typechip = document.getElementById('typechip');
  const label = document.getElementById('label');
  window.__agentPointer = {
    show(x, y, text) {
      document.body.classList.remove('hidden');
      root.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
      if (text) label.textContent = text;
    },
    move(x, y) {
      document.body.classList.remove('hidden');
      root.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    },
    click() {
      ripple.classList.remove('pulse');
      void ripple.offsetWidth;
      ripple.classList.add('pulse');
    },
    type(preview) {
      typechip.textContent = preview || 'Typing…';
      typechip.classList.add('show');
      clearTimeout(window.__typeHide);
      window.__typeHide = setTimeout(() => typechip.classList.remove('show'), 900);
    },
    hide() {
      document.body.classList.add('hidden');
      typechip.classList.remove('show');
    }
  };
</script>
</body></html>`;
}

async function virtualBounds(): Promise<{
  bounds: { x: number; y: number; width: number; height: number };
}> {
  const { screen } = await import("electron");
  const displays = screen.getAllDisplays().map((d) => ({
    x: d.bounds.x,
    y: d.bounds.y,
    width: d.bounds.width,
    height: d.bounds.height,
  }));
  return { bounds: unionDisplayBounds(displays) };
}

async function ensureOverlay(): Promise<AnyBrowserWindow> {
  if (overlay && !overlay.isDestroyed()) return overlay;
  if (overlayReady) return overlayReady;

  overlayReady = (async () => {
    const { BrowserWindow } = await import("electron");
    const { bounds } = await virtualBounds();
    const win = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      focusable: false,
      type: "panel",
      backgroundColor: "#00000000",
      paintWhenInitiallyHidden: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });

    win.setIgnoreMouseEvents(true, { forward: true });
    win.setAlwaysOnTop(true, "screen-saver");
    try {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } catch {
      /* older electron */
    }

    win.on("closed", () => {
      if (overlay === win) {
        overlay = null;
        overlayReady = null;
      }
    });

    await win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(overlayHtml())}`,
    );
    await sleep(20);
    if (win.isDestroyed()) throw new Error("agent pointer overlay destroyed");
    overlay = win;
    return win;
  })().catch((e) => {
    overlayReady = null;
    throw e;
  });

  return overlayReady;
}

async function syncOverlayBounds(win: AnyBrowserWindow): Promise<{
  bounds: { x: number; y: number; width: number; height: number };
}> {
  const { bounds } = await virtualBounds();
  try {
    win.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
  } catch {
    /* ignore */
  }
  return { bounds };
}

async function execInOverlay(
  win: AnyBrowserWindow,
  js: string,
): Promise<void> {
  if (win.isDestroyed()) return;
  try {
    await win.webContents.executeJavaScript(js, true);
  } catch {
    /* ignore */
  }
}

export async function showAgentPointer(
  x: number,
  y: number,
  label = "Agent",
): Promise<{ ok: boolean; reason?: string }> {
  if (!prefs.enabled) return { ok: false, reason: "disabled" };
  if (!isValidScreenPoint(x, y)) return { ok: false, reason: "invalid_point" };

  const win = await ensureOverlay();
  const { bounds } = await syncOverlayBounds(win);
  currentPos = { x, y };
  const local = screenToOverlay(currentPos, bounds);
  if (!win.isVisible()) win.showInactive();
  visible = true;
  const safeLabel = JSON.stringify(String(label).slice(0, 24));
  await execInOverlay(
    win,
    `window.__agentPointer.show(${local.x},${local.y},${safeLabel})`,
  );
  return { ok: true };
}

export async function moveAgentPointer(
  x: number,
  y: number,
  opts: { animate?: boolean } = {},
): Promise<{ ok: boolean; reason?: string }> {
  if (!prefs.enabled) return { ok: false, reason: "disabled" };
  if (!isValidScreenPoint(x, y)) return { ok: false, reason: "invalid_point" };

  const win = await ensureOverlay();
  const { bounds } = await syncOverlayBounds(win);
  if (!win.isVisible()) win.showInactive();
  visible = true;

  const to = { x, y };
  const animate = opts.animate !== false;
  if (!animate) {
    currentPos = to;
    const local = screenToOverlay(to, bounds);
    await execInOverlay(win, `window.__agentPointer.move(${local.x},${local.y})`);
    return { ok: true };
  }

  const from = { ...currentPos };
  const duration = travelDurationMs(from, to);
  const token = ++animToken;
  const steps = Math.max(8, Math.round(duration / 16));
  for (let i = 1; i <= steps; i++) {
    if (token !== animToken) return { ok: false, reason: "cancelled" };
    const t = i / steps;
    const p = interpolatePoint(from, to, t);
    currentPos = p;
    const local = screenToOverlay(p, bounds);
    await execInOverlay(win, `window.__agentPointer.move(${local.x},${local.y})`);
    await sleep(duration / steps);
  }
  return { ok: true };
}

export async function agentPointerClick(
  x?: number,
  y?: number,
): Promise<{ ok: boolean; reason?: string }> {
  if (!prefs.enabled) return { ok: false, reason: "disabled" };
  if (isValidScreenPoint(x, y)) {
    await moveAgentPointer(x, y, { animate: true });
  } else if (!visible) {
    await showAgentPointer(currentPos.x, currentPos.y);
  }
  const win = await ensureOverlay();
  if (!win.isVisible()) win.showInactive();
  await execInOverlay(win, `window.__agentPointer.click()`);
  await sleep(180);
  return { ok: true };
}

export async function agentPointerType(
  text: string,
  x?: number,
  y?: number,
): Promise<{ ok: boolean; reason?: string }> {
  if (!prefs.enabled) return { ok: false, reason: "disabled" };
  if (isValidScreenPoint(x, y)) {
    await moveAgentPointer(x, y, { animate: true });
  } else if (!visible) {
    await showAgentPointer(currentPos.x, currentPos.y);
  }
  const win = await ensureOverlay();
  const preview = JSON.stringify(String(text).slice(0, 48));
  await execInOverlay(win, `window.__agentPointer.type(${preview})`);
  return { ok: true };
}

export async function hideAgentPointer(): Promise<{ ok: boolean }> {
  animToken += 1;
  visible = false;
  if (overlay && !overlay.isDestroyed()) {
    await execInOverlay(overlay, `window.__agentPointer.hide()`);
    try {
      overlay.hide();
    } catch {
      /* ignore */
    }
  }
  return { ok: true };
}

/**
 * Full drive choreography: show pointer, travel, click/type pulse.
 * Does not perform OS input — pair with control engine separately.
 */
export async function playAgentPointerAction(action: {
  kind: "click" | "type" | "move" | "show" | "hide";
  x?: number;
  y?: number;
  text?: string;
}): Promise<{ ok: boolean; reason?: string }> {
  switch (action.kind) {
    case "hide":
      return hideAgentPointer();
    case "show":
      return showAgentPointer(action.x ?? currentPos.x, action.y ?? currentPos.y);
    case "move":
      return moveAgentPointer(action.x ?? currentPos.x, action.y ?? currentPos.y);
    case "click":
      return agentPointerClick(action.x, action.y);
    case "type":
      return agentPointerType(action.text ?? "", action.x, action.y);
    default:
      return { ok: false, reason: "unknown_action" };
  }
}
