/**
 * Shell-agnostic desktop bridge (APP-045).
 *
 * Detects `none` | `tauri` | `electron` and routes invoke/listen without
 * requiring Electron to load Tauri (or vice versa).
 */

export type DesktopShell = "none" | "tauri" | "electron";

/** Stable error code for commands not implemented on the current shell. */
export const DESKTOP_CMD_UNSUPPORTED = "DESKTOP_CMD_UNSUPPORTED";

export type DesktopInvokeArgs = Record<string, unknown> | undefined;

export type DesktopInvokeFn = (
  cmd: string,
  args?: DesktopInvokeArgs,
) => Promise<unknown>;

export type DesktopListenUnlisten = () => void;

export type DesktopListenFn = (
  event: string,
  handler: (payload: unknown) => void,
) => Promise<DesktopListenUnlisten> | DesktopListenUnlisten;

export type DesktopTerminalStreamApi = {
  open: (url: string) => Promise<{ streamId: string; sidecar?: "uds" | "ws" }>;
  send: (streamId: string, data: ArrayBuffer | string) => void;
  close: (streamId: string) => void;
};

export type AtmosDesktopPreload = {
  shell: "electron";
  invoke: DesktopInvokeFn;
  on?: (
    event: string,
    handler: (payload: unknown) => void,
  ) => DesktopListenUnlisten | void;
  /** Binary terminal stream (renderer ↔ main). Absent on older shells. */
  terminalStream?: DesktopTerminalStreamApi;
};

type WindowWithDesktop = Window & {
  __ATMOS_DESKTOP__?: AtmosDesktopPreload;
  __TAURI_INTERNALS__?: {
    invoke?: (cmd: string, payload?: unknown) => Promise<unknown>;
  };
};

export class DesktopBridgeError extends Error {
  readonly code: string;
  readonly command?: string;

  constructor(code: string, message: string, command?: string) {
    super(message);
    this.name = "DesktopBridgeError";
    this.code = code;
    this.command = command;
  }
}

export function createUnsupportedCommandError(command: string): DesktopBridgeError {
  return new DesktopBridgeError(
    DESKTOP_CMD_UNSUPPORTED,
    `Desktop command not supported on this shell: ${command}`,
    command,
  );
}

export function isDesktopBridgeError(
  error: unknown,
  code?: string,
): error is DesktopBridgeError {
  if (!(error instanceof DesktopBridgeError)) return false;
  if (code === undefined) return true;
  return error.code === code;
}

type GlobalWithWindow = typeof globalThis & {
  window?: WindowWithDesktop;
};

/**
 * Detect the active desktop shell from a window-like object.
 * Pure and injectable for unit tests.
 */
export function detectDesktopShell(
  globalObj: GlobalWithWindow = globalThis as GlobalWithWindow,
): DesktopShell {
  const win = globalObj.window;
  if (!win) return "none";

  // Electron preload marker preferred (first-party).
  if (win.__ATMOS_DESKTOP__?.shell === "electron") {
    return "electron";
  }

  // Tauri injects internals on the page.
  if ("__TAURI_INTERNALS__" in win && win.__TAURI_INTERNALS__) {
    return "tauri";
  }

  return "none";
}

export function isDesktopRuntime(
  globalObj: GlobalWithWindow = globalThis as GlobalWithWindow,
): boolean {
  return detectDesktopShell(globalObj) !== "none";
}

/** Compat: true only for the Tauri shell (not Electron). */
export function isTauriShell(
  globalObj: GlobalWithWindow = globalThis as GlobalWithWindow,
): boolean {
  return detectDesktopShell(globalObj) === "tauri";
}

/** Compat: true only for the Electron shell. */
export function isElectronShell(
  globalObj: GlobalWithWindow = globalThis as GlobalWithWindow,
): boolean {
  return detectDesktopShell(globalObj) === "electron";
}

export type DesktopBridgeAdapters = {
  tauriInvoke?: DesktopInvokeFn;
  electronInvoke?: DesktopInvokeFn;
  tauriListen?: DesktopListenFn;
  electronListen?: DesktopListenFn;
};

let testAdapters: DesktopBridgeAdapters | null = null;

/** Test-only: inject adapters so unit tests exercise real dispatch without GUI. */
export function __setDesktopBridgeAdaptersForTests(
  adapters: DesktopBridgeAdapters | null,
): void {
  testAdapters = adapters;
}

async function defaultTauriInvoke(
  cmd: string,
  args?: DesktopInvokeArgs,
): Promise<unknown> {
  const win = (globalThis as GlobalWithWindow).window as WindowWithDesktop | undefined;
  const invoke = win?.__TAURI_INTERNALS__?.invoke;
  if (!invoke) {
    throw new DesktopBridgeError(
      "DESKTOP_INVOKE_UNAVAILABLE",
      "Tauri invoke bridge is unavailable",
      cmd,
    );
  }
  // Tauri expects a plain object payload (or undefined).
  return invoke(cmd, args);
}

async function defaultElectronInvoke(
  cmd: string,
  args?: DesktopInvokeArgs,
): Promise<unknown> {
  const win = (globalThis as GlobalWithWindow).window as WindowWithDesktop | undefined;
  const invoke = win?.__ATMOS_DESKTOP__?.invoke;
  if (!invoke) {
    throw new DesktopBridgeError(
      "DESKTOP_INVOKE_UNAVAILABLE",
      "Electron desktop bridge is unavailable",
      cmd,
    );
  }
  try {
    return await invoke(cmd, args);
  } catch (error) {
    // Preload throws a plain `{ code, message, command }` so contextBridge
    // preserves the typed code. Rehydrate to DesktopBridgeError for callers.
    if (error instanceof DesktopBridgeError) throw error;
    if (error && typeof error === "object" && "code" in error) {
      const e = error as { code?: unknown; message?: unknown; command?: unknown };
      throw new DesktopBridgeError(
        String(e.code ?? "DESKTOP_ERROR"),
        String(e.message ?? "Desktop invoke failed"),
        e.command != null ? String(e.command) : cmd,
      );
    }
    if (error instanceof Error) {
      throw new DesktopBridgeError("DESKTOP_ERROR", error.message, cmd);
    }
    throw new DesktopBridgeError("DESKTOP_ERROR", String(error), cmd);
  }
}

/**
 * Dispatch an invoke through the given shell using adapters.
 * Exported for unit tests of routing logic.
 */
export async function invokeViaShell(
  shell: DesktopShell,
  cmd: string,
  args?: DesktopInvokeArgs,
  adapters: DesktopBridgeAdapters = {},
): Promise<unknown> {
  if (shell === "none") {
    throw new DesktopBridgeError(
      "DESKTOP_SHELL_NONE",
      `Not running inside a desktop shell (command: ${cmd})`,
      cmd,
    );
  }

  if (shell === "tauri") {
    const invoke = adapters.tauriInvoke ?? defaultTauriInvoke;
    return invoke(cmd, args);
  }

  if (shell === "electron") {
    const invoke = adapters.electronInvoke ?? defaultElectronInvoke;
    return invoke(cmd, args);
  }

  throw new DesktopBridgeError(
    "DESKTOP_SHELL_UNKNOWN",
    `Unknown desktop shell: ${String(shell)}`,
    cmd,
  );
}

/**
 * Invoke a desktop command on the current shell.
 */
export async function desktopInvoke<T = unknown>(
  cmd: string,
  args?: DesktopInvokeArgs,
): Promise<T> {
  const shell = detectDesktopShell();
  const adapters = testAdapters ?? {};
  return (await invokeViaShell(shell, cmd, args, adapters)) as T;
}

/**
 * Subscribe to a desktop event when the shell supports listen.
 * Returns a no-op unlisten when the shell has no event bus.
 */
export async function desktopListen(
  event: string,
  handler: (payload: unknown) => void,
): Promise<DesktopListenUnlisten> {
  const shell = detectDesktopShell();
  const adapters = testAdapters ?? {};

  if (shell === "tauri") {
    if (adapters.tauriListen) {
      return adapters.tauriListen(event, handler);
    }
    try {
      const { listen } = await import("@tauri-apps/api/event");
      return listen(event, (e) => {
        handler(e.payload);
      });
    } catch {
      return () => {};
    }
  }

  if (shell === "electron") {
    if (adapters.electronListen) {
      return adapters.electronListen(event, handler);
    }
    const win = (globalThis as GlobalWithWindow).window as WindowWithDesktop | undefined;
    const on = win?.__ATMOS_DESKTOP__?.on;
    if (!on) return () => {};
    const off = on(event, handler);
    return typeof off === "function" ? off : () => {};
  }

  return () => {};
}

/** Renderer binary terminal stream API from Electron preload, or null. */
export function getDesktopTerminalStreamApi(
  globalObj: GlobalWithWindow = globalThis as GlobalWithWindow,
): DesktopTerminalStreamApi | null {
  const api = globalObj.window?.__ATMOS_DESKTOP__?.terminalStream;
  if (
    !api ||
    typeof api.open !== "function" ||
    typeof api.send !== "function" ||
    typeof api.close !== "function"
  ) {
    return null;
  }
  return api;
}
