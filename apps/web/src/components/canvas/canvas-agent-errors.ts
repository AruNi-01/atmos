export type CanvasAgentErrorCode =
  | "BRIDGE_DISABLED"
  | "EDITOR_NOT_READY"
  | "STALE_SHAPE_ID"
  | "VALIDATION_ARG"
  | "UNSUPPORTED_COMMAND"
  | "INTERNAL_ERROR";

export class CanvasAgentError extends Error {
  constructor(
    readonly code: CanvasAgentErrorCode,
    message: string,
    readonly recoverable: boolean,
  ) {
    super(message);
    this.name = "CanvasAgentError";
  }
}

export function formatUnknownError(err: unknown): string {
  if (err instanceof CanvasAgentError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function isTldrawValidationError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "ValidationError") return true;
  return /Unexpected property|ValidationError|At shape\(/.test(err.message);
}
