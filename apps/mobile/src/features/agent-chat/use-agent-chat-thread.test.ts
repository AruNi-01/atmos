// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const thread = readFileSync(join(here, "use-agent-chat-thread.ts"), "utf8");

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
