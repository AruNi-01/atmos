/**
 * Logical control plane for a terminal session (resize, destroy, attach events).
 *
 * On WS and desktop IPC this is multiplexed as JSON text on the same connection
 * as PTY bytes — not a second socket and not REST.
 */

export type { ControlHandle } from "./byte-stream-port";
