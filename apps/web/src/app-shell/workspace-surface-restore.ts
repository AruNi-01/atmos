/**
 * APP-043 pure helpers for non-blocking center-tab restore and active-only targeting.
 */

/** Terminal last-tab restore must not wait for hydrate before issuing the tab intent. */
export function planTerminalLastTabRestore(input: {
  lastTab: string | null | undefined;
  visibleTerminalTabIds: string[];
  isTerminalWorkspaceReady: boolean;
}): {
  shouldPushUrl: boolean;
  tabToPush: string | null;
  /** true only when we should drop pending after this plan */
  settlePending: boolean;
} {
  if (!input.lastTab) {
    return { shouldPushUrl: false, tabToPush: null, settlePending: true };
  }

  const known = input.visibleTerminalTabIds.includes(input.lastTab);
  // Non-blocking: always push chrome intent for a terminal last tab.
  return {
    shouldPushUrl: true,
    tabToPush: input.lastTab,
    // Settle when tab is visible, or workspace is ready and tab is gone (give up).
    settlePending: known || input.isTerminalWorkspaceReady,
  };
}

/** Center hotkeys / agent landings only apply to the active context. */
export function resolveActiveOnlyContextId(input: {
  activeContextId: string | null | undefined;
  /** Ignored — landings always target the active context (warm requests discarded). */
  requestedContextId?: string | null;
}): string | null {
  return input.activeContextId ?? null;
}

/** Hidden warm frames must not receive focus or hotkey side effects. */
export function shouldAcceptFrameInput(isActiveFrame: boolean): boolean {
  return isActiveFrame;
}
