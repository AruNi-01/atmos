import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const thread = readFileSync(join(import.meta.dir, "use-agent-chat-thread.ts"), "utf8");

describe("useAgentChatThread restore", () => {
  test("loads the snapshot before subscribing from last_event_seq", () => {
    expect(thread).toContain("agentChatGet");
    expect(thread).toContain("after_sequence: after");
    expect(thread).toContain("snapshot.meta?.last_event_seq");
    expect(thread).toContain("if (revision <= after) continue");
    const getAt = thread.indexOf("wsActions.agentChatGet");
    const subscribeAt = thread.indexOf("wsActions.agentChatSubscribe");
    expect(getAt).toBeGreaterThan(-1);
    expect(subscribeAt).toBeGreaterThan(getAt);
  });
});
