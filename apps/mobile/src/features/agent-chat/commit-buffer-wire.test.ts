// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync, writeFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { tmpdir } from "node:os";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import type { AgentChatPayload } from "@atmos/api-types/ws/dto/agent-chat";
import { AGENT_CHAT_COMMIT_FLUSH_MS, createAgentChatCommitBuffer } from "@atmos/agent-transcript";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = join(here, "../../../../..");

async function importCommitWire(): Promise<{
  pushAgentChatCommit: (
    buffer: ReturnType<typeof createAgentChatCommitBuffer>,
    type: AgentChatPayload["type"],
    reducedMotion: boolean,
  ) => void;
  shouldFlushAgentEvent: (type: AgentChatPayload["type"], reducedMotion: boolean) => boolean;
}> {
  const source = readFileSync(join(here, "use-agent-chat-thread.ts"), "utf8");
  const marker = source.indexOf("// @hook");
  if (marker < 0) throw new Error("missing hook marker");
  const head = source
    .slice(0, marker)
    .replaceAll(
      'from "@atmos/agent-transcript"',
      `from "${join(workspace, "packages/agent-transcript/src/index.ts")}"`,
    );
  // @ts-expect-error Bun.Transpiler is provided by the test runtime
  const js = new Bun.Transpiler({ loader: "tsx" }).transformSync(head);
  const out = join(tmpdir(), "atmos-pure-use-agent-chat-thread.js");
  writeFileSync(out, js);
  return import(out);
}

function clockBuffer() {
  let now = 0;
  const commits: number[] = [];
  const buffer = createAgentChatCommitBuffer({
    flushMs: AGENT_CHAT_COMMIT_FLUSH_MS,
    now: () => now,
    onCommit: () => {
      commits.push(now);
    },
  });
  return {
    buffer,
    commits,
    advance(ms: number) {
      now += ms;
    },
  };
}

describe("agent chat commit buffer wire", () => {
  test("batches text until 56ms, and flushes turn end, stop, and error immediately", async () => {
    expect(AGENT_CHAT_COMMIT_FLUSH_MS).toBe(56);
    const wire = await importCommitWire();
    expect(wire.shouldFlushAgentEvent("text_chunk", false)).toBe(false);
    expect(wire.shouldFlushAgentEvent("turn_completed", false)).toBe(true);
    expect(wire.shouldFlushAgentEvent("runtime_status", false)).toBe(true);
    expect(wire.shouldFlushAgentEvent("session_lifecycle", false)).toBe(true);
    expect(wire.shouldFlushAgentEvent("tool_call_updated", true)).toBe(true);

    const paced = clockBuffer();
    wire.pushAgentChatCommit(paced.buffer, "text_chunk", false);
    expect(paced.commits).toEqual([]);
    expect(paced.buffer.maybeFlush()).toBe(false);
    paced.advance(55);
    expect(paced.buffer.maybeFlush()).toBe(false);
    paced.advance(1);
    expect(paced.buffer.maybeFlush()).toBe(true);
    expect(paced.commits).toEqual([56]);

    const turnEnd = clockBuffer();
    wire.pushAgentChatCommit(turnEnd.buffer, "turn_snapshot", false);
    wire.pushAgentChatCommit(turnEnd.buffer, "turn_completed", false);
    expect(turnEnd.commits).toEqual([0]);
    expect(turnEnd.buffer.isDirty()).toBe(false);

    const stopped = clockBuffer();
    wire.pushAgentChatCommit(stopped.buffer, "text_chunk", false);
    wire.pushAgentChatCommit(stopped.buffer, "turn_completed", false);
    expect(stopped.commits).toEqual([0]);

    const errored = clockBuffer();
    wire.pushAgentChatCommit(errored.buffer, "text_chunk", false);
    wire.pushAgentChatCommit(errored.buffer, "session_lifecycle", false);
    expect(errored.commits).toEqual([0]);

    const status = clockBuffer();
    wire.pushAgentChatCommit(status.buffer, "runtime_status", false);
    expect(status.commits).toEqual([0]);

    const reduced = clockBuffer();
    wire.pushAgentChatCommit(reduced.buffer, "tool_call_updated", true);
    expect(reduced.commits).toEqual([0]);
    expect(reduced.buffer.isDirty()).toBe(false);
  });
});
