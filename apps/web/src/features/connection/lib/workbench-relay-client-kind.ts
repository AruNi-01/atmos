/**
 * Which Relay `client_kind` / WS `client_type` this workbench UI should claim.
 *
 * Desktop Electron loads the same apps/web UI via loopback static, so we detect
 * shell at runtime rather than a separate desktop package client.
 */
import type { RelayClientKind } from "@atmos/relay-client";
import { isDesktopRuntime } from "@/shared/lib/desktop-runtime";

/** `desktop` in Electron shell; `web` in browser (hosted or loopback). */
export function workbenchRelayClientKind(): Extract<
  RelayClientKind,
  "web" | "desktop"
> {
  return isDesktopRuntime() ? "desktop" : "web";
}
