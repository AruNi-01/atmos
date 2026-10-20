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
    expect(thread).toContain("setTranscript(transcriptRef.current)");
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

  test("applies agent_chat_resync through EventGate finishHydrate", () => {
    expect(thread).toContain("parseAgentChatResync");
    expect(thread).toContain("resync.chat_id === chatId");
    expect(thread).toContain("applyOpenThreadResync");
    expect(thread).toContain("markOpenThreadOverflow");
    expect(thread).toContain("applyAgentChatResync");
    expect(thread).toContain("pump.finishHydrate(seq, generation)");
    expect(thread).toContain("pump.startHydrate()");
    expect(thread).toContain("pump.isHydrateGeneration(generation)");
    expect(thread.indexOf("pump.isHydrateGeneration(generation)")).toBeLessThan(
      thread.indexOf("applyAgentChatResync(chatId, snapshot, recentEvents)"),
    );
    expect(thread).toContain("pump.ingest(event)");
    expect(thread).toContain("rememberChatEvent(recentEvents, decision.event)");
    expect(thread.indexOf("const applyDecision")).toBeLessThan(
      thread.indexOf("rememberChatEvent(recentEvents, decision.event)"),
    );
    const ingestAt = thread.indexOf("const decision = pump.ingest(event)");
    const ingestApplyAt = thread.indexOf("applyDecision(decision);", ingestAt);
    expect(ingestAt).toBeGreaterThan(-1);
    expect(ingestApplyAt).toBeGreaterThan(ingestAt);
    expect(thread.slice(ingestAt, ingestApplyAt)).not.toContain("rememberChatEvent");
    expect(thread).toContain("prev === copy.sendFailed ? prev : null");
    const resyncAt = thread.indexOf("parseAgentChatResync(message)");
    const publishAt = thread.indexOf("applyOpenThreadResync({");
    const facadeAt = thread.indexOf("createFacadeHydrateSession(pump,");
    const finishAt = thread.indexOf("pump.finishHydrate(seq, generation)");
    expect(resyncAt).toBeGreaterThan(-1);
    expect(publishAt).toBeGreaterThan(resyncAt);
    expect(facadeAt).toBeGreaterThan(resyncAt);
    expect(facadeAt).toBeLessThan(publishAt);
    expect(thread.indexOf("applySnapshot(snapshot, facade.takeGeneration())")).toBeGreaterThan(
      publishAt,
    );
    expect(thread).toContain("return applied");
    expect(thread).not.toContain("let facadeHydrateGen");
    expect(finishAt).toBeGreaterThan(-1);
    expect(thread).not.toContain("if (!ready) return");
  });
});
