// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";

const screen = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "TokenUsageScreen.tsx"),
  "utf8",
);
const hook = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "use-token-usage-overview.ts"),
  "utf8",
);

describe("usage scroll reset", () => {
  test("Computer / All identity change resets heatmap selection without collapsing the large title", () => {
    expect(screen).toContain("usageScopeKey");
    expect(screen).toContain("setSelectedDate(null)");
    expect(screen).not.toContain("usageScrollRef.current?.scrollTo({ animated: false, y: 0 })");
    expect(screen).not.toMatch(/scrollTo\(\{\s*animated: false,\s*y:\s*0\s*\}\)/);
    expect(screen).toContain("overview={publishOverview}");
  });

  test("the overview hook keeps the previous payload while the next Computer loads", () => {
    expect(hook).toContain("pending: activeQuery.isPending");
    expect(hook).toContain("failed: activeQuery.isError");
    expect(hook).toContain("previous: heldOverview");
    expect(hook).toContain("publishOverview(activeQuery.data)");
    expect(hook).toContain("if (activeQuery.data && heldOverview !== activeQuery.data)");
    expect(hook).toContain("setHeldOverview(activeQuery.data)");
  });
});
