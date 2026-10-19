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
    const log = source("apps/web/src/features/agent/components/boardui/agent-log.tsx");
    expect(group).toContain("useToolTreeReveal");
    expect(group).toContain("index >= watermark");
    expect(group).not.toContain("delayMs=");
    expect(group).toContain("toolTriggerMetrics");
    expect(tree).toContain("nextTreeWatermark");
    expect(tree).toContain("LOG_ROW_ELBOW_MS");
    expect(tree).toContain("LOG_ROW_TRUNK_MS");
    expect(tree).toContain("Easing.linear");
    expect(log).toContain("duration: 0.14");
    expect(log).toContain("delay: first ? 0 : 0.12");
    expect(log).toContain('ease: "linear"');
  });

  test("the composer source still calls the compact/expand dock helpers", () => {
    const composer = source("apps/mobile/src/features/agent-chat/AgentChatComposer.tsx");
    expect(composer).toContain('width: "100%"');
    expect(composer).toContain("composerDockExpanded");
    expect(composer).toContain("composerDockInputPadding");
    expect(composer).toContain("onFocus={() => setFocused(true)}");
  });

  test("the markdown patch matches web inline code and the raw fence token", () => {
    const patch = source("patches/react-native-enriched-markdown@1.0.2.patch");
    expect(patch).toContain("kCodeBackgroundCornerRadius = 4.0");
    expect(patch).toContain("kCodeBackgroundPadX = 6.0");
    expect(patch).toContain("kCodeBackgroundPadY = 2.0");
    expect(patch).toContain("ENRMColorIsVisible");
    expect(patch).toContain("kInlineCodePadX = 6.0");
    expect(patch).toContain("Stop at that glyph");
    expect(patch).toContain("finalRect.size.width += left;");
    expect(patch).not.toContain("left + kCodeBackgroundPadX");
    expect(patch).toContain("kENRMWebCopyGlyph = 14.0");
    expect(patch).toContain("ENRMWebCopyGlyphImage");
    expect(patch).toContain("UIImageRenderingModeAlwaysTemplate");
    expect(patch).toContain("language.uppercaseString");
    expect(patch).toContain("pointSize * 0.05");
    expect(patch).toContain("kENRMWebHeaderHeight = 36.0");
    expect(patch).toContain("kENRMWebHeaderPadX = 8.0");
    expect(patch).toContain("kENRMWebCodePad = 12.0");
    expect(patch).toContain("CODE BLOCK");
    expect(patch).toContain("outer rounded border plus horizontal row rules");
    expect(patch).toContain("[&_tr:last-child>td]:border-b-0");
    expect(patch).toContain("bezierPathWithRoundedRect:CGRectInset(tableRect");
    expect(patch).toContain(
      "-      UIBezierPath *border = [UIBezierPath bezierPathWithRect:cellRect]",
    );
  });
});
