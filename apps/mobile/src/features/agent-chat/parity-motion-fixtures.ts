import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { TRANSCRIPT_END_SLACK_PX, parityFixtureById } from "@atmos/agent-transcript";

/** One new tool row per tick. Longer than the 400ms tree draw, so each line finishes before the next. */
export const PARITY_MOTION_ROW_MS = 600;

export const PARITY_STREAM_FIXTURE = "stream-tools";
export const PARITY_SETTLED_FIXTURE = "settled-tools";
export const PARITY_TAIL_FIXTURE = "f13-tail";
/** Reply 50 in F13. Capture scrolls here; the manual link does not. */
export const PARITY_TAIL_MARKER_ID = "f13-a-50";
export const PARITY_SETTLED_ASSISTANT_ID = "settled-tools-a";

export type ParityTailSample = {
  below: number;
  end: number;
  /** Content y of Reply 50. -1 when that row is not measured. */
  marker: number;
  stick: boolean;
  step: number;
  top: number;
  view: number;
};

export function parityTailLine(sample: ParityTailSample): string {
  return `[parity] tail below=${sample.below} stick=${sample.stick ? 1 : 0} step=${sample.step} top=${Math.round(sample.top)} end=${Math.round(sample.end)} marker=${Math.round(sample.marker)} view=${Math.round(sample.view)}`;
}

export function parityTailSamples(log: string): ParityTailSample[] {
  const samples: ParityTailSample[] = [];
  const pattern =
    /\[parity\] tail below=(\d+) stick=([01]) step=(\d+) top=(-?\d+) end=(-?\d+) marker=(-?\d+) view=(-?\d+)/g;
  for (const match of log.matchAll(pattern)) {
    samples.push({
      below: Number(match[1]),
      stick: match[2] === "1",
      step: Number(match[3]),
      top: Number(match[4]),
      end: Number(match[5]),
      marker: Number(match[6]),
      view: Number(match[7]),
    });
  }
  return samples;
}

function markerInView(sample: ParityTailSample): boolean {
  if (sample.marker < 0 || sample.view <= 0) return false;
  return sample.marker >= sample.top - 2 && sample.marker < sample.top + sample.view;
}

/**
 * True when a later unstuck step is still more than 24 px from the end,
 * Reply 50 is inside the viewport, the below count grew, and both the list
 * offset and the marker row stayed within 2 px.
 * Samples taken while the scroll is moving are ignored as long as one
 * settled pair exists.
 */
export function parityTailReadingHeld(samples: readonly ParityTailSample[]): boolean {
  const byStep = new Map<number, ParityTailSample>();
  for (const sample of samples) {
    if (!sample.stick) byStep.set(sample.step, sample);
  }
  const steps = [...byStep.keys()].sort((left, right) => left - right);
  for (let i = 0; i < steps.length; i += 1) {
    const start = byStep.get(steps[i] ?? -1);
    if (!start) continue;
    for (let j = i + 1; j < steps.length; j += 1) {
      const next = byStep.get(steps[j] ?? -1);
      if (!next) continue;
      if (
        next.below > start.below &&
        start.end > 24 &&
        next.end > 24 &&
        markerInView(start) &&
        markerInView(next) &&
        Math.abs(next.top - start.top) <= 2 &&
        Math.abs(next.marker - start.marker) <= 2
      ) {
        return true;
      }
    }
  }
  return false;
}

export type ParityTailReturnPhase = "wait" | "press" | "landed";

/**
 * After the reading hold, the capture calls the scroll pill's handler once.
 * Landed means a later sample is stuck and inside the end slack. The handler
 * flips `stickToEnd` before the list moves, and that sample still carries the
 * reading distance, so it stays `wait`.
 */
export function parityTailReturnPhase(
  samples: readonly ParityTailSample[],
  pressed: boolean,
): ParityTailReturnPhase {
  if (!pressed) return parityTailReadingHeld(samples) ? "press" : "wait";
  const last = samples.at(-1);
  if (last?.stick && last.end <= TRANSCRIPT_END_SLACK_PX) return "landed";
  return "wait";
}

const STREAM_START = 2;
const STREAM_HOLD_STEPS = 2;

type MotionRow = {
  id: string;
  kind: "read" | "search";
  title: string;
};

const STREAM_SCRIPT: readonly MotionRow[] = [
  { id: "read-main", kind: "read", title: "src/main.ts" },
  { id: "search-ready", kind: "search", title: "ready" },
  { id: "read-lib", kind: "read", title: "src/lib.ts" },
  { id: "search-export", kind: "search", title: "export" },
  { id: "read-app", kind: "read", title: "src/app.ts" },
  { id: "search-fixture", kind: "search", title: "fixture" },
  { id: "read-theme", kind: "read", title: "src/theme.ts" },
  { id: "search-parity", kind: "search", title: "parity" },
];

const SETTLED_SCRIPT: readonly MotionRow[] = [
  { id: "read-main", kind: "read", title: "src/main.ts" },
  { id: "read-lib", kind: "read", title: "src/lib.ts" },
  { id: "read-app", kind: "read", title: "src/app.ts" },
  { id: "search-ready", kind: "search", title: "ready" },
  { id: "search-export", kind: "search", title: "export" },
];

export function parityMotionKind(id: string): "stream" | "settled" | "tail" | null {
  if (id === PARITY_STREAM_FIXTURE) return "stream";
  if (id === PARITY_SETTLED_FIXTURE) return "settled";
  if (id === PARITY_TAIL_FIXTURE) return "tail";
  return null;
}

/**
 * Step 0 shows two rows so the group is already mounted and open.
 * Each later step appends one row. After the last row sits for two ticks
 * (the 400ms draw, then a beat), the next step starts a new cycle at two rows.
 */
export function parityStreamToolFrame(step: number): { cycle: number; count: number } {
  const span = STREAM_SCRIPT.length - STREAM_START + STREAM_HOLD_STEPS;
  const safe = Math.max(0, Math.floor(step));
  const cycle = Math.floor(safe / span);
  const index = safe % span;
  return { cycle, count: Math.min(STREAM_SCRIPT.length, STREAM_START + index) };
}

function toolPart(row: MotionRow, cycle: number, running: boolean): AgentPart {
  const status = running ? "running" : "completed";
  if (row.kind === "read") {
    return {
      type: "tool_call",
      tool_call_id: `${cycle}-${row.id}`,
      name: "Read",
      title: row.title,
      kind: "read",
      status,
      params: { type: "read", path: row.title },
      result: running
        ? null
        : { type: "file_content", path: row.title, text: "export const ready = true;\n" },
    };
  }
  return {
    type: "tool_call",
    tool_call_id: `${cycle}-${row.id}`,
    name: "Search",
    title: row.title,
    kind: "search",
    status,
    params: { type: "search", query: row.title, path: "src" },
    result: running
      ? null
      : {
          type: "search_hits",
          query: row.title,
          hits: [{ path: "src/main.ts", line: 1, snippet: "export const ready = true;" }],
        },
  };
}

function userMessage(id: string, text: string): AgentMessage {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text }],
    created_at: "2026-10-16T12:00:00.000Z",
  };
}

export function parityStreamToolMessages(step: number): AgentMessage[] {
  const frame = parityStreamToolFrame(step);
  const rows = STREAM_SCRIPT.slice(0, frame.count);
  return [
    userMessage("stream-tools-u", "Watch the open tool group"),
    {
      id: "stream-tools-a",
      role: "assistant",
      parts: rows.map((row, index) => toolPart(row, frame.cycle, index === rows.length - 1)),
      created_at: "2026-10-16T12:00:01.000Z",
      streaming: true,
    },
  ];
}

/**
 * F13, then one new assistant row per step. Step 0 is the settled long
 * transcript. Later steps append `Tail N` and do not rewrite earlier rows,
 * so a marker the reader has scrolled to can stay put while the count grows.
 */
export function parityTailMessages(step: number): AgentMessage[] {
  const base = parityFixtureById("F13")?.messages ?? [];
  const extra = Math.max(0, Math.floor(step));
  const tail: AgentMessage[] = [];
  for (let n = 1; n <= extra; n += 1) {
    tail.push({
      id: `f13-tail-${n}`,
      role: "assistant",
      parts: [{ type: "text", text: `Tail ${n}` }],
      created_at: "2026-10-16T12:00:00.000Z",
      streaming: n === extra,
    });
  }
  return [...base, ...tail];
}

/** Settled group. F4 is the same reopen path with the process starting closed. */
export function paritySettledToolMessages(): AgentMessage[] {
  return [
    userMessage("settled-tools-u", "Reopen the finished tool group"),
    {
      id: PARITY_SETTLED_ASSISTANT_ID,
      role: "assistant",
      parts: SETTLED_SCRIPT.map((row) => toolPart(row, 0, false)),
      created_at: "2026-10-16T12:00:01.000Z",
      streaming: false,
      worked_ms: 8000,
      completed_at: "2026-10-16T12:00:09.000Z",
    },
  ];
}
