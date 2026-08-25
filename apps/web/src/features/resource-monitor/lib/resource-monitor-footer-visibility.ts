/** Wait for layout settings so the default `true` cannot mount and sample first. */
export function effectiveShowResourceMonitor(
  loaded: boolean,
  showResourceMonitor: boolean,
): boolean {
  return loaded && showResourceMonitor;
}
