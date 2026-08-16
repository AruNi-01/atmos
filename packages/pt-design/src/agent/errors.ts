export const PT_ERROR_CODES = {
  UNKNOWN_COMPONENT_TYPE: "UNKNOWN_COMPONENT_TYPE",
  NOT_FOUND: "NOT_FOUND",
  MISSING_FILE: "MISSING_FILE",
  INVALID_FILE: "INVALID_FILE",
  INVALID_JSON: "INVALID_JSON",
  FRAME_AMBIGUOUS: "FRAME_AMBIGUOUS",
  CONFLICT: "CONFLICT",
  USAGE: "USAGE",
  INTERNAL: "INTERNAL",
} as const;

export type PtErrorCode = (typeof PT_ERROR_CODES)[keyof typeof PT_ERROR_CODES];

export class PtDesignError extends Error {
  readonly code: PtErrorCode;

  constructor(code: PtErrorCode, message: string) {
    super(message);
    this.name = "PtDesignError";
    this.code = code;
  }
}

export function isPtDesignError(error: unknown): error is PtDesignError {
  return error instanceof PtDesignError;
}

export function cliExitCode(code: PtErrorCode): number {
  switch (code) {
    case PT_ERROR_CODES.USAGE:
    case PT_ERROR_CODES.INVALID_JSON:
    case PT_ERROR_CODES.UNKNOWN_COMPONENT_TYPE:
    case PT_ERROR_CODES.INVALID_FILE:
      return 1;
    case PT_ERROR_CODES.NOT_FOUND:
    case PT_ERROR_CODES.MISSING_FILE:
    case PT_ERROR_CODES.FRAME_AMBIGUOUS:
      return 2;
    case PT_ERROR_CODES.CONFLICT:
      return 3;
    default:
      return 4;
  }
}
