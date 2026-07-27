/**
 * Persist "what should the window close button do?" for Electron dogfood.
 * Stored under userData so it survives restarts without touching product UI.
 */

import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** ask = show dialog; hide = keep process, hide/minimize window; quit = full exit */
export type CloseAction = "ask" | "hide" | "quit";

type ClosePrefsFile = {
  /** Preferred close-button action. Default ask. */
  onClose?: CloseAction;
};

const FILE_NAME = "close-behavior.json";

function prefsPath(): string {
  return join(app.getPath("userData"), FILE_NAME);
}

export function readCloseAction(): CloseAction {
  try {
    const p = prefsPath();
    if (!existsSync(p)) return "ask";
    const raw = JSON.parse(readFileSync(p, "utf8")) as ClosePrefsFile;
    if (raw.onClose === "hide" || raw.onClose === "quit" || raw.onClose === "ask") {
      return raw.onClose;
    }
  } catch {
    /* ignore corrupt prefs */
  }
  return "ask";
}

export function writeCloseAction(action: CloseAction): void {
  const p = prefsPath();
  mkdirSync(dirname(p), { recursive: true });
  const body: ClosePrefsFile = { onClose: action };
  writeFileSync(p, `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

export function closeDialogCopy(locale: string): {
  title: string;
  message: string;
  detail: string;
  keepRunning: string;
  quit: string;
  cancel: string;
  dontAsk: string;
} {
  const zh = locale.toLowerCase().startsWith("zh");
  if (zh) {
    return {
      title: "关闭 Atmos Electron",
      message: "关闭窗口时要怎么做？",
      detail:
        "• 继续在后台运行：窗口会隐藏，应用仍留在 Dock 中；再次点击图标可立刻恢复，不会重新加载。\n" +
        "• 退出应用：完全退出 Atmos Electron，并停止隧道等后台服务。",
      keepRunning: "继续在后台运行",
      quit: "退出应用",
      cancel: "取消",
      dontAsk: "下次不再询问",
    };
  }
  return {
    title: "Close Atmos Electron",
    message: "What should happen when you close the window?",
    detail:
      "• Keep running: hides the window; the app stays in the Dock/taskbar and reopens instantly without reloading.\n" +
      "• Quit: fully exits Atmos Electron and stops background services (tunnels, etc.).",
    keepRunning: "Keep running",
    quit: "Quit",
    cancel: "Cancel",
    dontAsk: "Don't ask again",
  };
}
