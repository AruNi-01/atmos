import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";

/** One new tool row per tick. Longer than the 400ms tree draw, so each line finishes before the next. */
export const PARITY_MOTION_ROW_MS = 600;

export const PARITY_STREAM_FIXTURE = "stream-tools";
export const PARITY_SETTLED_FIXTURE = "settled-tools";
export const PARITY_SETTLED_ASSISTANT_ID = "settled-tools-a";

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

export function parityMotionKind(id: string): "stream" | "settled" | null {
  if (id === PARITY_STREAM_FIXTURE) return "stream";
  if (id === PARITY_SETTLED_FIXTURE) return "settled";
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
