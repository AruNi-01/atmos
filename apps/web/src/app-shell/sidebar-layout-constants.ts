export const ROOT_SIDEBAR_LAYOUT_AUTO_SAVE_ID = "root-sidebar-layout-v4";
export const DEFAULT_LEFT_SIDEBAR_SIZE = 25;
export const DEFAULT_COLLAPSED_TWO_COLUMN_LEFT_SIDEBAR_SIZE = 15;

/** Full-width chrome strip above PanelLayout (Tailwind `h-12`). */
export const APP_HEADER_HEIGHT_CLASS = "h-12";
export const APP_HEADER_HEIGHT_PX = 48;

/** Shared height for left-sidebar footer + main column Footer (Tailwind `h-9`). */
export const APP_FOOTER_HEIGHT_CLASS = "h-9";
export const APP_FOOTER_HEIGHT_PX = 36;

/**
 * Floating center-stage card gutters (Tailwind `px-1 py-px`).
 * 1px vertical keeps the card ring from clipping against header/footer
 * while lining up with the left sidebar. Keep overlay insets in sync.
 */
export const CENTER_STAGE_GUTTER_X_PX = 4;
export const CENTER_STAGE_GUTTER_Y_PX = 1;
export const CENTER_STAGE_GUTTER_CLASS = "px-1 py-px";

/**
 * Collapsed sidebar hover peek. `position:fixed` is viewport-relative, so pin
 * to the center-stage band — not over the header or the footer strip.
 */
export const SIDEBAR_PEEK_INSET_TOP_PX =
  APP_HEADER_HEIGHT_PX + CENTER_STAGE_GUTTER_Y_PX;
export const SIDEBAR_PEEK_INSET_BOTTOM_PX =
  APP_FOOTER_HEIGHT_PX + CENTER_STAGE_GUTTER_Y_PX;

/**
 * Inner top inset of the peek card. Matches Launchpad's `ml-2.5` so the
 * first row is not flush against the rounded overlay edge.
 */
export const SIDEBAR_PEEK_CONTENT_PT_CLASS = "pt-2.5";

/**
 * Left sidebar inset against the root sidebar↔center divider.
 * Keep this equal to the center card's left gutter so the split is even.
 */
export const LEFT_SIDEBAR_DIVIDER_GUTTER_PX = CENTER_STAGE_GUTTER_X_PX;
export const LEFT_SIDEBAR_DIVIDER_GUTTER_PR_CLASS = "pr-1";
export const LEFT_SIDEBAR_DIVIDER_GUTTER_MR_CLASS = "mr-1";

/** Shell behind the floating card — matches sidebar so gutters read as inset. */
export const CENTER_STAGE_SHELL_CLASS =
  "relative flex h-full min-h-0 flex-col overflow-hidden bg-sidebar";

/**
 * Shared radius for every center-stage surface (`rounded-xl` = `--radius-xl`).
 * Use this instead of hardcoded 12px so WebGL/canvas clips match the card.
 */
export const CENTER_STAGE_RADIUS_CLASS = "rounded-xl";
export const CENTER_STAGE_RADIUS_CSS = "var(--radius-xl)";

/** Inset a hover resize hairline so it does not run through rounded-xl corners. */
export const RESIZE_HAIRLINE_CORNER_INSET_CSS = CENTER_STAGE_RADIUS_CSS;

/**
 * Root sidebar↔center hairline. The handle spans the full column (card +
 * footer); the painted line stays on the floating card face only.
 */
export const ROOT_RESIZE_HAIRLINE_TOP_CSS = `calc(${CENTER_STAGE_GUTTER_Y_PX}px + ${CENTER_STAGE_RADIUS_CSS})`;
export const ROOT_RESIZE_HAIRLINE_BOTTOM_CSS = `calc(${APP_FOOTER_HEIGHT_PX}px + ${CENTER_STAGE_GUTTER_Y_PX}px + ${CENTER_STAGE_RADIUS_CSS})`;

/** Floating card: clip children to the radius and ring the inset stage. */
export const CENTER_STAGE_CARD_CLASS =
  "desktop-no-drag h-full min-h-0 overflow-hidden rounded-xl bg-background ring-1 ring-border/40";

/** Column above the center-stage footer — drawer insets and stage fullscreen fill this. */
export const CENTER_STAGE_BODY_ATTR = "data-center-stage-body";
/** Visual floating card inside the center-stage shell. */
export const CENTER_STAGE_CARD_ATTR = "data-center-stage-card";
/** Root row under the header: left sidebar + center + footer. */
export const APP_SHELL_PANEL_LAYOUT_ATTR = "data-app-shell-panel-layout";
/** Center column (stage + footer). Fullscreen must not pin to this — it includes the footer. */
export const APP_SHELL_CENTER_COLUMN_ATTR = "data-app-shell-center-column";
