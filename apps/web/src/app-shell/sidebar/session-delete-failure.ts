/** Partial host-session deletes still return success. Callers must not archive the chat. */
export function deletionFailureMessage(failures: readonly string[]): string | null {
  const messages = failures.map((item) => item.trim()).filter((item) => item.length > 0);
  return messages.length > 0 ? messages.join("; ") : null;
}
