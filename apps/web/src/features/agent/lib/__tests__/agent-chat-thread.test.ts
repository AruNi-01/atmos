import { describe, expect, it } from "bun:test";
import {
  catalogToConfigOptions,
  chatTitleFromPrompt,
  chatsToHistoryRows,
  parsePlan,
  splitComposerConfigOptions,
} from "@/features/agent/lib/agent-chat-thread";

describe("agent chat helpers", () => {
  it("uses the first line of the prompt as a fallback session title", () => {
    expect(chatTitleFromPrompt("hello\nworld")).toBe("hello");
    expect(chatTitleFromPrompt(` ${"a".repeat(80)} `)).toHaveLength(60);
  });

  it("parses a plan payload into the composer plan model", () => {
    const plan = parsePlan({
      entries: [{ content: "Inspect", priority: "high", status: "completed" }],
    });
    expect(plan?.entries[0]?.content).toBe("Inspect");
    expect(parsePlan(null)).toBeNull();
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

  it("puts catalog modes on the leading composer cluster and model/thinking on the trailing cluster", () => {
    const options = catalogToConfigOptions(
      {
        agent_id: "codex",
        status: "ok",
        models: [{ id: "gpt-5", label: "GPT-5" }],
        modes: [
          { id: "ask", label: "Ask" },
          { id: "agent", label: "Agent", is_default: true },
          { id: "debug", label: "Debug" },
        ],
        thinking: { type: "enum", options: ["low", "high"] },
        strategies_used: [],
        fetched_at: "",
        source: "cache",
        message: null,
      },
      "gpt-5",
      "low",
      "",
    );
    expect(options.map((item) => item.id)).toEqual(["mode", "model", "thinking"]);
    expect(options[0]?.currentValue).toBe("agent");
    const split = splitComposerConfigOptions(options);
    expect(split.leading.map((item) => item.id)).toEqual(["mode"]);
    expect(split.trailing.map((item) => item.id)).toEqual(["model", "thinking"]);
  });

  it("maps list rows to chat history identity", () => {
    const rows = chatsToHistoryRows([
      {
        id: "chat-1",
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
      chat_id: "chat-1",
      provider_id: "claude",
      title: "Fix auth",
      cwd: "/tmp/app",
      updated_at: "2026-08-28T00:00:00.000Z",
    });
  });
});
