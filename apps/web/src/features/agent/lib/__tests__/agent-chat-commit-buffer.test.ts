import { describe, expect, it } from "bun:test";
import type { AgentChatPayload } from "@atmos/api-types/ws/dto/agent-chat";
import {
  AGENT_CHAT_COMMIT_FLUSH_MS,
  classifyCommitCadence,
  createAgentChatCommitBuffer,
  HIGH_FREQUENCY_EVENT_KINDS,
} from "@/features/agent/lib/agent-chat-commit-buffer";

const ALL_EVENT_KINDS = Object.keys({
  turn_started: 1,
  user_message: 1,
  text_chunk: 1,
  part_closed: 1,
  tool_call_started: 1,
  tool_call_updated: 1,
  tool_call_completed: 1,
  tool_call_failed: 1,
  plan_updated: 1,
  permission_requested: 1,
  permission_resolved: 1,
  session_op_requested: 1,
  session_op_resolved: 1,
  session_forked: 1,
  rewind_view_updated: 1,
  turn_completed: 1,
  usage_updated: 1,
  context_usage_updated: 1,
  queue_updated: 1,
  runtime_status: 1,
  title_updated: 1,
  available_commands_updated: 1,
  grok_goal_updated: 1,
  grok_workflow_updated: 1,
  config_updated: 1,
  unknown: 1,
  session_lifecycle: 1,
  session_config_change: 1,
  session_hint: 1,
} satisfies Record<AgentChatPayload["type"], 1>) as AgentChatPayload["type"][];

describe("agent chat commit buffer", () => {
  it("S19: commit count is bounded by the flush window, not the event count", () => {
    let now = 0;
    let commits = 0;
    const buffer = createAgentChatCommitBuffer({
      now: () => now,
      flushMs: AGENT_CHAT_COMMIT_FLUSH_MS,
      onCommit: () => {
        commits += 1;
      },
    });

    for (let i = 0; i < 200; i += 1) {
      const decision = buffer.deliver("text_chunk");
      expect(decision.flushed).toBe(false);
      expect(decision.dirty).toBe(true);
    }
    expect(commits).toBe(0);

    now = AGENT_CHAT_COMMIT_FLUSH_MS - 1;
    expect(buffer.maybeFlush()).toBe(false);
    expect(commits).toBe(0);

    now = AGENT_CHAT_COMMIT_FLUSH_MS;
    expect(buffer.maybeFlush()).toBe(true);
    expect(commits).toBe(1);

    for (let i = 0; i < 200; i += 1) {
      buffer.deliver("tool_call_updated");
    }
    now = AGENT_CHAT_COMMIT_FLUSH_MS * 2;
    expect(buffer.maybeFlush()).toBe(true);
    expect(commits).toBe(2);
    expect(commits).toBeLessThan(400);
  });

  it("S20: every high-frequency kind marks the buffer rather than flushing immediately", () => {
    for (const kind of HIGH_FREQUENCY_EVENT_KINDS) {
      let commits = 0;
      const buffer = createAgentChatCommitBuffer({
        now: () => 0,
        flushMs: AGENT_CHAT_COMMIT_FLUSH_MS,
        onCommit: () => {
          commits += 1;
        },
      });
      const decision = buffer.deliver(kind);
      expect(classifyCommitCadence(kind)).toBe("batch");
      expect(decision.cadence).toBe("batch");
      expect(decision.flushed).toBe(false);
      expect(decision.dirty).toBe(true);
      expect(buffer.isDirty()).toBe(true);
      expect(commits).toBe(0);
    }
  });

  it("S20: every remaining kind is classified and force-flushes when delivered alone", () => {
    for (const kind of ALL_EVENT_KINDS) {
      if ((HIGH_FREQUENCY_EVENT_KINDS as readonly string[]).includes(kind)) {
        expect(classifyCommitCadence(kind)).toBe("batch");
        continue;
      }
      let commits = 0;
      const buffer = createAgentChatCommitBuffer({
        now: () => 0,
        flushMs: AGENT_CHAT_COMMIT_FLUSH_MS,
        onCommit: () => {
          commits += 1;
        },
      });
      const decision = buffer.deliver(kind);
      expect(classifyCommitCadence(kind)).toBe("flush");
      expect(decision.cadence).toBe("flush");
      expect(decision.flushed).toBe(true);
      expect(decision.dirty).toBe(false);
      expect(commits).toBe(1);
    }
  });
});
