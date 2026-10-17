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
import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { importPure } from "./process-fold.test";

const here = dirname(fileURLToPath(import.meta.url));

async function importPartReveal(): Promise<Record<string, unknown>> {
  const source = readFileSync(join(here, "motion/part-reveal.tsx"), "utf8");
  const marker = source.indexOf("// @view");
  if (marker < 0) throw new Error("missing view marker");
  // @ts-expect-error Bun.Transpiler is provided by the test runtime
  const js = new Bun.Transpiler({ loader: "tsx" }).transformSync(source.slice(0, marker));
  const out = join(tmpdir(), "atmos-pure-part-reveal.js");
  writeFileSync(out, js);
  return import(out) as Promise<Record<string, unknown>>;
}

function assistant(parts: AgentPart[], streaming = true): AgentMessage {
  return { id: "m", parts, role: "assistant", streaming };
}

function tool(
  status: string,
  title: string | null,
  extra?: {
    kind?: "read" | "search";
    name?: string;
    parent?: string;
    path?: string;
    query?: string;
  },
): AgentPart {
  const kind = extra?.kind ?? "read";
  const part = {
    kind,
    name: extra?.name ?? (kind === "search" ? "Search" : "Read"),
    params:
      kind === "search"
        ? { query: extra?.query ?? "ready", type: "search" }
        : { path: extra?.path ?? "a.ts", type: "read" },
    status: "running",
    title,
    tool_call_id: extra?.parent ? "child" : "tool-1",
    type: "tool_call",
    ...(extra?.parent ? { parent_tool_call_id: extra.parent } : {}),
  } as AgentPart;
  (part as { status: string }).status = status;
  return part;
}

function thinking(open: boolean, parent?: string): AgentPart {
  const part: AgentPart = {
    text: "hmm",
    type: "thinking",
    ...(parent ? { parent_tool_call_id: parent } : {}),
  };
  return Object.assign(part, { closed_at: open ? null : "2026-01-01T00:00:00.000Z" });
}

describe("activity row label", () => {
  test("uses the same activity choice as the web footer", async () => {
    const row = await importPure("activity-row.tsx");
    const label = row.activityRowLabel as (
      message: AgentMessage | null | undefined,
      turnOpen?: boolean,
    ) => string;

    expect(label(assistant([tool("running", "Read notes")]))).toBe("Read notes a.ts");
    expect(label(assistant([tool("pending", "Queued read")]))).toBe("Queued read a.ts");
    expect(label(assistant([tool("in_progress", "Still reading")]))).toBe("Still reading a.ts");
    expect(label(assistant([tool("running", "  ", { name: "Read" })]))).toBe("Read a.ts");
    expect(label(assistant([tool("running", "", { name: "" })]))).toBe("Read a.ts");
    expect(label(assistant([tool("running", "First"), tool("completed", "Done")]))).toBe(
      "First a.ts",
    );
    expect(label(assistant([tool("completed", "Done"), tool("running", "Latest")]))).toBe(
      "Latest a.ts",
    );
    expect(
      label(assistant([tool("running", "Hidden", { parent: "parent" }), tool("running", "Shown")])),
    ).toBe("Shown a.ts");
    expect(
      label(assistant([tool("running", "Hidden", { parent: "parent" }), thinking(true, "parent")])),
    ).toBe("Generating...");
    expect(label(assistant([tool("completed", "Done"), thinking(true)]))).toBe("Thinking...");
    expect(label(assistant([thinking(false)]))).toBe("Thinking...");
    expect(label(assistant([thinking(true, "parent")]))).toBe("Generating...");
    expect(label(assistant([{ text: "Hello", type: "text" }]))).toBe("Streaming...");
    expect(label(assistant([{ text: "Hello", type: "text" }], false), true)).toBe("Generating...");
    expect(label(assistant([tool("running", "src/theme.ts", { path: "src/theme.ts" })]))).toBe(
      "Read theme.ts",
    );
    expect(label(assistant([tool("running", "ready", { kind: "search", query: "ready" })]))).toBe(
      "ready",
    );
    expect(
      label(
        assistant([
          {
            action: "resume",
            status: "running",
            type: "session_lifecycle",
          },
        ]),
      ),
    ).toBe("Resuming session...");
    expect(label(null)).toBe("Working");
    expect(label({ id: "u", parts: [], role: "user" })).toBe("Working");
  });
});

describe("part reveal gate", () => {
  test("skips the first paint of a historical transcript and plays new streaming rows", async () => {
    const reveal = await importPartReveal();
    const play = reveal.shouldPlayPartReveal as (input: {
      primed: boolean;
      seen: boolean;
      streaming: boolean;
    }) => boolean;

    expect(play({ primed: false, seen: false, streaming: false })).toBe(false);
    expect(play({ primed: false, seen: false, streaming: true })).toBe(true);
    expect(play({ primed: true, seen: false, streaming: false })).toBe(true);
    expect(play({ primed: true, seen: true, streaming: true })).toBe(false);
  });
});
