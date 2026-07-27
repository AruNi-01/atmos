import { BrowserWindow } from "electron";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppState } from "../app-state.js";
import { appWindowBranding } from "../branding.js";
import { uiBaseUrl } from "./main-window.js";
import { macWindowChromeOptions } from "./mac-chrome.js";
import { wireFullscreenEvents } from "./fullscreen.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const secondaryWindows = new Map<string, BrowserWindow>();

function appPreload(): string {
  const candidates = [
    join(__dirname, "preload.js"),
    resolve(process.cwd(), "dist/preload.js"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0]!;
}

function openOrFocus(
  label: string,
  urlPath: string,
  opts: {
    title: string;
    width: number;
    height: number;
    minW: number;
    minH: number;
    chrome?: "primary" | "compact";
  },
  state: AppState,
): void {
  const base = uiBaseUrl(state);
  const url = new URL(urlPath, base.endsWith("/") ? base : `${base}/`);

  const existing = secondaryWindows.get(label);
  if (existing && !existing.isDestroyed()) {
    void existing.loadURL(url.toString());
    existing.show();
    existing.focus();
    return;
  }

  const win = new BrowserWindow({
    width: opts.width,
    height: opts.height,
    minWidth: opts.minW,
    minHeight: opts.minH,
    show: false,
    ...appWindowBranding(opts.title),
    ...macWindowChromeOptions(opts.chrome ?? "primary"),
    backgroundColor: "#06070b",
    webPreferences: {
      preload: appPreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  wireFullscreenEvents(win);
  secondaryWindows.set(label, win);
  win.on("closed", () => {
    secondaryWindows.delete(label);
  });

  void win.loadURL(url.toString()).then(() => {
    win.center();
    win.show();
    win.focus();
  });
}

function trimQuery(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t.length ? t : undefined;
}

export function openAgentChatWindow(
  state: AppState,
  args: Record<string, unknown>,
): void {
  const q = new URLSearchParams();
  const agent = trimQuery(args.agent);
  const session = trimQuery(args.session);
  const sessionCwd = trimQuery(args.session_cwd ?? args.sessionCwd);
  const workspaceId = trimQuery(args.workspace_id ?? args.workspaceId);
  const projectId = trimQuery(args.project_id ?? args.projectId);
  const handoffToken = trimQuery(args.handoff_token ?? args.handoffToken);
  if (agent) q.set("agent", agent);
  if (session) q.set("session", session);
  if (sessionCwd) q.set("sessionCwd", sessionCwd);
  if (workspaceId) q.set("workspaceId", workspaceId);
  if (projectId) q.set("projectId", projectId);
  if (handoffToken) q.set("handoffToken", handoffToken);
  const qs = q.toString();
  openOrFocus(
    "agent-chat",
    `agent-chat/${qs ? `?${qs}` : ""}`,
    {
      title: "Atmos Electron Chat",
      width: 1180,
      height: 820,
      minW: 720,
      minH: 520,
      chrome: "primary",
    },
    state,
  );
}

export function previewBrowserWindowLabel(
  browserContextId: string | undefined,
): string {
  const raw = browserContextId?.trim();
  if (!raw) return "preview-browser";
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
  return `preview-browser-${safe}`;
}

export function openPreviewBrowserWindow(
  state: AppState,
  args: Record<string, unknown>,
): void {
  const q = new URLSearchParams();
  const url = trimQuery(args.url);
  const workspaceId = trimQuery(args.workspace_id ?? args.workspaceId);
  const projectId = trimQuery(args.project_id ?? args.projectId);
  const browserContextId = trimQuery(
    args.browser_context_id ?? args.browserContextId,
  );
  if (url) q.set("url", url);
  if (workspaceId) q.set("workspaceId", workspaceId);
  if (projectId) q.set("projectId", projectId);
  if (browserContextId) q.set("browserContextId", browserContextId);
  const qs = q.toString();
  const label = previewBrowserWindowLabel(browserContextId);
  openOrFocus(
    label,
    `preview/${qs ? `?${qs}` : ""}`,
    {
      title: "Atmos Electron Browser",
      width: 1280,
      height: 860,
      minW: 760,
      minH: 520,
      chrome: "primary",
    },
    state,
  );
}

export function openAppshotPermissionsWindow(
  state: AppState,
  args: Record<string, unknown>,
): void {
  const locale = trimQuery(args.locale) ?? "en";
  openOrFocus(
    "appshot-permissions",
    `appshot-permissions/?locale=${encodeURIComponent(locale)}`,
    {
      title: "Atmos Electron AppShot Permissions",
      width: 560,
      height: 640,
      minW: 420,
      minH: 480,
      chrome: "compact",
    },
    state,
  );
}
