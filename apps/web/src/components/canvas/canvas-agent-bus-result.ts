import type { CanvasAgentErrorCode } from "./canvas-agent-errors";

export interface CanvasAgentDispatchInput {
  request_id: string;
  client_id?: string;
  command: string;
  args?: Record<string, unknown> | null;
  deadline_ms?: number;
}

export interface CanvasAgentSuccess {
  success: true;
  data: unknown;
}

export interface CanvasAgentFailure {
  success: false;
  error_code: CanvasAgentErrorCode;
  error_message: string;
  recoverable: boolean;
  data?: unknown;
}

export type CanvasAgentResult = CanvasAgentSuccess | CanvasAgentFailure;

export interface CanvasAgentBusOptions {
  /**
   * Initial value of "Allow terminal/CLI control". The bus owns this flag
   * after construction; the React hook keeps it in sync via
   * `setBridgeAccepting`. When `false`, only `status` is allowed; everything
   * else answers with `BRIDGE_DISABLED`.
   */
  isBridgeAccepting?: boolean;
  /**
   * Optional logger — defaults to console.debug. Tests can pass `noop`.
   */
  log?: (message: string, payload?: unknown) => void;
}

export function ok(data: unknown): CanvasAgentSuccess {
  return { success: true, data };
}

export function fail(
  code: CanvasAgentErrorCode,
  message: string,
  recoverable: boolean,
): CanvasAgentFailure {
  return { success: false, error_code: code, error_message: message, recoverable };
}
