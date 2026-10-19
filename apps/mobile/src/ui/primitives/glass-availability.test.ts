// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import { shouldUseLiquidGlass } from "./glass-availability";

const here = dirname(fileURLToPath(import.meta.url));

describe("glass availability", () => {
  test("iOS 26 glass stays on only when the API exists and transparency is allowed", () => {
    expect(
      shouldUseLiquidGlass({
        apiAvailable: true,
        liquidGlassAvailable: true,
        reduceTransparency: false,
      }),
    ).toBe(true);
    expect(
      shouldUseLiquidGlass({
        apiAvailable: true,
        liquidGlassAvailable: true,
        reduceTransparency: true,
      }),
    ).toBe(false);
  });

  test("GlassPanel and chips share one Reduce Transparency hook", () => {
    const hook = readFileSync(join(here, "use-reduce-transparency.ts"), "utf8");
    const panel = readFileSync(join(here, "glass-panel.tsx"), "utf8");
    const chips = readFileSync(join(here, "glass-action-buttons.tsx"), "utf8");
    expect(hook).toContain("export function useReduceTransparencyEnabled");
    expect(hook).toContain("isReduceTransparencyEnabled");
    expect(hook).toContain("reduceTransparencyChanged");
    expect(panel).toContain('from "./use-reduce-transparency"');
    expect(chips).toContain('from "./use-reduce-transparency"');
    expect(panel).not.toContain("function useReduceTransparencyEnabled");
    expect(chips).not.toContain("function useReduceTransparencyEnabled");
  });
});
