// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import { shouldUseLiquidGlass } from "../../ui/primitives/glass-availability";
import {
  COMPOSER_GLASS_CONTROL_RADIUS,
  COMPOSER_GLASS_CONTROL_SIZE,
  COMPOSER_GLASS_DOCK_RADIUS,
  COMPOSER_GLASS_WELL,
} from "./composer-glass";

const here = dirname(fileURLToPath(import.meta.url));

function source(relative: string): string {
  return readFileSync(join(here, relative), "utf8");
}

function listTsx(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir) as string[]) {
    if (name.endsWith(".tsx")) files.push(join(dir, name));
  }
  return files;
}

describe("composer glass tokens", () => {
  test("lane pills share the composer well size and native glass args", () => {
    expect(COMPOSER_GLASS_CONTROL_SIZE).toBe(36);
    expect(COMPOSER_GLASS_CONTROL_RADIUS).toBe(18);
    expect(COMPOSER_GLASS_DOCK_RADIUS).toBe(28);
    expect(COMPOSER_GLASS_WELL).toEqual({ interactive: true, shadow: false });
    const composer = source("AgentChatComposer.tsx");
    expect(composer).toContain("COMPOSER_GLASS_WELL");
    expect(composer).not.toContain("tintColor");
    expect(composer).not.toContain("glassTint");
  });
});

describe("Liquid Glass fallback", () => {
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
    expect(
      shouldUseLiquidGlass({
        apiAvailable: false,
        liquidGlassAvailable: true,
        reduceTransparency: false,
      }),
    ).toBe(false);
    expect(
      shouldUseLiquidGlass({
        apiAvailable: true,
        liquidGlassAvailable: false,
        reduceTransparency: false,
      }),
    ).toBe(false);
  });

  test("GlassPanel is the only expo-glass-effect owner and does not tint by default", () => {
    const panel = readFileSync(join(here, "../../ui/primitives/glass-panel.tsx"), "utf8");
    const reduceTransparency = readFileSync(
      join(here, "../../ui/primitives/use-reduce-transparency.ts"),
      "utf8",
    );
    expect(panel).toContain("shouldUseLiquidGlass");
    expect(panel).toContain("useReduceTransparencyEnabled");
    expect(reduceTransparency).toContain("isReduceTransparencyEnabled");
    expect(reduceTransparency).toContain("reduceTransparencyChanged");
    expect(panel).toContain("theme.colors.glassFallback");
    expect(panel).toContain("theme.colors.glassBorder");
    expect(panel).toContain("tintColor != null");
    expect(panel).toContain("{...(tintColor != null ? { tintColor } : null)}");
    expect(panel).toContain("style={[shadowStyle, styles.shape, style]}");
    expect(panel).not.toContain("glassTint");
    expect(panel).not.toContain("tintColor ?? theme.colors.glassTint");
    expect(panel).not.toContain("resolvedTintColor");
    const shapeStart = panel.indexOf("shape: {");
    expect(shapeStart).toBeGreaterThan(-1);
    const shapeEnd = panel.indexOf("},", shapeStart);
    expect(shapeEnd).toBeGreaterThan(shapeStart);
    expect(panel.slice(shapeStart, shapeEnd)).not.toContain("borderWidth");
    expect(panel).toContain("borderWidth: StyleSheet.hairlineWidth");
    const chatSources = [
      source("AgentChatComposer.tsx"),
      source("composer-pill-row.tsx"),
      source("scroll-pill.tsx"),
      source("cards/expanded-card.tsx"),
      ...listTsx(join(here, "cards")).map((path) => readFileSync(path, "utf8")),
    ];
    for (const text of chatSources) {
      expect(text).not.toContain("expo-glass-effect");
      expect(text).not.toContain("GlassView");
    }
  });
});

describe("card lane glass chrome", () => {
  test("title pills and the N below pill reuse COMPOSER_GLASS_WELL with label ink", () => {
    const pills = source("composer-pill-row.tsx");
    const below = source("scroll-pill.tsx");
    for (const text of [pills, below]) {
      expect(text).toContain("GlassPanel");
      expect(text).toContain("COMPOSER_GLASS_WELL");
      expect(text).toContain("COMPOSER_GLASS_CONTROL_SIZE");
      expect(text).toContain("COMPOSER_GLASS_CONTROL_RADIUS");
      expect(text).toContain("theme.colors.label");
      expect(text).toContain("opacity: pressed ? 0.6 : 1");
      expect(text).not.toContain("tintColor");
      expect(text).not.toContain("glassTint");
      expect(text).not.toContain("controlGlassTint");
      expect(text).not.toContain("glassFallback");
      expect(text).toContain('overflow: "visible"');
    }
    expect(pills).toContain("pill.selected ? theme.colors.label : theme.colors.secondaryLabel");
  });

  test("the expanded shell is the same GlassPanel well without tint or extra fill", () => {
    const expanded = source("cards/expanded-card.tsx");
    expect(expanded).toContain("GlassPanel");
    expect(expanded).toContain("COMPOSER_GLASS_WELL");
    expect(expanded).toContain("interactive={false}");
    expect(expanded).toContain("FadeIn");
    expect(expanded).toContain("FadeOut");
    expect(expanded).toContain("0.4");
    expect(expanded).not.toContain("cardElevated");
    expect(expanded).not.toContain("tintColor");
    expect(expanded).not.toContain("glassTint");
    expect(expanded).not.toContain("glassFallback");
    expect(expanded).not.toContain("glassFallbackStrong");
    const lane = source("cards/lane-body.tsx");
    for (const id of [
      "permission",
      "session_op",
      "plan",
      "background",
      "queue",
      "subagents",
      "goal",
      "workflow",
      "context",
    ]) {
      expect(lane).toContain(`case "${id}":`);
    }
    const thread = source("AgentChatThreadScreen.tsx");
    const preview = source("preview-chat-screen.tsx");
    expect(thread).toContain("<ExpandedCard");
    expect(thread).toContain("<LaneCardBody");
    expect(thread).toContain("<ComposerPillRow");
    expect(preview).toContain("<ExpandedCard");
    expect(preview).toContain("<LaneCardBody");
    expect(preview.indexOf("<ExpandedCard")).toBeLessThan(preview.indexOf("<LaneCardBody"));
    expect(thread.indexOf("<ExpandedCard")).toBeLessThan(thread.indexOf("<LaneCardBody"));
  });

  test("the composer dock is the same GlassPanel well, not a solid control plate", () => {
    const composer = source("AgentChatComposer.tsx");
    expect(composer).toContain("<GlassPanel");
    expect(composer).toContain("COMPOSER_GLASS_WELL");
    expect(composer).toContain("COMPOSER_GLASS_DOCK_RADIUS");
    expect(composer).toContain('backgroundColor: "transparent"');
    expect(composer).toContain("Math.abs(current - next) < 2");
    expect(composer).toContain("composerDockInputPadding");
    expect(composer).toContain("composerDockExpanded");
    expect(composer).toContain("LINE_HEIGHT * MAX_LINES");
    expect(composer).not.toContain("theme.colors.control");
    expect(composer).not.toContain("controlBorder");
    expect(composer).not.toContain("buttonStyle");
    expect(composer).not.toContain("@expo/ui/swift-ui");
    expect(composer).not.toContain("glassEffect(");
  });

  test("in-card actions use Expo UI glass buttons instead of solid control chips", () => {
    const buttons = readFileSync(
      join(here, "../../ui/primitives/glass-action-buttons.tsx"),
      "utf8",
    );
    expect(buttons).toContain("export function GlassTextButton");
    expect(buttons).toContain("disabled as disabledModifier");
    expect(buttons).toContain("iosGlassChipModifiers");
    expect(buttons).toContain("GLASS_CHIP_DISABLED_OPACITY");
    expect(buttons).toContain('buttonStyle("plain")');
    expect(buttons).toContain("glassEffect(");
    expect(buttons).toContain('controlSize("mini")');
    expect(buttons).toContain('buttonStyle("glass")');
    expect(buttons).toContain("foregroundStyle");
    expect(buttons).toMatch(/theme\.colors\.control(?!Border)/);
    expect(buttons).toContain("theme.colors.red");
    expect(buttons).toContain('role={role ?? "default"}');
    expect(buttons).toContain("accessibilityState: { disabled: input.isDisabled }");
    expect(buttons).toContain('name: "activate"');
    expect(buttons).toContain("onAccessibilityAction");
    expect(buttons).not.toContain('buttonStyle("bordered")');
    expect(buttons).not.toContain("tintColor");
    expect(buttons).not.toContain("GlassEffectContainer");
    const permission = source("AgentChatPermissionCard.tsx");
    const sessionOp = source("AgentChatSessionOpCard.tsx");
    const queue = source("cards/queue-card.tsx");
    for (const text of [permission, sessionOp, queue]) {
      expect(text).toContain("GlassTextButton");
      expect(text).not.toMatch(/theme\.colors\.control(?!Border)/);
      expect(text).not.toContain("mutedPressed");
      expect(text).not.toContain("GlassPanel");
      expect(text).not.toContain("buttonStyle");
    }
    expect(queue).toContain('role="destructive"');
    expect(queue).toContain("theme.colors.controlBorder");
  });

  test("card copy uses theme labels instead of hardcoded ink", () => {
    const files = [
      "cards/plan-card.tsx",
      "cards/queue-card.tsx",
      "cards/background-card.tsx",
      "cards/subagent-card.tsx",
      "cards/goal-card.tsx",
      "cards/workflow-card.tsx",
      "cards/context-card.tsx",
      "AgentChatPermissionCard.tsx",
      "AgentChatSessionOpCard.tsx",
    ];
    for (const file of files) {
      const text = source(file);
      if (file.includes("AgentChatSessionOpCard")) {
        expect(text).toContain("SESSION_OP_SKY");
        expect(text).toContain("theme.colors");
      } else {
        const hasThemeInk = /theme\.colors\.(label|secondaryLabel)/.test(text);
        const usesCardChrome = /CardHeader|CardStatusBadge|CardStatusRow|CardBulletRow/.test(text);
        expect(hasThemeInk || usesCardChrome).toBe(true);
      }
      expect(text).not.toContain('color: "#');
      expect(text).not.toContain("cardElevated");
      expect(text).not.toContain("GlassPanel");
    }
  });
});
