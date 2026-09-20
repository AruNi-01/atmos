import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const view = readFileSync(join(import.meta.dir, "../AgentPartView.tsx"), "utf8");

describe("agent part markdown rendering", () => {
  it("renders thinking mermaid with the same markdown components as text", () => {
    expect(view).toContain("MessageResponse");
    expect(view).toContain("ReasoningContent");
    expect(view).toContain("components={reviewComponents as never}");
    expect(view).toContain("linkSafety={CONVERSATION_LINK_SAFETY}");
    const thinkingAt = view.indexOf('part.type === "thinking"');
    const thinkingComponentsAt = view.indexOf(
      "components={reviewComponents as never}",
      thinkingAt,
    );
    const thinkingLinkSafetyAt = view.indexOf(
      "linkSafety={CONVERSATION_LINK_SAFETY}",
      thinkingAt,
    );
    expect(thinkingAt).toBeGreaterThan(-1);
    expect(thinkingComponentsAt).toBeGreaterThan(thinkingAt);
    expect(thinkingLinkSafetyAt).toBeGreaterThan(thinkingAt);
  });

  it("renders failed-turn errors as a sentence-case alert card, not markdown", () => {
    const cardAt = view.indexOf("border-destructive/30");
    expect(cardAt).toBeGreaterThan(-1);
    expect(view).toContain("TriangleAlert");
    expect(view.slice(cardAt - 250, cardAt + 200)).not.toContain("MessageResponse");
  });

  it("shows the session create error text instead of hiding it in a tooltip", () => {
    expect(view).toContain("failedDetail");
    expect(view).toContain("${label}: ${failedDetail}");
  });

  it("renders historic permission parts as read-only cards", () => {
    expect(view).toContain("useHistoricPermissionParts");
    expect(view).toContain("readOnly");
    expect(view).toContain('onRespond={() => {}}');
  });

  it("hides live plan-mode chrome that already lives above the composer", () => {
    expect(view).toContain("isHiddenTranscriptChromePart");
  });

  it("streams each text and thinking part from closed_at, not last-block position", () => {
    expect(view).toContain("foldedPartIsOpen");
    expect(view).toContain("isAnimating={open}");
    expect(view).toContain("isStreaming={open}");
    expect(view).not.toContain("isLastTextBlock");
    expect(view).not.toContain("isCurrentlyThinking");
    expect(view).not.toContain("index === parts.length - 1");
    expect(view).not.toContain("assistant_message_delta");
    expect(view).not.toContain("thinking_delta");
    expect(view).not.toContain("mergeStreamDelta");
  });
});
