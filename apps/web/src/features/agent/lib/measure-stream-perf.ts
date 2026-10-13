/**
 * CPU-side stream/restore microbench. Not Chrome FPS / React Profiler.
 * Run: bun apps/web/src/features/agent/lib/measure-stream-perf.ts
 *
 * The previous "restore 35s → 1.4ms" table compared full text-chunk hydrate
 * against a last-turn snapshot overlay. That is not a 500-turn UI restore and
 * is not a valid before/after. It is omitted on purpose.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import { takeStreamChars } from "../../../../../../packages/ui/src/components/ai-elements/smooth-stream-text";
import { applyTurnSnapshot } from "./agent-chat-events";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";

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

function timeMs(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

function isDirectRun(): boolean {
  const entry = argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(import.meta.url) === entry;
  } catch {
    return false;
  }
}

const messages = transcript();
const last = messages.at(-1)!;
const snap = [{
  ...last,
  parts: last.parts.map((part) =>
    part.type === "text" ? { ...part, text: `${part.text} more` } : part
  ),
}];

const snapshotMs = timeMs(() => {
  applyTurnSnapshot(messages, snap, [`p${TURNS - 1}`]);
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
  environment: "bun CPU microbench (no Chromium, no layout/paint, no React Profiler)",
  fixture: {
    turns: TURNS,
    tools_per_turn: TOOLS_PER_TURN,
    tokens_per_answer: TOKENS,
  },
  results_ms: {
    apply_turn_snapshot_last_turn_overlay: Number(snapshotMs.toFixed(3)),
    display_buffer_drain_120_frames: Number(drainMs.toFixed(3)),
  },
  display_buffer_chars_revealed: revealed,
  incomplete: {
    scroll_fps_500_turn_tool_dense:
      "not measured — needs Chromium + mounted AgentChatTranscriptList + React Profiler",
    per_token_react_render_ms:
      "not measured — needs Chromium + React Profiler on a live streaming tail",
    restore_35s_to_1_4ms_baseline:
      "invalid and removed — that compared CPU hydrate of 21500 text_chunk events against a last-turn overlay, not UI restore",
  },
};

if (isDirectRun()) {
  const outDir = process.env.ATMOS_STREAM_PERF_OUTDIR
    ?? join(process.cwd(), "scripts/agent-chat-stream-perf/tmp");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/agent-chat-stream-perf.json`, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify(payload, null, 2));
}

export { payload as agentChatStreamPerfPayload };
