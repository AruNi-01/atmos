/**
 * Milkdown markdownUpdated gate: do not persist format-only serializes.
 *
 * Opening a file parse→stringify roundtrips through Milkdown. That can
 * differ from disk even when the user has not edited. Call `arm()` after
 * `editor.create()` (after capturing the first serialize) so later updates
 * persist only when they differ from both the loaded source and that baseline.
 */
export type MdLiveOnChangeGate = ((markdown: string) => string | null) & {
  arm: () => void;
};

export function createMdLiveOnChangeGate(loadedMarkdown: string): MdLiveOnChangeGate {
  let lastCommitted = loadedMarkdown;
  let ready = false;
  let formatBaseline: string | null = null;

  const gate = ((nextMarkdown: string): string | null => {
    if (!ready) {
      formatBaseline = nextMarkdown;
      return null;
    }
    if (nextMarkdown === lastCommitted) return null;
    if (formatBaseline != null && nextMarkdown === formatBaseline) {
      if (lastCommitted !== loadedMarkdown) {
        lastCommitted = loadedMarkdown;
        return loadedMarkdown;
      }
      return null;
    }
    lastCommitted = nextMarkdown;
    return nextMarkdown;
  }) as MdLiveOnChangeGate;

  gate.arm = () => {
    ready = true;
  };

  return gate;
}
