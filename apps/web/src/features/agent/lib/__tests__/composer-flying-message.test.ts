import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildComposerFlyingMessage } from "@/features/agent/lib/composer-flying-message";

describe("buildComposerFlyingMessage", () => {
  it("returns null without origin, target, or text", () => {
    expect(buildComposerFlyingMessage({
      id: 1,
      text: "hello",
      from: null,
      to: { x: 10, y: 20 },
    })).toBeNull();
    expect(buildComposerFlyingMessage({
      id: 1,
      text: "hello",
      from: { x: 10, y: 20 },
      to: null,
    })).toBeNull();
    expect(buildComposerFlyingMessage({
      id: 1,
      text: "   ",
      from: { x: 10, y: 20 },
      to: { x: 30, y: 40 },
    })).toBeNull();
  });

  it("collapses whitespace and truncates long prompts", () => {
    const message = buildComposerFlyingMessage({
      id: 7,
      text: "  hello   world  ",
      from: { x: 1, y: 2 },
      to: { x: 3, y: 4 },
    });
    expect(message).toEqual({
      id: 7,
      text: "hello world",
      from: { x: 1, y: 2 },
      to: { x: 3, y: 4 },
    });
    const long = buildComposerFlyingMessage({
      id: 8,
      text: "a".repeat(100),
      from: { x: 0, y: 0 },
      to: { x: 1, y: 1 },
    });
    expect(long?.text).toHaveLength(90);
    expect(long?.text.endsWith("...")).toBe(true);
  });
});

describe("composer flying message animation", () => {
  it("reuses the terminal fly trajectory without the input sweep", () => {
    const css = readFileSync(
      join(import.meta.dir, "../../components/composer-flying-message.css"),
      "utf8",
    );
    expect(css).toContain("@keyframes agentComposerFlyMessage");
    expect(css).toContain("scale(0.28)");
    expect(css).toContain("520ms cubic-bezier(0.22, 1, 0.36, 1)");
    expect(css).not.toContain("terminalAgentBlueSweep");
    expect(css).not.toContain("send-sweep");
  });

  it("aims at the transcript bottom pad without scrolling the conversation", () => {
    const source = readFileSync(
      join(import.meta.dir, "../composer-flying-message.ts"),
      "utf8",
    );
    expect(source).toContain("data-agent-chat-transcript-bottom-pad");
    expect(source).toContain("Always aim at the transcript bottom");
    expect(source).not.toContain("scrollIntoView");
    expect(source).not.toContain("scrollToBottom");
  });
});
