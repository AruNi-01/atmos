import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "conversation.tsx"), "utf8");

describe("ConversationScrollButton", () => {
  it("slides in and out from below instead of mounting instantly", () => {
    const button = source.slice(
      source.indexOf("function ConversationScrollButtonControl"),
      source.indexOf("export interface ConversationMessage"),
    );

    expect(button).toContain("AnimatePresence");
    expect(button).toContain("spring.moderate");
    expect(button).toContain("y: 36");
    expect(button).toContain("useReducedMotion");
    expect(button).toContain("createPortal");
    expect(button).toContain("host");
    expect(button).toContain("[data-agent-chat-scroll-button-host]");
    expect(button).toContain("data-agent-chat-scroll-to-bottom");
    expect(button).toContain('size="sm"');
    expect(button).toContain("min-w-8");
    expect(button).toContain("rounded-full");
    expect(button).toContain('variant="secondary"');
    expect(button).toContain("border-border");
    expect(button).toContain("overflow-hidden");
    expect(button).toContain("SPRING_LAYOUT");
    expect(button).toContain("ResizeObserver");
    expect(button).toContain("useEffect");
    expect(button).toContain("SCROLL_BUTTON_ICON_SIZE");
    expect(button).toContain("animate={{ width }}");
    expect(button).toContain("[&_svg]:mx-0!");
    expect(button).toContain("has-[[data-agent-chat-scroll-below]]:justify-start");
    expect(button).not.toContain("border-transparent");
    expect(button).not.toContain("animate={width == null ? undefined : { width }}");
    expect(button).not.toContain('size="icon"');
    expect(button).not.toContain('variant="outline"');
    expect(button).not.toContain("bg-background");
    expect(button).not.toContain("!isAtBottom &&");
  });
});
