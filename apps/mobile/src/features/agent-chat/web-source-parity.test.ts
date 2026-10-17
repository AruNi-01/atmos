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
    expect(group).toContain("const muted = chatMutedForeground(theme.isDark)");
    expect(group).toContain("<ExpandChevron color={muted} open={open} size={metrics.chevron} />");
    expect(group).toContain("const TOOL_GROUP_LIST_MARGIN_TOP = 2");
    expect(group).toContain("marginTop: TOOL_GROUP_LIST_MARGIN_TOP");
    expect(group).not.toContain("theme.colors.secondaryLabel");
    expect(tree).toContain("nextTreeWatermark");
    expect(tree).toContain("duration: TREE_DRAW_MS");
    expect(tree).toContain("Easing.bezier(0.23, 1, 0.32, 1)");
  });

  test("the assistant column is inset by half of 1rem", () => {
    const transcript = source("apps/mobile/src/features/agent-chat/AgentChatTranscript.tsx");
    expect(transcript).toContain("const ASSISTANT_COLUMN_INSET = 8");
    const turn = transcript.slice(
      transcript.indexOf("function AssistantTurn"),
      transcript.indexOf("const ChatMessage"),
    );
    const column = turn.slice(turn.indexOf("return ("), turn.indexOf("<ProcessFold"));
    expect(column).toContain("marginHorizontal: ASSISTANT_COLUMN_INSET");
    expect(column).not.toContain("gap:");
    expect(column).not.toContain('width: "100%"');
    const message = transcript.slice(transcript.indexOf("const ChatMessage"));
    expect(message).toContain("<UserMessage message={message} />");
    expect(message).toContain("marginHorizontal: ASSISTANT_COLUMN_INSET");
    expect(message).toContain("marginTop: 8");
    expect(transcript).not.toContain("stream-wait");
    expect(transcript).not.toContain("WaitForBlock");
    expect(transcript).not.toContain("Wait for ");
    expect(transcript).toContain('visibility === "subagent_wait"');
  });

  test("the transcript content uses the web py-4", () => {
    const transcript = source("apps/mobile/src/features/agent-chat/AgentChatTranscript.tsx");
    expect(transcript).toContain("const TRANSCRIPT_CONTENT_PAD_Y = 16");
    const list = transcript.slice(transcript.indexOf("contentContainerStyle"));
    expect(list).toContain("paddingTop: TRANSCRIPT_CONTENT_PAD_Y");
    expect(list).toContain("paddingBottom: paddingBottom + TRANSCRIPT_CONTENT_PAD_Y");
    expect(list).not.toContain("paddingTop: 12");
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
    expect(patch).toContain("kENRMWebCodePadX = 16.0");
    expect(patch).toContain("kENRMWebCodePadY = 12.0");
    expect(patch).toContain("CODE BLOCK");
    expect(patch).toContain("Streamdown quotes are `italic`");
    expect(patch).toContain('style:@"italic"');
    expect(patch).toContain("Streamdown links are font-medium");
    expect(patch).toContain('weight:@"500"');
    expect(patch).toContain("Streamdown strong is font-semibold");
    expect(patch).toContain('weight:@"600"');
    expect(patch).toContain("Agent chat table headers are font-semibold");
    expect(patch).toContain('isHeader ? @"600"');
    expect(patch).toContain("Web clears the first heading");
    expect(patch).toContain("A later heading keeps its top margin");
    expect(patch).toContain("Web cells are border-x-0 border-b");
    expect(patch).toContain("Web `[&>*:first-child]:mt-0` clears a leading rule");
    expect(patch).toContain("A trailing rule bakes marginBottom");
  });
});
