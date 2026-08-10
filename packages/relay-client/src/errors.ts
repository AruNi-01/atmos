export class RelayError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "RelayError";
  }
}

export function relayErrorFromBody(
  status: number,
  body: unknown,
  fallbackMessage: string,
): RelayError {
  const payload =
    body && typeof body === "object"
      ? (body as { error?: unknown; message?: unknown })
      : null;
  const code =
    typeof payload?.error === "string" && payload.error.trim()
      ? payload.error.trim()
      : undefined;
  const message =
    (typeof payload?.message === "string" && payload.message.trim()
      ? payload.message.trim()
      : undefined) ??
    code ??
    fallbackMessage;
  return new RelayError(message, status, code);
}
