/** Idle with no elevated layers before destroying the overlay surface (M6). */
export const OVERLAY_IDLE_MS = 30_000;

/** Max wait for overlay ready before APP-029 hide fallback may engage. */
export const OVERLAY_CREATE_BUDGET_MS = 200;

/** Padding around elevated layer union for pass-through bounds. */
export const OVERLAY_BOUNDS_PADDING_PX = 16;

/** Stable window.open name prefix; host id is appended. */
export const OVERLAY_WINDOW_NAME_PREFIX = "atmos-desktop-overlay";
