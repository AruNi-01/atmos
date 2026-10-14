const EFFORT_POPOVER_PORTAL = "[data-morph-popover-portal]";

/** A model click stores the model. It does not close the Terminal picker. */
export function terminalPickerClosesOnModelChoice(): boolean {
  return false;
}

/**
 * The effort slider is portaled to `document.body`. That pointer is outside
 * the agent dropdown, and the dropdown must stay up so the slider can be used.
 */
export function pointerDownKeepsTerminalPickerOpen(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const closest = (target as { closest?: unknown }).closest;
  if (typeof closest !== "function") return false;
  return Boolean((closest as (selector: string) => unknown).call(target, EFFORT_POPOVER_PORTAL));
}
