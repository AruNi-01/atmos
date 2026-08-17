export const ROOT_SIDEBAR_LAYOUT_AUTO_SAVE_ID = "root-sidebar-layout-v4";
export const DEFAULT_LEFT_SIDEBAR_SIZE = 25;
export const DEFAULT_COLLAPSED_TWO_COLUMN_LEFT_SIDEBAR_SIZE = 15;

/** Shared height for left-sidebar footer + main column Footer (Tailwind `h-9`). */
export const APP_FOOTER_HEIGHT_CLASS = "h-9";
export const APP_FOOTER_HEIGHT_PX = 36;

/**
 * Floating center-stage card gutters (Tailwind `px-2 py-1`).
 * Keep New Workspace overlay insets in sync with these values.
 */
export const CENTER_STAGE_GUTTER_X_PX = 8;
export const CENTER_STAGE_GUTTER_Y_PX = 4;
export const CENTER_STAGE_GUTTER_CLASS = "px-2 py-1";

/** Shell behind the floating card — matches sidebar so gutters read as inset. */
export const CENTER_STAGE_SHELL_CLASS =
  "relative flex h-full min-h-0 flex-col overflow-hidden bg-sidebar";

/**
 * Shared radius for every center-stage surface (`rounded-xl` = `--radius-xl`).
 * Use this instead of hardcoded 12px so WebGL/canvas clips match the card.
 */
export const CENTER_STAGE_RADIUS_CLASS = "rounded-xl";
export const CENTER_STAGE_RADIUS_CSS = "var(--radius-xl)";

/** Floating card: clip children to the radius and ring the inset stage. */
export const CENTER_STAGE_CARD_CLASS =
  "h-full min-h-0 overflow-hidden rounded-xl bg-background ring-1 ring-border/40";
