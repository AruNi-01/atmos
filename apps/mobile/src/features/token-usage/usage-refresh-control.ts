/**
 * Token usage pull-to-refresh spinner.
 * Computer / All switches fetch in the background and must not set this —
 * `isFetching` / `isRefetching` would show iOS RefreshControl and shove the
 * page down ~80pt until the scoped query finishes.
 */
export function usageRefreshControlRefreshing(input: {
  isFetching?: boolean;
  isRefetching?: boolean;
  overview?: unknown;
  pullPending: boolean;
}) {
  return input.pullPending;
}
