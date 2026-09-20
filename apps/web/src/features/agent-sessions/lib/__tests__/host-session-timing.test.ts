import { describe, expect, it } from "bun:test";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { fillHostSessionTurnTiming } from "@/features/agent-sessions/lib/host-session-timing";

function user(id: string, at: string, text = "hi"): AgentMessage {
  return { id, role: "user", created_at: at, parts: [{ type: "text", text }] };
}

function assistant(id: string, extra: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id,
    role: "assistant",
    parts: [
      { type: "thinking", text: "plan" },
      {
        type: "tool_call",
        tool_call_id: "t1",
        name: "Read",
        kind: "read",
        status: "running",
        params: { type: "read", path: "a.ts" },
      },
      { type: "text", text: "done" },
    ],
    ...extra,
  };
}

describe("fillHostSessionTurnTiming", () => {
  it("stamps worked_ms from the user prompt to the last assistant time", () => {
    const messages = fillHostSessionTurnTiming([
      user("u1", "2026-04-01T10:00:01.000Z"),
      assistant("a1", {
        streaming: true,
        created_at: "2026-04-01T10:00:09.000Z",
      }),
    ]);
    expect(messages[1]?.streaming).toBe(false);
    expect(messages[1]?.worked_ms).toBe(8_000);
    expect(messages[1]?.completed_at).toBe("2026-04-01T10:00:09.000Z");
    expect(messages[1]?.parts[1]).toMatchObject({ type: "tool_call", status: "completed" });
  });

  it("falls back to the next user prompt when the assistant stamp matches the user", () => {
    const messages = fillHostSessionTurnTiming([
      user("u1", "2026-04-01T10:00:00.000Z"),
      assistant("a1", { created_at: "2026-04-01T10:00:00.000Z" }),
      user("u2", "2026-04-01T10:00:40.000Z", "again"),
    ]);
    expect(messages[1]?.worked_ms).toBe(40_000);
    expect(messages[1]?.completed_at).toBe("2026-04-01T10:00:40.000Z");
  });

  it("keeps a positive server worked_ms", () => {
    const messages = fillHostSessionTurnTiming([
      user("u1", "2026-04-01T10:00:01.000Z"),
      assistant("a1", {
        created_at: "2026-04-01T10:00:09.000Z",
        completed_at: "2026-04-01T10:00:09.000Z",
        worked_ms: 12_000,
      }),
    ]);
    expect(messages[1]?.worked_ms).toBe(12_000);
  });

  it("stamps the last turn from session updated_at when the assistant has no reply time", () => {
    const now = new Date().toISOString();
    const messages = fillHostSessionTurnTiming(
      [
        user("u1", "2026-04-01T10:00:01.000Z"),
        assistant("a1", {
          created_at: now,
          completed_at: now,
          worked_ms: 14 * 3600_000,
        }),
      ],
      "2026-04-01T10:00:09.000Z",
    );
    expect(messages[1]?.worked_ms).toBe(8_000);
    expect(messages[1]?.completed_at).toBe("2026-04-01T10:00:09.000Z");
  });
});
