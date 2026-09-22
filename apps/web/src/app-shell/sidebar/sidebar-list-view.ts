export type SidebarListView = "workspace" | "session";

/** Missing or unknown values stay on the workspace list. */
export function parseSidebarListView(value: unknown): SidebarListView {
  return value === "session" ? "session" : "workspace";
}
