export type PtDesignErrorCode =
  | "invalid_ptx"
  | "invalid_option"
  | "missing_file"
  | "unknown_tool"
  | "unknown_type"
  | "path_denied";

export class PtDesignError extends Error {
  readonly code: PtDesignErrorCode;

  constructor(code: PtDesignErrorCode, message: string) {
    super(message);
    this.name = "PtDesignError";
    this.code = code;
  }
}

export function fail(code: PtDesignErrorCode, message: string): never {
  throw new PtDesignError(code, message);
}
