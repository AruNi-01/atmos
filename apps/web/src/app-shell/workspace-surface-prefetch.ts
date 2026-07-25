/**
 * APP-043 M9: debounce workspace prime on hover intent without forcing Warm.
 */

export type PrimeWorkspaceFn = (
  workspaceId: string,
  isProjectContext?: boolean,
) => void;

export function createWorkspacePrimePrefetch(options?: {
  debounceMs?: number;
  primeWorkspace?: PrimeWorkspaceFn;
}): {
  onWorkspaceHover: (workspaceId: string, isProjectContext?: boolean) => void;
  cancel: () => void;
  /** test helper */
  flush: () => void;
} {
  const debounceMs = options?.debounceMs ?? 100;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { workspaceId: string; isProjectContext?: boolean } | null = null;

  const run = () => {
    timer = null;
    if (!pending) return;
    const { workspaceId, isProjectContext } = pending;
    pending = null;
    const prime =
      options?.primeWorkspace ??
      ((id: string, isProject?: boolean) => {
        // Lazy import keeps this module free of heavy store graphs for unit tests.
        void import("@/features/terminal/store/use-terminal-store").then(
          ({ useTerminalStore }) => {
            useTerminalStore.getState().primeWorkspace(id, isProject);
          },
        );
      });
    prime(workspaceId, isProjectContext);
  };

  return {
    onWorkspaceHover(workspaceId, isProjectContext) {
      pending = { workspaceId, isProjectContext };
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, debounceMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
    flush() {
      if (timer) clearTimeout(timer);
      run();
    },
  };
}
