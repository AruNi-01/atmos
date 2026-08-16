import type { TerminalSnapshot, WsTerminalResponse } from "../types/index";

export type TerminalServerDispatch =
  | { action: "output"; data: string | Uint8Array }
  | { action: "attached"; snapshot?: TerminalSnapshot | null }
  | { action: "closed" }
  | { action: "destroyed" }
  | { action: "error"; error: string }
  | { action: "ignore" };

export function dispatchTerminalServerPayload(
  data: string | Uint8Array,
  sessionId: string,
): TerminalServerDispatch {
  if (typeof data !== "string") {
    return data.length ? { action: "output", data } : { action: "ignore" };
  }

  try {
    const message = JSON.parse(data) as WsTerminalResponse;
    switch (message.type) {
      case "terminal_output":
        if (message.session_id === sessionId) {
          return { action: "output", data: message.data };
        }
        return { action: "ignore" };
      case "terminal_created":
      case "terminal_attached":
        if (message.session_id === sessionId) {
          return { action: "attached", snapshot: message.snapshot };
        }
        return { action: "ignore" };
      case "terminal_closed":
        if (message.session_id === sessionId) {
          return { action: "closed" };
        }
        return { action: "ignore" };
      case "terminal_destroyed":
        if (message.session_id === sessionId) {
          return { action: "destroyed" };
        }
        return { action: "ignore" };
      case "terminal_error":
        return { action: "error", error: message.error };
      default:
        return { action: "ignore" };
    }
  } catch {
    return { action: "output", data };
  }
}
