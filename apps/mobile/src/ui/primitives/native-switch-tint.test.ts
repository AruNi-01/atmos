// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const controls = readFileSync(join(here, "native-controls.tsx"), "utf8");
const filters = readFileSync(
  join(here, "../../features/workspaces/WorkspaceFilterScreen.tsx"),
  "utf8",
);
const quota = readFileSync(
  join(here, "../../features/quota-usage/QuotaSettingsScreen.tsx"),
  "utf8",
);

describe("native switch appearance", () => {
  test("NativeSwitch follows the page scheme and does not tint the control", () => {
    const switchHost = controls.slice(controls.indexOf("export function NativeSwitch"));
    expect(switchHost).toContain("colorScheme={theme.colorScheme}");
    expect(switchHost).not.toContain("seedColor");
    expect(switchHost).not.toContain("nativeSwitchSeedColor");
    expect(controls).not.toContain("native-switch-tint");
  });

  test("React Native switches do not override track or thumb colors", () => {
    expect(filters).not.toContain("thumbColor");
    expect(filters).not.toContain("trackColor");
    expect(quota).not.toContain("trackColor");
    expect(quota).not.toContain("thumbColor");
  });
});
