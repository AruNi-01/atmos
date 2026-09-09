import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "conversation.tsx"), "utf8");

describe("ConversationScrollButton", () => {
  it("slides in and out from below instead of mounting instantly", () => {
    const button = source.slice(
      source.indexOf("export const ConversationScrollButton"),
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
    expect(button).toContain('size="icon"');
    expect(button).toContain("rounded-full");
    expect(button).toContain('variant="secondary"');
    expect(button).toContain("border-transparent");
    expect(button).not.toContain('variant="outline"');
    expect(button).not.toContain("bg-background");
    expect(button).not.toContain("!isAtBottom &&");
  });
});
