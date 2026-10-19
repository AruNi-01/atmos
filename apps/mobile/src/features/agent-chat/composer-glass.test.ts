// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import { shouldUseLiquidGlass } from "../../ui/primitives/glass-availability";
import { COMPOSER_GLASS_CONTROL_RADIUS, COMPOSER_GLASS_CONTROL_SIZE } from "./composer-glass";

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
  test("lane pills share the composer well size", () => {
    expect(COMPOSER_GLASS_CONTROL_SIZE).toBe(36);
    expect(COMPOSER_GLASS_CONTROL_RADIUS).toBe(18);
    const composer = source("AgentChatComposer.tsx");
    expect(composer).toContain("COMPOSER_GLASS_CONTROL_SIZE");
    expect(composer).toContain("COMPOSER_GLASS_CONTROL_RADIUS");
    expect(composer).toContain("shadow={false}");
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

  test("GlassPanel is the only expo-glass-effect owner and watches Reduce Transparency", () => {
    const panel = readFileSync(join(here, "../../ui/primitives/glass-panel.tsx"), "utf8");
    expect(panel).toContain("shouldUseLiquidGlass");
    expect(panel).toContain("isReduceTransparencyEnabled");
    expect(panel).toContain("reduceTransparencyChanged");
    expect(panel).toContain("theme.colors.glassFallback");
    expect(panel).toContain("theme.colors.glassTint");
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
  test("title pills and the N below pill are GlassPanel wells with label ink", () => {
    const pills = source("composer-pill-row.tsx");
    const below = source("scroll-pill.tsx");
    for (const text of [pills, below]) {
      expect(text).toContain("GlassPanel");
      expect(text).toContain("shadow={false}");
      expect(text).toContain("COMPOSER_GLASS_CONTROL_SIZE");
      expect(text).toContain("COMPOSER_GLASS_CONTROL_RADIUS");
      expect(text).toContain("theme.colors.label");
      expect(text).toContain("opacity: pressed ? 0.6 : 1");
    }
    expect(pills).toContain("theme.colors.glassTint");
    expect(pills).toContain("theme.colors.controlGlassTint");
    expect(below).toContain("theme.colors.glassTint");
  });

  test("the expanded shell is GlassPanel and every lane body still mounts inside it", () => {
    const expanded = source("cards/expanded-card.tsx");
    expect(expanded).toContain("GlassPanel");
    expect(expanded).toContain("glassFallbackStrong");
    expect(expanded).toContain("theme.colors.glassTint");
    expect(expanded).toContain("shadow={false}");
    expect(expanded).toContain("FadeIn");
    expect(expanded).toContain("FadeOut");
    expect(expanded).toContain("0.4");
    expect(expanded).not.toContain("cardElevated");
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
      expect(text).toMatch(/theme\.colors\.(label|secondaryLabel)/);
      expect(text).not.toContain('color: "#');
      expect(text).not.toContain("cardElevated");
      expect(text).not.toContain("GlassPanel");
    }
  });
});
