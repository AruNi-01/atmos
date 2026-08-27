/**
 * Milkdown markdownUpdated gate: commit only when serialized markdown changed.
 */
export function createMdLiveOnChangeGate(loadedMarkdown: string) {
  let lastCommitted = loadedMarkdown;
  return (nextMarkdown: string): string | null => {
    if (nextMarkdown === lastCommitted) return null;
    lastCommitted = nextMarkdown;
    return nextMarkdown;
  };
}
