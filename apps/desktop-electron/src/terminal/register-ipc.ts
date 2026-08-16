import type { AppState } from "../app-state.js";
import type { TerminalStreamEvent, TerminalStreamHub } from "./stream-hub.js";

type IpcMainLike = {
  removeHandler(channel: string): void;
  handle(
    channel: string,
    listener: (
      event: { sender: IpcSender },
      payload: unknown,
    ) => unknown | Promise<unknown>,
  ): void;
  removeAllListeners(channel: string): void;
  on(
    channel: string,
    listener: (event: { sender: IpcSender }, ...args: unknown[]) => void,
  ): void;
};

type IpcSender = {
  id: number;
  isDestroyed?: () => boolean;
  send: (channel: string, payload: unknown) => void;
  once?: (event: string, listener: () => void) => void;
};

const OPEN_CHANNEL = "atmos:terminal-stream-open";
const SEND_CHANNEL = "atmos:terminal-stream-send";
const CLOSE_CHANNEL = "atmos:terminal-stream-close";

function eventChannel(
  type: TerminalStreamEvent["type"],
): `atmos:desktop-event:terminal_stream_${string}` {
  switch (type) {
    case "open":
      return "atmos:desktop-event:terminal_stream_open";
    case "message":
      return "atmos:desktop-event:terminal_stream_message";
    case "error":
      return "atmos:desktop-event:terminal_stream_error";
    case "close":
      return "atmos:desktop-event:terminal_stream_close";
  }
}

function senderPayload(event: TerminalStreamEvent): unknown {
  if (event.type === "message" && event.kind === "binary") {
    return {
      streamId: event.streamId,
      kind: "binary",
      bytes: event.bytes,
    };
  }
  if (event.type === "message") {
    return {
      streamId: event.streamId,
      kind: "text",
      text: event.text,
    };
  }
  if (event.type === "error") {
    return { streamId: event.streamId, error: event.error };
  }
  return { streamId: event.streamId };
}

export function registerTerminalStreamIpc(
  ipcMain: IpcMainLike,
  _state: AppState,
  hub: TerminalStreamHub,
): void {
  ipcMain.removeHandler(OPEN_CHANNEL);
  ipcMain.removeAllListeners(SEND_CHANNEL);
  ipcMain.removeAllListeners(CLOSE_CHANNEL);

  ipcMain.handle(OPEN_CHANNEL, async (event, payload) => {
    const url =
      payload && typeof payload === "object" && "url" in payload
        ? String((payload as { url?: unknown }).url ?? "")
        : "";
    const sender = event.sender;
    sender.once?.("destroyed", () => {
      hub.closeAllForSender(sender.id);
    });
    return hub.open(
      {
        id: sender.id,
        send(streamEvent) {
          if (sender.isDestroyed?.()) return;
          try {
            sender.send(eventChannel(streamEvent.type), senderPayload(streamEvent));
          } catch {
            hub.close(sender.id, streamEvent.streamId);
          }
        },
      },
      url,
    );
  });

  ipcMain.on(SEND_CHANNEL, (event, streamId, data) => {
    if (typeof streamId !== "string") return;
    if (typeof data !== "string" && !(data instanceof ArrayBuffer)) {
      if (ArrayBuffer.isView(data)) {
        hub.send(
          event.sender.id,
          streamId,
          data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
        );
        return;
      }
      return;
    }
    hub.send(event.sender.id, streamId, data);
  });

  ipcMain.on(CLOSE_CHANNEL, (event, streamId) => {
    if (typeof streamId !== "string") return;
    hub.close(event.sender.id, streamId);
  });
}
