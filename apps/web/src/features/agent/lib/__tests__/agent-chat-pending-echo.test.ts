import { describe, expect, it } from "bun:test";
import {
  PENDING_USER_ECHO_PREFIX,
  createPendingUserMessage,
  insertPendingUserMessage,
  isPendingUserEcho,
  keepPendingUserEchoes,
  removePendingUserMessage,
  settlePendingUserMessage,
} from "@/features/agent/lib/agent-chat-pending-echo";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";

function user(id: string, text: string): AgentMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

describe("pending user echo", () => {
  it("mints a pending row that insert/remove can round-trip", () => {
    const echo = createPendingUserMessage({
      id: `${PENDING_USER_ECHO_PREFIX}a`,
      text: " ship it ",
      attachments: [{ path: "/tmp/a.png", name: "a.png" }],
    });
    expect(isPendingUserEcho(echo)).toBe(true);
    expect(echo.parts).toEqual([
      { type: "text", text: "ship it" },
      { type: "attachment", path: "/tmp/a.png", name: "a.png" },
    ]);
    const inserted = insertPendingUserMessage([], echo);
    expect(inserted).toHaveLength(1);
    expect(insertPendingUserMessage(inserted, echo)).toHaveLength(1);
    expect(removePendingUserMessage(inserted, echo.id)).toEqual([]);
    expect(removePendingUserMessage(inserted, "real")).toEqual(inserted);
  });

  it("replaces the matching pending echo instead of appending a second bubble", () => {
    const pending = createPendingUserMessage({
      id: `${PENDING_USER_ECHO_PREFIX}a`,
      text: "hello",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const settled = settlePendingUserMessage([pending], user("u1", "hello"));
    expect(settled).toHaveLength(1);
    expect(settled[0]?.id).toBe("u1");
    expect(settled[0]?.created_at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("appends when there is no pending echo and updates when the id already exists", () => {
    expect(settlePendingUserMessage([], user("u1", "hello"))).toEqual([user("u1", "hello")]);
    const existing = [user("u1", "hello")];
    const next = settlePendingUserMessage(existing, {
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: "hello" }],
      created_at: "2026-02-01T00:00:00.000Z",
    });
    expect(next).toHaveLength(1);
    expect(next[0]?.created_at).toBe("2026-02-01T00:00:00.000Z");
  });

  it("keeps in-flight echoes across an empty snapshot load", () => {
    const pending = createPendingUserMessage({
      id: `${PENDING_USER_ECHO_PREFIX}a`,
      text: "hello",
    });
    expect(keepPendingUserEchoes([], [pending])).toEqual([pending]);
    expect(keepPendingUserEchoes([user("u1", "hello")], [pending])).toEqual([
      user("u1", "hello"),
    ]);
  });
});
