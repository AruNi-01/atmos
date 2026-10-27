// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("session header items", () => {
  test("Filter sits left of Settings: Filter is first, matching Workspace", () => {
    const source = readFileSync(join(here, "home-header-items.ts"), "utf8");
    const helper = source.slice(source.indexOf("export function sessionHeaderRightItems"));
    expect(helper).toContain("sessionFilterHeaderItem(onFilter, tintColor)");
    expect(helper).toContain("settingsHeaderItem(onSettings, tintColor)");
    expect(helper.indexOf("sessionFilterHeaderItem")).toBeLessThan(
      helper.indexOf("settingsHeaderItem"),
    );
    expect(source).toContain('name: "line.3.horizontal.decrease"');
  });

  test("Android headerRight lists Filter then Settings so Filter is on the left", () => {
    const layout = readFileSync(join(here, "../../../app/(home)/session/_layout.tsx"), "utf8");
    const android = layout.slice(layout.indexOf("headerRight: () =>"));
    const filter = android.indexOf('accessibilityLabel="Filter"');
    const settings = android.indexOf('accessibilityLabel="Settings"');
    expect(filter).toBeGreaterThan(0);
    expect(settings).toBeGreaterThan(filter);
    expect(layout).toContain("sessionHeaderRightItems");
    expect(layout).toContain('router.push("/session-filters")');
  });
});
