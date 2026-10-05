export type SidebarListView = "workspace" | "session";

/** Missing or unknown values stay on the workspace list. */
export function parseSidebarListView(value: unknown): SidebarListView {
  return value === "session" ? "session" : "workspace";
}

/**
 * A view the user already picked in this scope wins over the settings file.
 * The file read can resolve after that click, or be cancelled and retried.
 */
export function sidebarListViewToApply(
  saved: SidebarListView,
  userChoice: SidebarListView | null,
): SidebarListView {
  return userChoice ?? saved;
}
