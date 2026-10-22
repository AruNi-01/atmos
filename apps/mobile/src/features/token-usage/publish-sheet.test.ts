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

  test("primary and Turn off are stacked stretch Host buttons", () => {
    expect(source).toContain("expoUiButtonHostStyle");
    expect(source).toContain("expoUiButtonStretchModifiers");
    expect(source).toContain("expoUiPrimaryStyle");
    expect(source).toContain("expoUiDangerStyle");
    expect(source).toContain("variant={look.variant}");
    expect(source).not.toContain('variant="text"');
    expect(source).toMatch(/publishActions:\s*\{[^}]*gap:\s*10/);
    expect(source).not.toMatch(/publishActions:\s*\{[^}]*space-between/);
    expect(source).not.toMatch(/publishActions:\s*\{[^}]*flexDirection:\s*"row"/);
    const stretch = source.slice(source.indexOf("function StretchPublishButton"));
    expect(stretch).toContain("style={expoUiButtonHostStyle}");
    expect(stretch).toMatch(/<Button[\s\S]*modifiers=\{expoUiButtonStretchModifiers\}/);
  });

  test("Turn off is below the primary and Public is the only switch", () => {
    const pane = publishPane(source);
    const primary = pane.indexOf("primaryLook");
    const turnOff = pane.indexOf("turnOffLook");
    expect(primary).toBeGreaterThan(-1);
    expect(turnOff).toBeGreaterThan(primary);
    expect(pane).toContain("<NativeSwitch");
    expect(pane.split("<NativeSwitch").length - 1).toBe(1);
  });
});
