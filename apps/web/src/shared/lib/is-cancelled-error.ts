/**
 * Detect TanStack Query / AbortController cancellation without treating it as
 * a real failure. CancelledError is expected when scope changes invalidate
 * in-flight settings bootstrap queries.
 */
export function isCancelledError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const name = "name" in error ? String(error.name) : "";
  if (name === "CancelledError" || name === "AbortError") {
    return true;
  }

  const message = "message" in error ? String(error.message) : "";
  if (
    message === "CancelledError" ||
    message.includes("CancelledError") ||
    message === "Aborted" ||
    /signal is aborted/i.test(message)
  ) {
    return true;
  }

  return false;
}
