/**
 * Live markdownUpdated gate (D22 / S12b).
 *
 * Milkdown's listener does not fire on init, so the first event is a real
 * edit. Dropping that first event (skip-first) swallows the first keystroke
 * and slash insert. Commit only when the serialized document actually changed
 * since the last value we already have (loaded bytes, then each emit).
 */
export function createMdLiveOnChangeGate(loadedMarkdown: string) {
  let lastCommitted = loadedMarkdown;
  return (nextMarkdown: string): string | null => {
    if (nextMarkdown === lastCommitted) return null;
    lastCommitted = nextMarkdown;
    return nextMarkdown;
  };
}
