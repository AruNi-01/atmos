/** Keep in sync with apps/web/src/shared/lib/desktop-bridge.ts */
export const DESKTOP_CMD_UNSUPPORTED = "DESKTOP_CMD_UNSUPPORTED";

export class DesktopCommandError extends Error {
  readonly code: string;
  readonly command?: string;

  constructor(code: string, message: string, command?: string) {
    super(message);
    this.name = "DesktopCommandError";
    this.code = code;
    this.command = command;
  }
}

export function unsupportedCommandError(command: string): DesktopCommandError {
  return new DesktopCommandError(
    DESKTOP_CMD_UNSUPPORTED,
    `Desktop command not supported on this shell: ${command}`,
    command,
  );
}

export type SerializedIpcError = {
  message: string;
  code: string;
  command?: string;
};

export function serializeIpcError(error: unknown): SerializedIpcError {
  if (error instanceof DesktopCommandError) {
    return {
      message: error.message,
      code: error.code,
      command: error.command,
    };
  }
  if (error && typeof error === "object" && "code" in error) {
    const e = error as { code?: unknown; message?: unknown; command?: unknown };
    return {
      message: String(e.message ?? "Desktop invoke failed"),
      code: String(e.code ?? "DESKTOP_ERROR"),
      command: e.command != null ? String(e.command) : undefined,
    };
  }
  return {
    message: error instanceof Error ? error.message : String(error),
    code: "DESKTOP_ERROR",
  };
}
