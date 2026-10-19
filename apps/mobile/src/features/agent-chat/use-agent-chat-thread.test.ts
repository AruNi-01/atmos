// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error Node types are not in the Expo tsconfig
import { readFileSync } from "node:fs";
// @ts-expect-error Node types are not in the Expo tsconfig
import { join } from "node:path";

const thread = readFileSync(
  join((import.meta as ImportMeta & { dir: string }).dir, "use-agent-chat-thread.ts"),
  "utf8",
);

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

  test("applies agent_chat_resync in place without remounting", () => {
    expect(thread).toContain("parseAgentChatResync");
    expect(thread).toContain("transcriptFromAgentChatSnapshot");
    expect(thread).toContain("resync.chat_id === chatId");
  });
});
