import type { Terminal as XTerm } from "@xterm/xterm";
import type {
  ClipboardSelectionType,
  IClipboardProvider,
} from "@xterm/addon-clipboard";
import type { TerminalPaneAgent } from "../types/index";

import { isDesktopRuntime } from "@/shared/lib/desktop-runtime";
import { terminalFont } from "./theme";

const TERMINAL_FONT_REGULAR_PATH = "/fonts/HackNerdFontMono-Regular.ttf";
const TERMINAL_FONT_BOLD_PATH = "/fonts/HackNerdFontMono-Bold.ttf";
const NERD_FONT_TEST_GLYPH = "\uE0B6";
const SHIFT_ENTER_CSI_U = "\x1b[13;2u";
const CTRL_ENTER_CSI_U = "\x1b[13;5u";
const MIN_TERMINAL_COLS = 20;
const MIN_TERMINAL_ROWS = 8;

// Keep in sync with @atmos/shared ENABLE_TUI_MOUSE_TRACKING.
// 1003 (any-motion) is required for TUI hover; without it xterm stays in DRAG
// and only reports moves while a button is held.
export const ENABLE_TUI_MOUSE_TRACKING = "\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h";
export const DISABLE_TUI_MOUSE_TRACKING = "\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l";

/** Prefer backend-observed sequence; else flag/alternate heuristic with full default. */
export function mouseTrackingRestoreSequence(snapshot: {
  alternate?: boolean;
  restore_mouse_tracking?: boolean;
  mouse_tracking_sequence?: string | null;
}): string {
  if (
    typeof snapshot.mouse_tracking_sequence === "string" &&
    snapshot.mouse_tracking_sequence.length > 0
  ) {
    return snapshot.mouse_tracking_sequence;
  }
  const restore =
    typeof snapshot.restore_mouse_tracking === "boolean"
      ? snapshot.restore_mouse_tracking
      : snapshot.alternate === true;
  return restore ? ENABLE_TUI_MOUSE_TRACKING : "";
}

/** Keep in sync with @atmos/shared and core-engine inline mouse TUI whitelist. */
export function isInlineMouseTuiCommand(cmd: string): boolean {
  const trimmed = cmd.trim();
  if (!trimmed) return false;
  const parts = trimmed.split(/[/\\]/);
  const name = parts[parts.length - 1] || trimmed;
  return name === "grok" || name.startsWith("grok-");
}

let terminalFontLoadPromise: Promise<void> | null = null;

export class SafeClipboardProvider implements IClipboardProvider {
  async readText(selection: ClipboardSelectionType): Promise<string> {
    if (selection !== "c") return "";
    if (!isDesktopRuntime() && !navigator.userActivation?.isActive) return "";
    try {
      return await navigator.clipboard.readText();
    } catch {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith("image/")) {
              const blob = await item.getType(type);
              return await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                  const dataUrl = reader.result as string;
                  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
                  resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
            }
          }
        }
      } catch {
        // read() not supported or permission denied
      }
      return "";
    }
  }

  async writeText(selection: ClipboardSelectionType, text: string): Promise<void> {
    if (selection !== "c" || !text?.trim()) return;
    if (!isDesktopRuntime() && !navigator.userActivation?.isActive) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard write failed (permissions, etc.)
    }
  }
}

export function wrapBracketedPaste(text: string): string {
  // Strip ESC so an embedded `\x1b[201~` (or any CSI) cannot end paste mode early.
  const normalised = text.replace(/\x1b/g, "").replace(/\r?\n/g, "\r");
  return `\x1b[200~${normalised}\x1b[201~`;
}

export function shiftEnterInput(): string {
  return isDesktopRuntime() ? SHIFT_ENTER_CSI_U : "\n";
}

export function ctrlEnterInput(): string {
  return CTRL_ENTER_CSI_U;
}

export type TerminalAgentSubmitMode =
  | "text-enter"
  | "text-ctrl-enter"
  | "bracketed-paste-enter";

export function resolveTerminalAgentSubmitMode(
  agent?: TerminalPaneAgent,
): TerminalAgentSubmitMode {
  const values = [
    agent?.id,
    agent?.command,
    agent?.pipeCommand,
    agent?.label,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim().toLowerCase());

  if (values.some((value) => value.includes("cursor"))) {
    return "text-ctrl-enter";
  }
  if (values.some((value) => value.includes("codex"))) {
    return "bracketed-paste-enter";
  }
  return "text-enter";
}

export function normalizeSnapshotData(data: string): string {
  return data.replace(/\r?\n/g, "\r\n");
}

type XTermInternalCore = {
  writeSync: (data: string | Uint8Array, maxSubsequentCalls?: number) => void;
  scrollToBottom: (disableSmoothScroll?: boolean) => void;
};

function getXtermInternalCore(term: XTerm): XTermInternalCore | null {
  const core = (term as XTerm & { _core?: XTermInternalCore })._core;
  return core ?? null;
}

export function jumpXtermToBottom(term: XTerm): void {
  const core = getXtermInternalCore(term);
  if (core) {
    core.scrollToBottom(true);
    return;
  }
  term.scrollToBottom();
}

export function writeXtermPayload(term: XTerm, payload: string, onComplete: () => void): void {
  const core = getXtermInternalCore(term);
  if (core) {
    core.writeSync(payload);
    onComplete();
    return;
  }
  term.write(payload, onComplete);
}

export type TerminalWriteChunk = string | Uint8Array;

export function cloneTerminalWriteChunk(data: TerminalWriteChunk): TerminalWriteChunk {
  return typeof data === "string" ? data : data.slice();
}

export function coalesceTerminalWriteChunks(chunks: TerminalWriteChunk[]): TerminalWriteChunk[] {
  const coalesced: TerminalWriteChunk[] = [];
  let text = "";
  let byteLength = 0;
  let byteChunks: Uint8Array[] = [];

  const flushText = () => {
    if (!text) return;
    coalesced.push(text);
    text = "";
  };

  const flushBytes = () => {
    if (byteLength === 0) return;
    if (byteChunks.length === 1) {
      coalesced.push(byteChunks[0]);
    } else {
      const merged = new Uint8Array(byteLength);
      let offset = 0;
      for (const chunk of byteChunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      coalesced.push(merged);
    }
    byteLength = 0;
    byteChunks = [];
  };

  for (const chunk of chunks) {
    if (typeof chunk === "string") {
      flushBytes();
      text += chunk;
    } else {
      flushText();
      byteLength += chunk.byteLength;
      byteChunks.push(chunk);
    }
  }

  flushText();
  flushBytes();

  return coalesced;
}

export function isUsableTerminalGrid(cols: number, rows: number): boolean {
  return cols >= MIN_TERMINAL_COLS && rows >= MIN_TERMINAL_ROWS;
}

export function isTerminalContainerVisible(element: HTMLElement | null): boolean {
  if (!element || element.offsetParent === null) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Session-level "recently live" marker so a brief React remount does not flash the
 * full-screen "Connecting to terminal..." overlay when the PTY is still warm.
 *
 * Disconnect (including unmount) schedules a short grace clear — if the same
 * session remounts and reconnects quickly (workspace warm switch), the marker stays.
 */
const liveTerminalSessionIds = new Set<string>();
const liveTerminalSessionGraceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const TERMINAL_SESSION_LIVE_GRACE_MS = 2_000;

export function markTerminalSessionLive(sessionId: string): void {
  if (!sessionId) return;
  const pending = liveTerminalSessionGraceTimers.get(sessionId);
  if (pending) {
    clearTimeout(pending);
    liveTerminalSessionGraceTimers.delete(sessionId);
  }
  liveTerminalSessionIds.add(sessionId);
}

export function markTerminalSessionDead(sessionId: string): void {
  if (!sessionId) return;
  const pending = liveTerminalSessionGraceTimers.get(sessionId);
  if (pending) {
    clearTimeout(pending);
    liveTerminalSessionGraceTimers.delete(sessionId);
  }
  liveTerminalSessionIds.delete(sessionId);
}

/** Soft clear after disconnect/unmount — cancelled if session becomes live again. */
export function scheduleTerminalSessionDead(
  sessionId: string,
  graceMs: number = TERMINAL_SESSION_LIVE_GRACE_MS,
): void {
  if (!sessionId) return;
  const prev = liveTerminalSessionGraceTimers.get(sessionId);
  if (prev) clearTimeout(prev);
  liveTerminalSessionGraceTimers.set(
    sessionId,
    setTimeout(() => {
      liveTerminalSessionGraceTimers.delete(sessionId);
      liveTerminalSessionIds.delete(sessionId);
    }, graceMs),
  );
}

export function wasTerminalSessionLive(sessionId: string): boolean {
  return Boolean(sessionId) && liveTerminalSessionIds.has(sessionId);
}

export function isTerminalEmulatorReport(data: string): boolean {
  if (!data.startsWith("\x1b")) return false;

  if (data.startsWith("\x1b]")) return true;
  if (/^\x1b\[\??[\d;]*c$/.test(data)) return true;
  if (/^\x1b\[\d+;\d+R$/.test(data)) return true;
  if (/^\x1b\[\?[\d;]+;\d+\$y$/.test(data)) return true;
  if (/^\x1b\[\d+(?:;\d+)*t$/.test(data)) return true;

  return false;
}

function toAbsoluteAssetUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}

export async function ensureTerminalFontsLoaded() {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return;

  if (!terminalFontLoadPromise) {
    terminalFontLoadPromise = (async () => {
      const regularUrl = toAbsoluteAssetUrl(TERMINAL_FONT_REGULAR_PATH);
      const boldUrl = toAbsoluteAssetUrl(TERMINAL_FONT_BOLD_PATH);
      const faces = [
        new FontFace("Hack Nerd Font Mono", `url("${regularUrl}")`, {
          weight: "400",
          style: "normal",
        }),
        new FontFace("Hack Nerd Font Mono", `url("${boldUrl}")`, {
          weight: "700",
          style: "normal",
        }),
        new FontFace("Hack Nerd Font", `url("${regularUrl}")`, {
          weight: "400",
          style: "normal",
        }),
        new FontFace("Hack Nerd Font", `url("${boldUrl}")`, {
          weight: "700",
          style: "normal",
        }),
      ];

      const results = await Promise.allSettled(faces.map((face) => face.load()));
      for (const result of results) {
        if (result.status === "fulfilled" && !document.fonts.has(result.value)) {
          document.fonts.add(result.value);
        }
      }

      await Promise.allSettled([
        document.fonts.load(`${terminalFont.size}px "Hack Nerd Font Mono"`, NERD_FONT_TEST_GLYPH),
        document.fonts.load(`${terminalFont.size}px "Hack Nerd Font"`, NERD_FONT_TEST_GLYPH),
        document.fonts.ready,
      ]);
    })();
  }

  try {
    await terminalFontLoadPromise;
  } catch {
    terminalFontLoadPromise = null;
    throw new Error("Failed to preload terminal fonts");
  }
}

const MULTI_WORD_CMDS = new Set([
  "cargo", "npm", "yarn", "pnpm", "bun", "docker", "git",
  "kubectl", "go", "just", "make", "python", "ruby", "node",
]);

export function extractCommandName(fullCommand: string): string {
  const stripped = fullCommand
    .replace(/^(\s*(sudo|command|env)\s+)*/g, "")
    .replace(/^\s*\S+=\S+\s+/g, "")
    .trim();

  const parts = stripped.split(/\s+/);
  if (parts.length === 0) return fullCommand;

  const cmd = parts[0];
  if (MULTI_WORD_CMDS.has(cmd) && parts.length > 1) {
    return `${cmd} ${parts[1]}`;
  }
  return cmd;
}

export function shortenPath(fullPath: string): string {
  if (!fullPath || fullPath === "/") return "/";
  const parts = fullPath.split("/").filter(Boolean);
  if (parts.length <= 2) return fullPath;
  return parts.slice(-2).join("/");
}

export function isFindShortcut(event: { ctrlKey: boolean; metaKey: boolean; key: string; shiftKey?: boolean }): boolean {
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f" && !event.shiftKey;
}

export function isTerminalAgentInputShortcut(event: {
  altKey?: boolean;
  code?: string;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey?: boolean;
}): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    (event.key.toLowerCase() === "g" || event.code === "KeyG")
  );
}

export function isTerminalAgentInputPinShortcut(event: {
  altKey?: boolean;
  code?: string;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey?: boolean;
}): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !!event.shiftKey &&
    (event.key.toLowerCase() === "g" || event.code === "KeyG")
  );
}
