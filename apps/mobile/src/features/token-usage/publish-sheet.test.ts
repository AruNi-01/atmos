// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "ShareSheet.tsx"),
  "utf8",
);

function publishPane(text: string) {
  const start = text.indexOf("function PublishPane");
  const end = text.indexOf("function StretchPublishButton");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end);
}

function prefixedField(text: string) {
  const start = text.indexOf("function PrefixedField");
  const end = text.indexOf("const styles = StyleSheet.create");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end);
}

describe("Publish sheet structure", () => {
  test("fields sit on the sheet without an outer publish card", () => {
    expect(source).not.toContain("publishCard");
    expect(publishPane(source)).not.toMatch(/<GlassPanel[\s\S]*styles\.pane/);
    expect(publishPane(source)).toContain("styles.publishPane");
  });

  test("Handle, X, and GitHub use GlassPanel capsules", () => {
    const field = prefixedField(source);
    expect(field).toContain("<GlassPanel shadow={false} style={styles.prefixed}>");
    expect(source).toContain("borderRadius: radii.pill");
    expect(field).toContain("framed={false}");
    expect(field).not.toContain("controlBorder");
    expect(field).not.toContain("backgroundColor: theme.colors.control");
  });

  test("primary and Turn off are stacked glass Host buttons", () => {
    expect(source).toContain("expoUiButtonHostStyle");
    expect(source).not.toContain("expoUiPrimaryStyle");
    expect(source).not.toContain("expoUiDangerStyle");
    expect(source).not.toContain("seedColor");
    expect(source).not.toContain('variant="text"');
    expect(source).not.toContain("expoUiButtonStretchModifiersFor");
    expect(source).toMatch(/publishActions:\s*\{[^}]*gap:\s*10/);
    expect(source).toMatch(/publishActions:\s*\{[^}]*flexShrink:\s*0/);
    expect(source).toMatch(/publishActions:\s*\{[^}]*paddingHorizontal:\s*8/);
    expect(source).not.toMatch(/publishActions:\s*\{[^}]*space-between/);
    expect(source).not.toMatch(/publishActions:\s*\{[^}]*flexDirection:\s*"row"/);
    const stretch = source.slice(source.indexOf("function StretchPublishButton"));
    expect(stretch).toContain("expoUiButtonHostStyle");
    expect(stretch).toContain("publishLabelModifiers(labelColor)");
    expect(source).toContain("foregroundStyle(color)");
    expect(stretch).toContain("expoUiButtonLabelStretchModifiers");
    expect(stretch).not.toContain("style={look.style}");
    const modifiers = source.slice(
      source.indexOf("function publishActionModifiers"),
      source.indexOf("function publishLabelModifiers"),
    );
    expect(modifiers).toContain('buttonStyle("glass")');
    expect(modifiers).not.toContain("buttonBorderShape");
    expect(modifiers).not.toContain("glassProminent");
    expect(modifiers).not.toMatch(/buttonStyle\("bordered/);
  });

  test("the share sheet is full height and publish actions follow the Public switch", () => {
    const pane = publishPane(source);
    const scrollEnd = pane.indexOf("</ScrollView>");
    const switchAt = pane.indexOf("<NativeSwitch");
    const actionsAt = pane.indexOf("{actions}");
    expect(source).toContain('const SHARE_SHEET_DETENTS = ["large"] as const');
    expect(source).not.toContain('"medium"');
    expect(pane).toContain("<ScrollView");
    expect(pane).toContain('keyboardShouldPersistTaps="handled"');
    expect(pane).toContain("automaticallyAdjustKeyboardInsets");
    expect(switchAt).toBeGreaterThan(-1);
    expect(actionsAt).toBeGreaterThan(switchAt);
    expect(actionsAt).toBeLessThan(scrollEnd);
    expect(pane).not.toContain("keyboardOpen");
    expect(source).toContain("liftForKeyboard={false}");
    expect(pane).toContain("styles.publishForm");
    expect(source).toMatch(/sheet:\s*\{[^}]*gap:\s*12/);
    expect(source).toMatch(/publishPane:\s*\{[^}]*minHeight:\s*0/);
    expect(source).toMatch(/publishButtonSlot:\s*\{[^}]*flexShrink:\s*0/);
    expect(source).toMatch(/publishButtonSlot:\s*\{[^}]*minHeight:\s*52/);
    expect(source).not.toMatch(/preview:\s*\{[^}]*margin/);
    expect(source).toContain(
      "backgroundColor: preview ? theme.colors.background : theme.colors.cardSubtle",
    );
    expect(source).toContain(
      "contentContainerStyle={{ backgroundColor: theme.colors.background }}",
    );
    expect(source).toMatch(/publicRow:\s*\{[^}]*paddingRight:\s*6/);
    expect(source).toMatch(/publicSwitch:\s*\{[^}]*flexShrink:\s*0/);
  });

  test("Turn off is below the primary and Public is the only switch", () => {
    const pane = publishPane(source);
    const primary = pane.indexOf("label={primaryLabel}");
    const turnOff = pane.indexOf("Turn off");
    expect(primary).toBeGreaterThan(-1);
    expect(turnOff).toBeGreaterThan(primary);
    expect(pane).toContain("<NativeSwitch");
    expect(pane.split("<NativeSwitch").length - 1).toBe(1);
  });
});
