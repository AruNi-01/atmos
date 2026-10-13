/**
 * CPU-side stream/restore microbench. Not Chrome FPS.
 * Run: bun apps/web/src/features/agent/lib/measure-stream-perf.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { takeStreamChars } from "../../../../../../packages/ui/src/components/ai-elements/smooth-stream-text";
import {
  applyTurnSnapshot,
  hydrateAgentChatMessages,
} from "./agent-chat-events";
import type { AgentChatEvent, AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";

const TURNS = 500;
const TOOLS_PER_TURN = 8;
const TOKENS = 40;

function transcript(): AgentMessage[] {
  const messages: AgentMessage[] = [];
  for (let turn = 0; turn < TURNS; turn += 1) {
    messages.push({
      id: `u${turn}`,
      role: "user",
      parts: [{ type: "text", text: `prompt ${turn}` }],
    });
    const parts: AgentMessage["parts"] = [];
    for (let tool = 0; tool < TOOLS_PER_TURN; tool += 1) {
      parts.push({
        type: "tool_call",
        tool_call_id: `t${turn}-${tool}`,
        name: "Read",
        kind: "read",
        status: "completed",
        params: { type: "read", path: "a.ts" },
      });
    }
    parts.push({
      type: "text",
      text: `answer ${turn} ${"token ".repeat(TOKENS)}`,
      message_id: `p${turn}`,
    });
    messages.push({
      id: `a${turn}`,
      role: "assistant",
      parts,
      streaming: turn === TURNS - 1,
    });
  }
  return messages;
}

function chunkEvents(messages: AgentMessage[]): AgentChatEvent[] {
  const events: AgentChatEvent[] = [];
  let revision = 1;
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type !== "text") continue;
      const words = part.text.split(" ");
      let offset = 0;
      for (const word of words) {
        const text = offset === 0 ? word : ` ${word}`;
        events.push({
          chat_id: "chat-1",
          event_id: `e${revision}`,
          revision,
          payload: {
            type: "text_chunk",
            part_id: part.message_id ?? message.id,
            message_id: message.id,
            ordinal: 0,
            kind: "answer",
            offset,
            text,
          },
        });
        offset += text.length;
        revision += 1;
      }
    }
  }
  return events;
}

function timeMs(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

const messages = transcript();
const events = chunkEvents(messages);
const last = messages.at(-1)!;
const snap = [{
  ...last,
  parts: last.parts.map((part) =>
    part.type === "text" ? { ...part, text: `${part.text} more` } : part
  ),
}];

const snapshotMs = timeMs(() => {
  applyTurnSnapshot(messages, snap, []);
});
const replayLastMs = timeMs(() => {
  hydrateAgentChatMessages(messages.slice(0, -1), events.slice(-TOKENS), "chat-1");
});
const fullReplayMs = timeMs(() => {
  hydrateAgentChatMessages([], events, "chat-1");
});

let revealed = 0;
const drainMs = timeMs(() => {
  let remainder = 0;
  let shown = 0;
  const target = 800;
  for (let i = 0; i < 120; i += 1) {
    const step = takeStreamChars(target - shown, 16, remainder);
    shown += step.count;
    remainder = step.remainder;
  }
  revealed = shown;
});

const payload = {
  measured_at: new Date().toISOString(),
  environment: "bun CPU microbench (no Chromium, no layout/paint)",
  fixture: {
    turns: TURNS,
    tools_per_turn: TOOLS_PER_TURN,
    tokens_per_answer: TOKENS,
    replay_events: events.length,
  },
  results_ms: {
    apply_turn_snapshot_500_turns: Number(snapshotMs.toFixed(3)),
    hydrate_last_turn_tokens: Number(replayLastMs.toFixed(3)),
    hydrate_full_text_chunk_replay: Number(fullReplayMs.toFixed(3)),
    display_buffer_drain_120_frames: Number(drainMs.toFixed(3)),
  },
  display_buffer_chars_revealed: revealed,
  unmeasured: [
    "scroll FPS in a 500-turn session (needs Chrome + mounted virtual list)",
    "per-token React render time (needs React profiler / Chrome performance)",
  ],
};

if (import.meta.main) {
  const outDir = "/opt/cursor/artifacts";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/agent-chat-stream-perf.json`, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify(payload, null, 2));
}

export { payload as agentChatStreamPerfPayload };
