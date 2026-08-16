import {
  createWebSocketByteStreamPort,
  resolveTerminalByteStreamCarrier,
  type ByteStreamPort,
} from "@atmos/shared/terminal";
import {
  getDesktopTerminalStreamApi,
  isElectronShell,
} from "@/shared/lib/desktop-bridge";
import { createDesktopIpcByteStreamPort } from "./desktop-ipc-byte-stream-port";

export function createBoundTerminalByteStreamPort(url: string): ByteStreamPort {
  const carrier = resolveTerminalByteStreamCarrier({
    electronShell: isElectronShell(),
    hasIpcBridge: getDesktopTerminalStreamApi() != null,
    url,
  });
  if (carrier === "ipc") {
    return createDesktopIpcByteStreamPort();
  }
  return createWebSocketByteStreamPort();
}
