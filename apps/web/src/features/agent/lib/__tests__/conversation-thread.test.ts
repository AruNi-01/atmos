import { describe, expect, it } from "bun:test";
import {
  catalogToConfigOptions,
  conversationTitleFromPrompt,
  conversationsToHistoryRows,
  currentPlanFromEntries,
  turnsToThreadEntries,
} from "@/features/agent/lib/conversation-thread";
import type { LiveTurn } from "@/features/agent/lib/conversation-events";

describe("conversation thread mapper", () => {
  it("uses the first line of the prompt as a fallback session title", () => {
    expect(conversationTitleFromPrompt("hello\nworld")).toBe("hello");
    expect(conversationTitleFromPrompt(` ${"a".repeat(80)} `)).toHaveLength(60);
  });

  it("maps user text and assistant blocks including tools and plan", () => {
    const turns: LiveTurn[] = [
      {
        id: "t1",
        status: "running",
        messages: [
          {
            id: "u1",
            role: "user",
            parts: [{ type: "text", text: "read the file" }],
          },
          {
            id: "a1",
            role: "assistant",
            parts: [
              { type: "thinking", text: "looking" },
              {
                type: "tool_call",
                tool_call_id: "tool-1",
                name: "Read",
                kind: "read",
                title: "src/main.ts",
                status: "completed",
                input: { path: "src/main.ts" },
              },
              {
                type: "plan",
                plan: { entries: [{ content: "Inspect", priority: "high", status: "completed" }] },
              },
              { type: "text", text: "done" },
            ],
          },
        ],
      },
    ];
    const entries = turnsToThreadEntries(turns);
    expect(entries[0]).toMatchObject({ role: "user", content: "read the file" });
    expect(entries[1]?.role).toBe("assistant");
    if (entries[1]?.role !== "assistant") throw new Error("expected assistant");
    expect(entries[1].isStreaming).toBe(true);
    expect(entries[1].blocks.map((block) => block.type)).toEqual([
      "thinking",
      "tool_call",
      "plan",
      "text",
    ]);
    expect(entries[1].blocks[1]).toMatchObject({
      type: "tool_call",
      tool: "Read",
      description: "src/main.ts",
    });
    expect(currentPlanFromEntries(entries)?.entries[0]?.content).toBe("Inspect");
  });

  it("merges consecutive assistant messages in a turn so thinking and text share one copy target", () => {
    const turns: LiveTurn[] = [
      {
        id: "t1",
        status: "completed",
        messages: [
          { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
          { id: "think", role: "assistant", parts: [{ type: "thinking", text: "hmm" }] },
          { id: "a1", role: "assistant", parts: [{ type: "text", text: "hello" }] },
        ],
      },
    ];
    const entries = turnsToThreadEntries(turns);
    expect(entries).toHaveLength(2);
    expect(entries[1]?.role).toBe("assistant");
    if (entries[1]?.role !== "assistant") throw new Error("expected assistant");
    expect(entries[1].blocks.map((block) => block.type)).toEqual(["thinking", "text"]);
  });

  it("builds model and thinking config options from the catalog", () => {
    const options = catalogToConfigOptions(
      {
        agent_id: "claude",
        status: "ok",
        models: [{ id: "opus", label: "Opus" }],
        modes: [],
        thinking: { type: "enum", options: ["low", "high"] },
        strategies_used: [],
        fetched_at: "",
        source: "cache",
        message: null,
      },
      "opus",
      "high",
    );
    expect(options.map((item) => item.id)).toEqual(["model", "thinking"]);
    expect(options[0]?.currentValue).toBe("opus");
    expect(options[1]?.currentValue).toBe("high");
  });

  it("maps list rows to conversation history identity", () => {
    const rows = conversationsToHistoryRows([
      {
        id: "conv-1",
        title: "Fix auth",
        cwd: "/tmp/app",
        workspace_id: "ws-1",
        project_id: null,
        provider_id: "claude",
        updated_at: "2026-08-28T00:00:00.000Z",
        last_message_at: null,
        deleted: false,
      },
    ]);
    expect(rows[0]).toEqual({
      conversation_id: "conv-1",
      provider_id: "claude",
      title: "Fix auth",
      cwd: "/tmp/app",
      updated_at: "2026-08-28T00:00:00.000Z",
    });
  });
});
