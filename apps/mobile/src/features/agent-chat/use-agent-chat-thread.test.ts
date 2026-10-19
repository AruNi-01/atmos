// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";

const thread = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "use-agent-chat-thread.ts"),
  "utf8",
);

describe("useAgentChatThread restore", () => {
  test("loads the snapshot before subscribing from the EventGate cursor", () => {
    expect(thread).toContain("agentChatGet");
    expect(thread).toContain("after_sequence: pump.cursor");
    expect(thread).toContain("snapshot.meta?.last_event_seq");
    expect(thread).toContain("finishHydrate");
    expect(thread).toContain("canResumeAgentChatSession");
    expect(thread).toContain("abandonHydrate");
    expect(thread).toContain("drainAbandonedHydrate");
    expect(thread).toContain("clearResyncRetry");
    expect(thread).toContain("pump.shouldResyncFromServer");
    expect(thread).toContain("nextAgentChatResyncDelayMs");
    expect(thread).toContain('shouldAbandonAgentChatHydrate("error")');
    expect(thread).not.toContain("if (revision <= after) continue");
    const getAt = thread.indexOf("wsActions.agentChatGet");
    const subscribeAt = thread.indexOf("wsActions.agentChatSubscribe");
    expect(getAt).toBeGreaterThan(-1);
    expect(subscribeAt).toBeGreaterThan(getAt);
  });
});
