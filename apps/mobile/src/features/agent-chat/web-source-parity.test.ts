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
    expect(patch).toContain("ENRMWebCheckGlyphImage");
    expect(patch).toContain("ENRMDrawNamedFenceIcon");
    expect(patch).toContain('ENRMWebTemplateGlyph(@"copy")');
    expect(patch).toContain('ENRMWebTemplateGlyph(@"check")');
    expect(patch).toContain("text-green-900 / dark:text-green-400");
    expect(patch).toContain("green:(0x53 / 255.0) blue:(0x2D / 255.0)");
    expect(patch).toContain("green:(0xDE / 255.0) blue:(0x80 / 255.0)");
    expect(patch).toContain("(int64_t)(2 * NSEC_PER_SEC)");
    expect(patch).toContain("UIImageRenderingModeAlwaysTemplate");
    const addedLines = patch
      .split("\n")
      .filter((line) => line.startsWith("+") && !line.startsWith("+++"));
    expect(addedLines.join("\n")).not.toContain("doc.on.doc");
    expect(addedLines.join("\n")).not.toContain('@"99."');
    expect(patch).toContain("language.uppercaseString");
    expect(patch).toContain("pointSize * 0.05");
    expect(patch).toContain("kENRMWebHeaderHeight = 36.0");
    expect(patch).toContain("text-neutral-600 / dark:text-neutral-400");
    expect(patch).toContain("blue:(0x52 / 255.0) alpha:1");
    expect(patch).not.toContain("blue:(0x5B / 255.0)");
    expect(patch).toContain("kENRMWebHeaderPadX = 8.0");
    expect(patch).toContain("kENRMWebHeaderIcon = 16.0");
    expect(patch).toContain("kENRMWebHeaderIconGap = 8.0");
    expect(patch).toContain("ENRMDrawFenceIcon");
    expect(patch).not.toContain("new file mode");
    expect(patch).not.toContain("ENRMFenceIcons.h");
    expect(patch).toContain('@"file-diff"');
    expect(patch).toContain('if ([lang isEqualToString:@"typescript"]) return @"ts";');
    expect(patch).toContain("0.145, 0.388, 0.922");
    expect(patch).toContain("kENRMWebCodePadX = 16.0");
    expect(patch).toContain("kENRMWebCodePadY = 12.0");
    expect(patch).toContain("shiki-line-numbers");
    expect(patch).toContain("kENRMWebLineNumberSize = 12.0");
    expect(patch).toContain("kENRMWebLineNumberGapLeft = 4.0");
    expect(patch).toContain("kENRMWebLineNumberGapRight = 16.0");
    expect(patch).toContain("if (count < 2)");
    expect(patch).toContain("ENRMWebLineNumberStart");
    expect(patch).toContain("codeBlockLineNumberStart");
    expect(patch).toContain("lineNumberStart");
    expect(patch).toContain("--shiki-line-offset");
    expect(patch).toContain("start + index");
    expect(patch).toContain("green:(0x71 / 255.0) blue:(0x7B / 255.0)");
    expect(patch).toContain("green:(0x9F / 255.0) blue:(0xA9 / 255.0)");
    expect(patch).toContain("applyBaselineOffset(output, range)");
    expect(patch).toContain("applyBaselineOffset(output, nonListRange)");
    expect(patch).toContain("applyBaselineOffset(string, range)");
    expect(patch).toContain("ENRMWebCodeBaselineRaise");
    expect(patch).toContain("ENRMWebFenceUsesShiki");
    expect(patch).toContain("kENRMWebPlainCodePadX = 12.0");
    expect(patch).toContain("kENRMWebPlainCodeFont = 13.0");
    expect(patch).toContain("kENRMWebPlainCodeLine = 13.0 * 1.625 + 4.0");
    expect(patch).toContain("PlainTextWithLineNumbers");
    expect(patch).toContain('@"plaintext"');
    expect(patch).toContain("self.codeAscender - self.numberAscender + self.codeBaselineRaise");
    expect(patch).toContain("ENRMWebCodePaneHeight");
    expect(patch).toContain("bezierPathWithRoundedRect:paneRect cornerRadius:paneRadius");
    expect(patch).toContain("_scrollView.clipsToBounds = YES");
    expect(patch).not.toContain("UIRectCornerTopLeft");
    expect(patch).toContain("setCodeBlockMaxHeight");
    expect(patch).toContain("max-h-96");
    expect(patch).toContain("CODE BLOCK");
    expect(patch).toContain("Streamdown quotes are `italic`");
    expect(patch).toContain('style:@"italic"');
    expect(patch).toContain("Streamdown links are font-medium");
    expect(patch).toContain('weight:@"500"');
    expect(patch).toContain("Streamdown strong is font-semibold");
    expect(patch).toContain('weight:@"600"');
    expect(patch).toContain("Streamdown images are `max-w-full`");
    expect(patch).toContain("resolvedBoxWidthForLineWidth");
    expect(patch).toContain("intrinsicFit");
    expect(patch).toContain("One image pixel is one CSS pixel");
    expect(patch).toContain("Web task rows are `pl-0` with `gap-2` (8)");
    expect(patch).toContain("Streamdown ordered lists are `list-inside`");
    expect(patch).toContain("effectiveListMarginLeftForNumber:(NSInteger)number");
    expect(patch).toContain("effectiveListMarginLeftForNumber:currentPosition");
    expect(patch).toContain('stringWithFormat:@"%ld."');
    expect(patch).toContain("Agent chat table headers are font-semibold");
    expect(patch).toContain('isHeader ? @"600"');
    expect(patch).toContain("Web clears the first heading");
    expect(patch).toContain("A later heading keeps its top margin");
    expect(patch).toContain("Web cells are border-x-0 border-b");
    expect(patch).toContain("Web `[&>*:first-child]:mt-0` clears a leading rule");
    expect(patch).toContain("Equal sides are `my-6` and stay.");
    expect(patch).toContain("A trailing rule bakes marginBottom");
  });
});
