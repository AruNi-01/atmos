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
import { userMessageCollapsedLineLimit, userMessageWashColors } from "./user-message-fade";

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
  });

  test("the bubble is full width card chrome, not the old right-aligned bubble", () => {
    expect(source).toContain("theme.colors.cardSubtle");
    expect(source).toContain("borderRadius: 16");
    expect(source).toContain("paddingHorizontal: 16");
    expect(source).toContain("paddingVertical: 12");
    expect(source).toContain("fontSize: 14");
    expect(source).toContain("lineHeight: TEXT_LINE_HEIGHT");
    expect(source).toContain("const TEXT_LINE_HEIGHT = 20");
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
    expect(source).toContain("userMessageWashColors(theme.colors.cardSubtle)");
    expect(source).not.toContain("#242424");
    expect(source).not.toContain("#f2f1ef");
    expect(source).not.toContain("80%");
    expect(source).not.toContain("onLongPress");
  });
});
