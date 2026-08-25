export const RESOURCE_MONITOR_IDLE_MS = 15_000;
export const RESOURCE_MONITOR_INTERACTIVE_MS = 2_500;
export const RESOURCE_MONITOR_STALE_MS = 45_000;
/** Local clock while the popover is open. Keep 5–10s so stale can appear without a hot timer. */
export const RESOURCE_MONITOR_CLOCK_MS = 8_000;
/** Client-side Host trend ring. Existing Query snapshots only. */
export const RESOURCE_MONITOR_HISTORY_CAP = 60;
/** Matches the Server disk list cap. */
export const RESOURCE_MONITOR_DISK_CAP = 16;
