// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import { toolTriggerMetrics } from "./tool-chrome";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = join(here, "../../../../..");

function source(path: string): string {
  return readFileSync(join(workspace, path), "utf8");
}

describe("web source parity", () => {
  test("tool triggers use the web text-sm metrics and a real staggered draw", () => {
    expect(toolTriggerMetrics).toEqual({
      fontSize: 14,
      lineHeight: 20,
      gap: 8,
      iconBox: 16,
      iconSize: 14,
      chevron: 14,
      padY: 2,
      bodyPadTop: 4,
    });
    const group = source("apps/mobile/src/features/agent-chat/tool-group.tsx");
    const tree = source("apps/mobile/src/features/agent-chat/tool-tree.tsx");
    expect(group).toContain("useToolTreeReveal");
    expect(group).toContain("index >= watermark");
    expect(group).toContain("delayMs={0}");
    expect(group).toContain("toolTriggerMetrics");
    expect(tree).toContain("nextTreeWatermark");
    expect(tree).toContain("duration: TREE_DRAW_MS");
    expect(tree).toContain("Easing.bezier(0.23, 1, 0.32, 1)");
  });

  test("the composer stays the two-row iOS field", () => {
    const composer = source("apps/mobile/src/features/agent-chat/AgentChatComposer.tsx");
    expect(composer).toContain('width: "100%"');
    expect(composer).toContain("paddingHorizontal: 16");
  });

  test("the markdown patch matches web inline code and the raw fence token", () => {
    const patch = source("patches/react-native-enriched-markdown@1.0.2.patch");
    expect(patch).toContain("kCodeBackgroundCornerRadius = 4.0");
    expect(patch).toContain("kCodeBackgroundPadX = 6.0");
    expect(patch).toContain("kCodeBackgroundPadY = 2.0");
    expect(patch).toContain("ENRMColorIsVisible");
    expect(patch).toContain("kInlineCodePadX = 6.0");
    expect(patch).toContain("language.uppercaseString");
    expect(patch).toContain("pointSize * 0.05");
    expect(patch).toContain("kENRMWebHeaderHeight = 36.0");
    expect(patch).toContain("kENRMWebHeaderPadX = 8.0");
    expect(patch).toContain("kENRMWebCodePad = 12.0");
    expect(patch).toContain("CODE BLOCK");
  });
});
