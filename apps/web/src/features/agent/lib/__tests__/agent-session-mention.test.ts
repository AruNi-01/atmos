import { describe, expect, it } from "bun:test";

import { expandAgentComposerText } from "@/features/agent/lib/agent-chat-slash-command";
import {
  agentSessionMentionToken,
  bridgeProviderId,
  decodeAgentSessionMention,
  expandAgentSessionMentionTokens,
  matchesAgentSessionsMentionQuery,
  sessionMatchesMentionQuery,
} from "@/features/agent/lib/agent-session-mention";

describe("agent session mentions", () => {
  it("filters a session by title the same way an @ query matches", () => {
    const session = { title: "Review the diff", provider: "grok-build" };
    expect(sessionMatchesMentionQuery(session, "")).toBe(true);
    expect(sessionMatchesMentionQuery(session, "diff")).toBe(true);
    expect(sessionMatchesMentionQuery(session, "grok")).toBe(true);
    expect(sessionMatchesMentionQuery(session, "missing")).toBe(false);
  });

  it("addresses a chat by provider id, not the tool slug", () => {
    expect(bridgeProviderId({ providerId: "claude", tool: "claude-code" })).toBe("claude");
    expect(bridgeProviderId({ providerId: "  ", tool: "grok-build" })).toBe("grok-build");
    expect(bridgeProviderId({})).toBe("agent");
  });

  it("shows the Agent Sessions row for an empty or matching query", () => {
    expect(matchesAgentSessionsMentionQuery("")).toBe(true);
    expect(matchesAgentSessionsMentionQuery("ses")).toBe(true);
    expect(matchesAgentSessionsMentionQuery("readme")).toBe(false);
  });

  it("round-trips the chosen sessions", () => {
    const token = agentSessionMentionToken({
      skillPath: "/skills/atmos-agent-bridge",
      targets: [
        { provider: "grok-build", chatId: "chat-1", title: "Review the diff" },
        { provider: "claude-code", chatId: "chat-2", title: "" },
      ],
    });
    expect(decodeAgentSessionMention(token)?.targets.map((target) => target.chatId)).toEqual([
      "chat-1",
      "chat-2",
    ]);
  });

  it("expands the chip into an agent-bridge send for each session", () => {
    const token = agentSessionMentionToken({
      skillPath: "/skills/atmos-agent-bridge",
      targets: [{ provider: "grok-build", chatId: "chat-1", title: "Review" }],
    });
    const expanded = expandAgentSessionMentionTokens(`${token}\u00A0please look`);
    expect(expanded).toContain("/skill:/skills/atmos-agent-bridge");
    expect(expanded).toContain("--to-provider grok-build --to-chat chat-1");
    expect(expanded).toContain("please look");
    expect(expandAgentComposerText(`${token}\u00A0please look`)).toContain(
      "--to-provider grok-build --to-chat chat-1",
    );
  });
});
