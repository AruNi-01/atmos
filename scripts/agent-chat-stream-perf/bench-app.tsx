/**
 * Chromium bench for Agent Chat virtual-list scroll FPS and per-token React
 * Profiler cost. Not part of the Next app; do not import from apps/web/src.
 *
 * Modes:
 *   main   — live path before this PR: each token is its own React commit
 *   branch — this PR: 56ms turn snapshots + last-text display buffer
 */
import React, {
  Profiler,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSmoothStreamText } from "../../packages/ui/src/components/ai-elements/smooth-stream-text";

const TURNS = 500;
const TOOLS_PER_TURN = 8;
const TOKENS = 40;
const TOKEN = "token ";
const COALESCE_MS = 56;
const OVERSCAN = 8;
const GAP = 12;
const USER_ESTIMATE = 88;
const ASSISTANT_ESTIMATE = 240;
const VIEWPORT = 720;

type Mode = "main" | "branch";

type ToolPart = {
  type: "tool_call";
  tool_call_id: string;
  name: string;
  status: string;
  path: string;
};

type TextPart = { type: "text"; text: string; message_id: string };

type Message = {
  id: string;
  role: "user" | "assistant";
  parts: Array<ToolPart | TextPart>;
  streaming?: boolean;
};

type ProfilerCommit = {
  phase: string;
  actualDuration: number;
  baseDuration: number;
  commitTime: number;
};

type BenchHandle = {
  mode: Mode;
  fixture: { turns: number; tools_per_turn: number; tokens_per_answer: number };
  runScroll: () => Promise<{
    fps: number;
    frame_count: number;
    long_frames_over_16_67ms: number;
    duration_ms: number;
    scroll_height: number;
    client_height: number;
    raw_frame_dts_ms: number[];
  }>;
  runTokens: () => Promise<{
    token_count: number;
    commit_count: number;
    total_actual_duration_ms: number;
    mean_actual_duration_ms: number;
    p50_actual_duration_ms: number;
    p95_actual_duration_ms: number;
    per_token_actual_duration_ms: number;
    raw_commits: ProfilerCommit[];
  }>;
};

function transcript(lastTokens = 0): Message[] {
  const messages: Message[] = [];
  for (let turn = 0; turn < TURNS; turn += 1) {
    messages.push({
      id: `u${turn}`,
      role: "user",
      parts: [{ type: "text", text: `prompt ${turn} please inspect these files`, message_id: `up${turn}` }],
    });
    const parts: Message["parts"] = [];
    for (let tool = 0; tool < TOOLS_PER_TURN; tool += 1) {
      parts.push({
        type: "tool_call",
        tool_call_id: `t${turn}-${tool}`,
        name: "Read",
        status: "completed",
        path: `src/mod-${turn}/file-${tool}.ts`,
      });
    }
    const live = turn === TURNS - 1;
    const repeats = live ? lastTokens : TOKENS;
    parts.push({
      type: "text",
      text: `answer ${turn} ${TOKEN.repeat(repeats)}`.trimEnd(),
      message_id: `p${turn}`,
    });
    messages.push({
      id: `a${turn}`,
      role: "assistant",
      parts,
      streaming: live,
    });
  }
  return messages;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

const Row = React.memo(function Row({
  message,
  streamTail,
}: {
  message: Message;
  streamTail: boolean;
}) {
  const textPart = message.parts.find((part): part is TextPart => part.type === "text");
  const tools = message.parts.filter((part): part is ToolPart => part.type === "tool_call");
  const source = textPart?.text ?? "";
  const shown = useSmoothStreamText(source, streamTail);
  return (
    <article className={`row role-${message.role}`} data-id={message.id}>
      {message.role === "user" ? (
        <p className="user">{source}</p>
      ) : (
        <>
          <ul className="tools">
            {tools.map((tool) => (
              <li key={tool.tool_call_id} className="tool">
                <strong>{tool.name}</strong>
                <span>{tool.status}</span>
                <code>{tool.path}</code>
              </li>
            ))}
          </ul>
          <p className="answer">{shown}</p>
        </>
      )}
    </article>
  );
});

function List({
  mode,
  messages,
}: {
  mode: Mode;
  messages: Message[];
}) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const lastId = messages.at(-1)?.id;
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) =>
      messages[index]?.role === "user" ? USER_ESTIMATE : ASSISTANT_ESTIMATE,
    overscan: OVERSCAN,
    gap: GAP,
    getItemKey: (index) => {
      const message = messages[index];
      if (mode === "main") return message?.id ?? index;
      return message?.id ?? `legacy:${index}`;
    },
    useAnimationFrameWithResizeObserver: true,
  });

  useLayoutEffect(() => {
    virtualizer.scrollToIndex(messages.length - 1, { align: "end", behavior: "auto" });
  }, [messages.length, virtualizer]);

  return (
    <div
      ref={parentRef}
      className="agent-chat-scroll"
      data-scroll="1"
      style={{ height: VIEWPORT, overflow: "auto" }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const message = messages[item.index]!;
          const streamTail = mode === "branch" && message.id === lastId && message.streaming === true;
          return (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${item.start}px)`,
              }}
            >
              <Row message={message} streamTail={streamTail} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BenchApp({ mode }: { mode: Mode }) {
  const [messages, setMessages] = useState(() => transcript(0));
  const commitsRef = useRef<ProfilerCommit[]>([]);
  const recordingRef = useRef(false);
  const pendingTextRef = useRef("");

  const onRender = useCallback(
    (
      _id: string,
      phase: "mount" | "update" | "nested-update",
      actualDuration: number,
      baseDuration: number,
      _startTime: number,
      commitTime: number,
    ) => {
      if (!recordingRef.current) return;
      commitsRef.current.push({ phase, actualDuration, baseDuration, commitTime });
    },
    [],
  );

  useEffect(() => {
    const handle: BenchHandle = {
      mode,
      fixture: { turns: TURNS, tools_per_turn: TOOLS_PER_TURN, tokens_per_answer: TOKENS },
      async runScroll() {
        const scroller = document.querySelector<HTMLElement>("[data-scroll='1']");
        if (!scroller) throw new Error("missing scroller");
        scroller.scrollTop = 0;
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const frames: number[] = [];
        const started = performance.now();
        const distance = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        const duration = 2000;
        await new Promise<void>((resolve) => {
          const tick = (now: number) => {
            frames.push(now);
            const elapsed = now - started;
            const t = Math.min(1, elapsed / duration);
            scroller.scrollTop = distance * t;
            if (t < 1) requestAnimationFrame(tick);
            else resolve();
          };
          requestAnimationFrame(tick);
        });
        const dts: number[] = [];
        for (let i = 1; i < frames.length; i += 1) {
          dts.push(frames[i]! - frames[i - 1]!);
        }
        const mean = dts.reduce((sum, dt) => sum + dt, 0) / Math.max(1, dts.length);
        return {
          fps: mean > 0 ? 1000 / mean : 0,
          frame_count: dts.length,
          long_frames_over_16_67ms: dts.filter((dt) => dt > 16.67).length,
          duration_ms: performance.now() - started,
          scroll_height: scroller.scrollHeight,
          client_height: scroller.clientHeight,
          raw_frame_dts_ms: dts.map((dt) => Number(dt.toFixed(3))),
        };
      },
      async runTokens() {
        commitsRef.current = [];
        recordingRef.current = true;
        pendingTextRef.current = "";
        const flushSnapshot = () => {
          const text = pendingTextRef.current;
          setMessages((current) => {
            const last = current.at(-1);
            if (!last || last.role !== "assistant") return current;
            const nextLast: Message = {
              ...last,
              streaming: true,
              parts: last.parts.map((part) =>
                part.type === "text" ? { ...part, text: `answer ${TURNS - 1} ${text}`.trimEnd() } : part,
              ),
            };
            if (nextLast === last) return current;
            return [...current.slice(0, -1), nextLast];
          });
        };

        if (mode === "branch") {
          const timer = window.setInterval(flushSnapshot, COALESCE_MS);
          for (let i = 0; i < TOKENS; i += 1) {
            pendingTextRef.current += TOKEN;
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          }
          flushSnapshot();
          window.clearInterval(timer);
          await new Promise((resolve) => window.setTimeout(resolve, 240));
        } else {
          for (let i = 0; i < TOKENS; i += 1) {
            pendingTextRef.current += TOKEN;
            flushSnapshot();
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          }
        }
        recordingRef.current = false;
        const raw = commitsRef.current.map((commit) => ({
          ...commit,
          actualDuration: Number(commit.actualDuration.toFixed(3)),
          baseDuration: Number(commit.baseDuration.toFixed(3)),
        }));
        const durations = raw.map((commit) => commit.actualDuration);
        const total = durations.reduce((sum, value) => sum + value, 0);
        return {
          token_count: TOKENS,
          commit_count: raw.length,
          total_actual_duration_ms: Number(total.toFixed(3)),
          mean_actual_duration_ms: Number((total / Math.max(1, raw.length)).toFixed(3)),
          p50_actual_duration_ms: Number(percentile(durations, 50).toFixed(3)),
          p95_actual_duration_ms: Number(percentile(durations, 95).toFixed(3)),
          per_token_actual_duration_ms: Number((total / TOKENS).toFixed(3)),
          raw_commits: raw,
        };
      },
    };
    (window as unknown as { __ATMOS_STREAM_BENCH: BenchHandle }).__ATMOS_STREAM_BENCH = handle;
  }, [mode, onRender]);

  const header = useMemo(
    () => `${mode} · ${TURNS} turns · ${TOOLS_PER_TURN} tools · last-turn ${TOKENS} tokens`,
    [mode],
  );

  return (
    <div>
      <h1>{header}</h1>
      <Profiler id="transcript" onRender={onRender}>
        <List mode={mode} messages={messages} />
      </Profiler>
    </div>
  );
}

const params = new URLSearchParams(window.location.search);
const mode = params.get("mode") === "branch" ? "branch" : "main";

const css = document.createElement("style");
css.textContent = `
  html, body { margin: 0; font: 13px/1.4 ui-sans-serif, system-ui; background: #111; color: #eee; }
  h1 { font-size: 14px; margin: 8px 12px; }
  .agent-chat-scroll { border: 1px solid #333; margin: 0 12px 12px; background: #1a1a1a; }
  .row { padding: 8px 12px; }
  .role-user { background: #243044; }
  .role-assistant { background: #1d1d1d; }
  .tools { margin: 0 0 8px; padding: 0; list-style: none; display: grid; gap: 4px; }
  .tool { display: flex; gap: 8px; font-size: 12px; background: #262626; padding: 4px 6px; }
  .answer, .user { margin: 0; white-space: pre-wrap; }
`;
document.head.append(css);

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(<BenchApp mode={mode} />);
