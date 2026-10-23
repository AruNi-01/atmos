// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import { usageRefreshControlRefreshing } from "./usage-refresh-control";

const hook = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "use-token-usage-overview.ts"),
  "utf8",
);
const screen = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "TokenUsageScreen.tsx"),
  "utf8",
);

describe("usage RefreshControl", () => {
  test("only an explicit pull sets refreshing", () => {
    expect(usageRefreshControlRefreshing({ pullPending: true })).toBe(true);
    expect(
      usageRefreshControlRefreshing({
        isFetching: true,
        isRefetching: true,
        overview: null,
        pullPending: false,
      }),
    ).toBe(false);
  });

  test("Computer / All switches do not wire isRefetching into RefreshControl", () => {
    expect(hook).toContain("usageRefreshControlRefreshing({ pullPending: refresh.isPending })");
    expect(hook).not.toContain("refresh.isPending || activeQuery.isRefetching");
    expect(screen).toContain("refreshing={refreshing}");
    expect(screen).not.toContain("isFetching && overview == null");
  });
});
