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

describe("usage scroll reset", () => {
  test("Computer / All identity change resets scroll and heatmap selection", () => {
    expect(screen).toContain("usageScopeKey");
    expect(screen).toContain("setSelectedDate(null)");
    expect(screen).toContain("usageScrollRef.current?.scrollTo({ animated: false, y: 0 })");
    expect(screen).toMatch(
      /useEffect\(\(\) => \{\s*usageScrollRef\.current\?\.scrollTo\(\{ animated: false, y: 0 \}\);\s*\}, \[selectedKey\]\);/,
    );
  });
});
