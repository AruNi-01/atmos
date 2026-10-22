// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import { darkColors, lightColors } from "@/theme/colors";
import { nativeSwitchSeedColor } from "./native-switch-tint";

const controls = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "native-controls.tsx"),
  "utf8",
);

describe("NativeSwitch seed", () => {
  test("uses green, not the label color, in both themes", () => {
    expect(nativeSwitchSeedColor(lightColors)).toBe(lightColors.green);
    expect(nativeSwitchSeedColor(darkColors)).toBe(darkColors.green);
    expect(nativeSwitchSeedColor(lightColors)).not.toBe(lightColors.label);
    expect(nativeSwitchSeedColor(darkColors)).not.toBe(darkColors.label);
  });

  test("NativeSwitch Host reads the green seed helper", () => {
    expect(controls).toContain("nativeSwitchSeedColor(theme.colors)");
    const switchHost = controls.slice(controls.indexOf("export function NativeSwitch"));
    expect(switchHost).not.toContain("seedColor={theme.colors.label}");
  });
});
