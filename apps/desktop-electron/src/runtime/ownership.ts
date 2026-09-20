/**
 * APP-076: Runtime belongs to the user session, not the Desktop window.
 * Always false — CLI and other clients may still need Atmos Server.
 */
export function desktopQuitShouldStopRuntime(): boolean {
  return false;
}
