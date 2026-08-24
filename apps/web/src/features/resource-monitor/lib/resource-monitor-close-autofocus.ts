/**
 * Close-autofocus for Resource Monitor. Prevent Footer focus steal only while
 * a session navigation is in flight. Clear the flag after preventDefault.
 */
export function preventResourceMonitorCloseAutoFocus(
  navigating: { current: boolean },
  event: { preventDefault: () => void },
): boolean {
  if (!navigating.current) return false;
  event.preventDefault();
  navigating.current = false;
  return true;
}
