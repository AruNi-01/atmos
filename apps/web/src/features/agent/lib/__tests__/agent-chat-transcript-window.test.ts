import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AGENT_CHAT_ASSISTANT_MERMAID_ROW_ESTIMATE,
  AGENT_CHAT_ASSISTANT_ROW_ESTIMATE,
  AGENT_CHAT_MERMAID_KEEPALIVE,
  AGENT_CHAT_OVERLAY_PAD_SHRINK_MS,
  AGENT_CHAT_SCROLL_CLASS,
  AGENT_CHAT_TRANSCRIPT_BASE_BOTTOM_PAD_PX,
  AGENT_CHAT_TRANSCRIPT_GAP,
  AGENT_CHAT_TRANSCRIPT_OVERSCAN,
  AGENT_CHAT_USER_ROW_ESTIMATE,
  agentMessageHasMermaid,
  estimateAgentChatMessageSize,
  estimateTranscriptInitialOffset,
  estimateTranscriptTotalSize,
  measureTranscriptScrollMargin,
  mergeMermaidKeepAliveRange,
  transcriptBottomPadPx,
  transcriptBottomPadStyle,
} from "@/features/agent/lib/agent-chat-transcript-window";

describe("estimateAgentChatMessageSize", () => {
  it("uses a shorter estimate for user prompts than assistant turns", () => {
    expect(estimateAgentChatMessageSize("user")).toBe(AGENT_CHAT_USER_ROW_ESTIMATE);
    expect(estimateAgentChatMessageSize("assistant")).toBe(AGENT_CHAT_ASSISTANT_ROW_ESTIMATE);
    expect(estimateAgentChatMessageSize("assistant", true)).toBe(
      AGENT_CHAT_ASSISTANT_MERMAID_ROW_ESTIMATE,
    );
    expect(AGENT_CHAT_USER_ROW_ESTIMATE).toBeLessThan(AGENT_CHAT_ASSISTANT_ROW_ESTIMATE);
    expect(AGENT_CHAT_ASSISTANT_ROW_ESTIMATE).toBeLessThan(
      AGENT_CHAT_ASSISTANT_MERMAID_ROW_ESTIMATE,
    );
  });
});

describe("transcriptBottomPadPx", () => {
  it("adds measured above-composer overlay height to the base spacer", () => {
    expect(transcriptBottomPadPx(0)).toBe(AGENT_CHAT_TRANSCRIPT_BASE_BOTTOM_PAD_PX);
    expect(transcriptBottomPadPx(120)).toBe(AGENT_CHAT_TRANSCRIPT_BASE_BOTTOM_PAD_PX + 120);
    expect(transcriptBottomPadPx(-8)).toBe(AGENT_CHAT_TRANSCRIPT_BASE_BOTTOM_PAD_PX);
    expect(transcriptBottomPadPx(12.6)).toBe(AGENT_CHAT_TRANSCRIPT_BASE_BOTTOM_PAD_PX + 13);
  });

  it("eases spacer height only when the overlay is shrinking", () => {
    const shrinking = transcriptBottomPadStyle(40, true, false);
    expect(shrinking.transitionDuration).toBe(`${AGENT_CHAT_OVERLAY_PAD_SHRINK_MS}ms`);
    expect(transcriptBottomPadStyle(180, false, false).transitionDuration).toBe("0ms");
    expect(transcriptBottomPadStyle(40, true, true).transitionDuration).toBe("0ms");
    expect(AGENT_CHAT_OVERLAY_PAD_SHRINK_MS).toBe(350);
  });
});

describe("estimateTranscriptTotalSize", () => {
  it("sums row estimates and the same gap the virtualizer uses", () => {
    expect(estimateTranscriptTotalSize([])).toBe(0);
    expect(estimateTranscriptTotalSize(["user"])).toBe(AGENT_CHAT_USER_ROW_ESTIMATE);
    expect(estimateTranscriptTotalSize(["user", "assistant"])).toBe(
      AGENT_CHAT_USER_ROW_ESTIMATE + AGENT_CHAT_TRANSCRIPT_GAP + AGENT_CHAT_ASSISTANT_ROW_ESTIMATE,
    );
  });

  it("starts the first paint at the bottom of a long transcript", () => {
    const roles = Array.from({ length: 40 }, (_, index) => (index % 2 === 0 ? "user" : "assistant"));
    const total = estimateTranscriptTotalSize(roles);
    expect(estimateTranscriptInitialOffset(roles, 600)).toBe(total - 600);
    expect(estimateTranscriptInitialOffset(["user"], 800)).toBe(0);
  });

  it("uses the taller mermaid estimate when a turn contains a diagram", () => {
    expect(estimateTranscriptTotalSize(["assistant"], AGENT_CHAT_TRANSCRIPT_GAP, [true])).toBe(
      AGENT_CHAT_ASSISTANT_MERMAID_ROW_ESTIMATE,
    );
  });
});

describe("measureTranscriptScrollMargin", () => {
  it("returns 0 when either node is missing", () => {
    expect(measureTranscriptScrollMargin(null, null)).toBe(0);
  });
});

describe("transcript virtual list wiring", () => {
  it("virtualizes messages inside StickToBottom instead of mounting the whole history", () => {
    const panel = readFileSync(
      join(import.meta.dir, "../../components/AgentChatPanel.tsx"),
      "utf8",
    );
    const list = readFileSync(
      join(import.meta.dir, "../../components/AgentChatTranscriptList.tsx"),
      "utf8",
    );
    const view = readFileSync(
      join(import.meta.dir, "../../components/AgentChatMessageView.tsx"),
      "utf8",
    );
    const session = readFileSync(
      join(import.meta.dir, "../../hooks/use-agent-chat-session.ts"),
      "utf8",
    );
    const handlers = readFileSync(
      join(import.meta.dir, "../../hooks/use-agent-chat-ui-handlers.ts"),
      "utf8",
    );

    expect(panel).not.toContain('key={isResumingHistory ? "restoring-history" : "live-chat"}');
    expect(panel).toContain("isRestoringTranscript");
    expect(panel).toContain("AgentChatTranscriptList");
    expect(panel).toContain("scrollToIndexRef");
    expect(panel).toContain(`scrollClassName={AGENT_CHAT_SCROLL_CLASS}`);
    expect(panel).toContain('resize={isRestoringTranscript ? "instant" : "smooth"}');
    expect(panel).toContain("transcriptBottomPadStyle");
    expect(panel).toContain("overlayPadShrinking");
    expect(panel).not.toContain("shouldMountTranscriptMessage");
    expect(panel).not.toContain("useProgressiveTranscriptHydration");
    expect(panel).not.toContain("hydratedTail");
    expect(panel).not.toContain("eagerMount=");
    expect(panel).not.toContain("messages.map((message, i)");

    expect(list).toContain("useVirtualizer");
    expect(list).toContain("measureElement");
    expect(list).toContain("useFlushSync: false");
    expect(list).toContain("getTotalSize");
    expect(list).toContain("AGENT_CHAT_TRANSCRIPT_OVERSCAN");
    expect(list).toContain("AGENT_CHAT_TRANSCRIPT_GAP");
    expect(list).toContain("mergeMermaidKeepAliveRange");
    expect(list).toContain("mermaidFlags[index] === true");
    expect(list).toContain("findAgentChatScrollElement");
    expect(list).toContain("activityStatus");
    expect(list).toContain("showActivityFooter");
    expect(list).not.toContain("useStickToBottomContext()");
    expect(list).not.toContain('from "use-stick-to-bottom"');
    expect(panel).toContain("activityStatus=");
    expect(panel).toContain("<AgentActivityIndicator");
    expect(AGENT_CHAT_TRANSCRIPT_OVERSCAN).toBeGreaterThan(0);
    expect(AGENT_CHAT_SCROLL_CLASS).toBe("agent-chat-scroll");

    expect(view).not.toContain("useDeferredMessageMount");
    expect(view).not.toContain("data-transcript-mounted");
    expect(view).not.toContain("line-clamp-6");
    expect(view).not.toContain("eagerMount");
    expect(view).toContain("AssistantTurnFileChanges");

    expect(session).toContain("isRestoringTranscript: isResumingHistory");
    expect(session).toContain("isResumingHistory: isResumingHistory && messages.length === 0");
    expect(session).toContain("scrollToIndexRef: ui.scrollToIndexRef");

    expect(handlers).toContain("scrollToIndexRef.current?.(messageIndex)");
    expect(handlers).not.toContain("querySelector");
    expect(handlers).not.toContain("scrollIntoView");
  });
});

describe("agentMessageHasMermaid", () => {
  it("detects closed mermaid fences in assistant text", () => {
    expect(
      agentMessageHasMermaid({
        parts: [{ type: "text", text: "```mermaid\ngraph TD\nA-->B\n```" }],
      }),
    ).toBe(true);
    expect(
      agentMessageHasMermaid({
        parts: [{ type: "text", text: "no diagram here" }],
      }),
    ).toBe(false);
  });
});

describe("mergeMermaidKeepAliveRange", () => {
  it("keeps recently seen mermaid rows after they leave the default range", () => {
    const flags = [false, true, false, true, false, false];
    const first = mergeMermaidKeepAliveRange([0, 1, 2], flags, [], flags.length);
    expect(first.range).toEqual([0, 1, 2]);
    expect(first.kept).toEqual([1]);

    const second = mergeMermaidKeepAliveRange([3, 4, 5], flags, first.kept, flags.length);
    expect(second.kept).toEqual([3, 1]);
    expect(second.range).toEqual([1, 3, 4, 5]);
    expect(AGENT_CHAT_MERMAID_KEEPALIVE).toBeGreaterThan(0);
  });
});
