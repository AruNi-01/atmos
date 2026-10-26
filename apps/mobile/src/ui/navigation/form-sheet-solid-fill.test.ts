// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import { getMobileThemeColors } from "@/theme/colors";

const here = dirname(fileURLToPath(import.meta.url));
const mobile = join(here, "../../..");
const repoRoot = join(mobile, "../..");

const FORM_SHEET_SCREENS = [
  "quota-settings",
  "settings",
  "sign-in",
  "workspace-filters",
  "workspaces",
  "create-workspace",
] as const;

function opaqueHex(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color);
}

function screenOptions(source: string, name: string): string {
  const marker = `name="${name}"`;
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const optionsStart = source.indexOf("options={{", start);
  expect(optionsStart).toBeGreaterThan(start);
  const end = source.indexOf("/>", optionsStart);
  expect(end).toBeGreaterThan(optionsStart);
  return source.slice(optionsStart, end);
}

describe("iOS form-sheet solid fill contract", () => {
  test("pins the screens patch that copies contentStyle onto backgroundEffect", () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      patchedDependencies: Record<string, string>;
    };
    expect(pkg.patchedDependencies["react-native-screens@4.25.2"]).toBe(
      "patches/react-native-screens@4.25.2.patch",
    );

    const patch = readFileSync(join(repoRoot, "patches/react-native-screens@4.25.2.patch"), "utf8");
    expect(patch).toContain("applySolidSheetFill");
    expect(patch).toContain("[UIColorEffect effectWithColor:fill]");
    expect(patch).toContain("@available(iOS 26.1, *)");
    expect(patch).toContain("updateFormSheetPresentationStyle");
    expect(patch).toContain("_controller.transitionCoordinator == nil");
    expect(patch).toContain("[self applySolidSheetFill:_controller.sheetPresentationController]");
  });

  test("form-sheet routes keep an opaque contentStyle the patch can copy", () => {
    const layout = readFileSync(join(mobile, "app/_layout.tsx"), "utf8");
    expect(layout).toContain('const sheetPresentation = isIos ? "formSheet" : "modal"');
    expect(layout).toContain(
      "const sheetContentStyle = { backgroundColor: theme.colors.sheetBackground }",
    );
    expect(layout).not.toContain("sheetBackgroundEffect");

    for (const name of FORM_SHEET_SCREENS) {
      const options = screenOptions(layout, name);
      expect(options).toContain("presentation: sheetPresentation");
      expect(options).not.toContain("sheetBackgroundEffect");
      const usesSharedSheetFill = options.includes("contentStyle: sheetContentStyle");
      const usesInlineFill =
        options.includes("contentStyle:") && options.includes("backgroundColor:");
      expect(usesSharedSheetFill || usesInlineFill).toBe(true);
    }

    expect(screenOptions(layout, "sign-in")).toContain(
      'theme.isDark ? theme.colors.cardElevated : "#0a0a0b"',
    );
  });

  test("nested sheet stacks and sign-in keep the same opaque fill", () => {
    const settings = readFileSync(join(mobile, "app/settings/_layout.tsx"), "utf8");
    const filters = readFileSync(join(mobile, "app/workspace-filters/_layout.tsx"), "utf8");
    const signIn = readFileSync(join(mobile, "app/sign-in.tsx"), "utf8");
    expect(settings).toContain("contentStyle: { backgroundColor: theme.colors.sheetBackground }");
    expect(filters).toContain("contentStyle: { backgroundColor: theme.colors.sheetBackground }");
    expect(signIn).toContain('theme.isDark ? theme.colors.cardElevated : "#0a0a0b"');
    expect(signIn).toContain("contentStyle:");
  });

  test("sheet theme tokens are opaque hex, which the patch requires", () => {
    for (const scheme of ["light", "dark"] as const) {
      const colors = getMobileThemeColors(scheme);
      expect(opaqueHex(colors.sheetBackground)).toBe(true);
      expect(opaqueHex(colors.cardElevated)).toBe(true);
    }
    expect(opaqueHex("#0a0a0b")).toBe(true);
  });

  test("the keep-patch note tracks the upstream issue and PRs", () => {
    const note = readFileSync(join(repoRoot, "patches/react-native-screens@4.25.2.md"), "utf8");
    expect(note).toContain("Decision:** keep this patch");
    expect(note).toContain("software-mansion/react-native-screens/issues/4605");
    expect(note).toContain("software-mansion/react-native-screens/pull/4986");
    expect(note).toContain("software-mansion/react-native-screens/pull/5007");
    expect(note).toContain("sheetBackgroundEffect");
  });
});
