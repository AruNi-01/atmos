// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import { USER_MESSAGE_COLLAPSE_LINES } from "@atmos/agent-transcript";
import {
  attachmentChipLabel,
  isPendingPhoneUserEcho,
  userMessageDisplayText,
  userMessageIsCollapsed,
} from "./copy";
import {
  USER_ATTACHMENT_BORDER_DARK,
  USER_ATTACHMENT_BORDER_LIGHT,
  USER_ATTACHMENT_CHIP_RADIUS,
  USER_ATTACHMENT_FILL_DARK,
  USER_ATTACHMENT_FILL_LIGHT,
  USER_ATTACHMENT_ICON_DARK,
  USER_ATTACHMENT_ICON_LIGHT,
  USER_ATTACHMENT_ICON_PX,
  USER_ATTACHMENT_LABEL_DARK,
  USER_ATTACHMENT_LABEL_LIGHT,
  USER_ATTACHMENT_MAX_WIDTH,
  userAttachmentBorder,
  userAttachmentChipMetrics,
  userAttachmentDensity,
  userAttachmentFill,
  userAttachmentIconColor,
  userAttachmentLabelColor,
  userAttachmentListGap,
  userAttachmentPressGrows,
} from "./user-attachment-chip";
import {
  splitUserMessageHttpUrls,
  USER_LINK_DECORATION_DARK,
  USER_LINK_DECORATION_LIGHT,
  userMessageLinkDecoration,
} from "./user-message-link";
import {
  USER_BUBBLE_RADIUS,
  userBubbleFill,
  userMessageCollapsedLineLimit,
  userMessageWashColors,
} from "./user-message-fade";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "user-message.tsx"),
  "utf8",
);

describe("user message", () => {
  test("pending echo is a user id with the pending prefix", () => {
    expect(isPendingPhoneUserEcho({ role: "user", id: "pending:1" })).toBe(true);
    expect(isPendingPhoneUserEcho({ role: "user", id: "msg-1" })).toBe(false);
    expect(isPendingPhoneUserEcho({ role: "assistant", id: "pending:1" })).toBe(false);
  });

  test("attachment chips use the name, otherwise the path basename", () => {
    expect(attachmentChipLabel({ name: " notes.md ", path: "/tmp/other.txt" })).toBe("notes.md");
    expect(attachmentChipLabel({ name: "  ", path: "C:\\docs\\plan.md" })).toBe("plan.md");
    expect(attachmentChipLabel({ path: "readme" })).toBe("readme");
  });

  test("an http address splits out of the message and keeps trailing punctuation", () => {
    expect(splitUserMessageHttpUrls("see https://example.com/a, thanks")).toEqual([
      { type: "text", value: "see " },
      { type: "url", url: "https://example.com/a" },
      { type: "text", value: ", thanks" },
    ]);
    expect(splitUserMessageHttpUrls("see https://example.com.")).toEqual([
      { type: "text", value: "see " },
      { type: "url", url: "https://example.com/" },
      { type: "text", value: "." },
    ]);
    expect(splitUserMessageHttpUrls("hello")).toEqual([{ type: "text", value: "hello" }]);
    expect(splitUserMessageHttpUrls("javascript:alert(1)")).toEqual([
      { type: "text", value: "javascript:alert(1)" },
    ]);
    expect(userMessageLinkDecoration(false)).toBe(USER_LINK_DECORATION_LIGHT);
    expect(userMessageLinkDecoration(true)).toBe(USER_LINK_DECORATION_DARK);
    expect(USER_LINK_DECORATION_LIGHT).toBe("rgba(9, 9, 11, 0.4)");
    expect(USER_LINK_DECORATION_DARK).toBe("rgba(250, 250, 250, 0.4)");
  });

  test("paste tokens stay literal because the phone has no registry", () => {
    expect(userMessageDisplayText("see [#paste:abc] now")).toBe("see [#paste:abc] now");
  });

  test("collapses only past the shared three-line limit", () => {
    expect(USER_MESSAGE_COLLAPSE_LINES).toBe(3);
    expect(userMessageIsCollapsed(3, false)).toBe(false);
    expect(userMessageIsCollapsed(4, false)).toBe(true);
    expect(userMessageIsCollapsed(4, true)).toBe(false);
    expect(userMessageCollapsedLineLimit()).toBe(4);
  });

  test("washes the fading line into the bubble instead of black", () => {
    expect(userMessageWashColors("rgba(10, 10, 11, 0.05)")).toEqual([
      "rgba(10, 10, 11, 0)",
      "rgba(10, 10, 11, 0.05)",
    ]);
    expect(userMessageWashColors("rgba(255, 255, 255, 0.08)")).toEqual([
      "rgba(255, 255, 255, 0)",
      "rgba(255, 255, 255, 0.08)",
    ]);
    expect(userMessageWashColors("rgb(1, 2, 3)")).toEqual(["rgba(1, 2, 3, 0)", "rgba(1, 2, 3, 1)"]);
    expect(userBubbleFill(false)).toBe("#dedee0");
    expect(userBubbleFill(true)).toBe("#27272a");
    expect(USER_BUBBLE_RADIUS).toBe(18);
    expect(userMessageWashColors(userBubbleFill(false))).toEqual([
      "rgba(222, 222, 224, 0)",
      "rgba(222, 222, 224, 1)",
    ]);
    expect(userMessageWashColors(userBubbleFill(true))).toEqual([
      "rgba(39, 39, 42, 0)",
      "rgba(39, 39, 42, 1)",
    ]);
  });

  test("the bubble is full width card chrome, not the old right-aligned bubble", () => {
    expect(source).toContain("userBubbleFill(theme.isDark)");
    expect(source).toContain("borderRadius: USER_BUBBLE_RADIUS");
    expect(source).toContain("paddingHorizontal: 16");
    expect(source).toContain("paddingVertical: 12");
    expect(source).toContain("fontSize: 14");
    expect(source).toContain("lineHeight: TEXT_LINE_HEIGHT");
    expect(source).toContain("chatForeground(theme.isDark)");
    expect(source).toContain("chatMutedForeground(theme.isDark)");
    expect(source).toContain("const TEXT_LINE_HEIGHT = 21");
    expect(source).toContain("opacity: pending ? 0.65 : 1");
    expect(source).toContain('width: "100%"');
    expect(source).toContain("formatUserMessageTime");
    expect(source).toContain("copy.copyUserAria");
    expect(source).toContain("CopyMessageButton");
    expect(source).toContain("agentChatUserBodyExpandKey");
    expect(source).toContain("agentChatUserMetaExpandKey");
    expect(source).toContain("userMetaHeightMotion");
    expect(source).toContain("userMetaItemMotion");
    expect(source).toContain("USER_META_LIFT_PX");
    expect(source).toContain("userMessageCollapsedLineLimit");
    expect(source).toContain("userMessageWashColors(userBubbleFill(theme.isDark))");
    expect(source).not.toContain("#242424");
    expect(source).not.toContain("#f2f1ef");
    expect(source).not.toContain("80%");
    expect(source).not.toContain("onLongPress");
  });

  test("attachment chips use the web file pill", () => {
    expect(userAttachmentDensity(false)).toBe("compact");
    expect(userAttachmentDensity(true)).toBe("composer");
    expect(userAttachmentPressGrows(1, false)).toBe(true);
    expect(userAttachmentPressGrows(1, true)).toBe(false);
    expect(userAttachmentPressGrows(0, false)).toBe(false);
    expect(userAttachmentListGap("compact")).toBe(6);
    expect(userAttachmentListGap("composer")).toBe(8);
    expect(userAttachmentChipMetrics("compact")).toEqual({
      fontSize: 12,
      height: 28,
      lineHeight: 16,
    });
    expect(userAttachmentChipMetrics("composer")).toEqual({
      fontSize: 13,
      height: 32,
      lineHeight: 20,
    });
    expect(USER_ATTACHMENT_CHIP_RADIUS).toBe(999);
    expect(USER_ATTACHMENT_ICON_PX).toBe(14);
    expect(USER_ATTACHMENT_MAX_WIDTH).toBe(256);
    expect(USER_ATTACHMENT_FILL_LIGHT).toBe("rgba(222, 222, 224, 0.4)");
    expect(USER_ATTACHMENT_FILL_DARK).toBe("rgba(39, 39, 42, 0.4)");
    expect(USER_ATTACHMENT_BORDER_LIGHT).toBe("rgba(0, 0, 0, 0.07)");
    expect(USER_ATTACHMENT_BORDER_DARK).toBe("rgba(255, 255, 255, 0.07)");
    expect(USER_ATTACHMENT_LABEL_LIGHT).toBe("rgba(9, 9, 11, 0.9)");
    expect(USER_ATTACHMENT_LABEL_DARK).toBe("rgba(250, 250, 250, 0.9)");
    expect(USER_ATTACHMENT_ICON_LIGHT).toBe("#71717b");
    expect(USER_ATTACHMENT_ICON_DARK).toBe("#9f9fa9");
    expect(userAttachmentFill(false)).toBe(USER_ATTACHMENT_FILL_LIGHT);
    expect(userAttachmentFill(true)).toBe(USER_ATTACHMENT_FILL_DARK);
    expect(userAttachmentBorder(false)).toBe(USER_ATTACHMENT_BORDER_LIGHT);
    expect(userAttachmentBorder(true)).toBe(USER_ATTACHMENT_BORDER_DARK);
    expect(userAttachmentLabelColor(false)).toBe(USER_ATTACHMENT_LABEL_LIGHT);
    expect(userAttachmentLabelColor(true)).toBe(USER_ATTACHMENT_LABEL_DARK);
    expect(userAttachmentIconColor(false)).toBe(USER_ATTACHMENT_ICON_LIGHT);
    expect(userAttachmentIconColor(true)).toBe(USER_ATTACHMENT_ICON_DARK);

    const body = source.slice(source.indexOf("export function UserMessage"));
    expect(body).toContain("userAttachmentPressGrows(attachments.length, expanded)");
    expect(body).toContain("if (opensBody) setExpanded(true)");
    expect(body).toContain("!expanded && lineCount > USER_MESSAGE_COLLAPSE_LINES");
    expect(body).toContain("if (hasMeta) setMetaOpen(!metaOpen)");
    expect(body).toContain("disabled={!hasMeta && !opensBody}");
    expect(body).toContain("sentPasteDisplay(text)");
    expect(body).toContain("showPasteChips");
    expect(body).toContain("pasteChipLabel(segment.lineCount)");
    expect(body).toContain("ClipboardIcon");
    expect(body).toContain('fontWeight: "500"');
    expect(body).toContain("PASTE_CHIP_HEIGHT");
    expect(body).toContain("<UserMessageLinkedText");
    const linked = source.slice(
      source.indexOf("function UserMessageLinkedText"),
      source.indexOf("export function UserMessage"),
    );
    expect(linked).toContain("splitUserMessageHttpUrls");
    expect(linked).toContain("Linking.openURL");
    expect(linked).toContain('textDecorationStyle: "dashed"');
    expect(linked).toContain("userMessageLinkDecoration");
    expect(body).not.toContain("ChevronDownIcon");
    expect(body).not.toContain("ChevronUpIcon");
    const chips = source.slice(source.indexOf("function UserAttachmentChips"));
    expect(chips).toContain("userAttachmentDensity(expanded)");
    expect(chips).toContain("userAttachmentFill(theme.isDark)");
    expect(chips).toContain("userAttachmentBorder(theme.isDark)");
    expect(chips).toContain("userAttachmentLabelColor(theme.isDark)");
    expect(chips).toContain("userAttachmentIconColor(theme.isDark)");
    expect(chips).toContain("borderWidth: 1");
    expect(chips).toContain("numberOfLines={1}");
    expect(chips).toContain("<File");
    expect(chips).not.toContain("theme.colors.control");
    expect(chips).not.toContain("glassBorder");
    expect(chips).not.toContain("hairlineWidth");
  });
});
