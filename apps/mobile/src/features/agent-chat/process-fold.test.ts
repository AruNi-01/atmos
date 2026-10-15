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
import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import {
  TREE_BRANCH_FIRST_START_Y,
  TREE_BRANCH_MID_Y,
  TREE_BRANCH_RADIUS,
  treeReachPath,
  treeTrunkPath,
} from "@atmos/agent-transcript/agent-tree-branch";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = join(here, "../../../../..");

export async function importPure(filename: string): Promise<Record<string, unknown>> {
  const source = readFileSync(join(here, filename), "utf8");
  const marker = source.indexOf("// @view");
  if (marker < 0) throw new Error(`missing view marker in ${filename}`);
  const head = source
    .slice(0, marker)
    .replaceAll(
      'from "@atmos/agent-transcript/agent-tree-branch"',
      `from "${join(workspace, "packages/agent-transcript/src/agent-tree-branch.ts")}"`,
    )
    .replaceAll(
      'from "@atmos/agent-transcript"',
      `from "${join(workspace, "packages/agent-transcript/src/index.ts")}"`,
    )
    .replaceAll('from "./copy"', `from "${join(here, "copy.ts")}"`);
  // @ts-expect-error Bun.Transpiler is provided by the test runtime
  const js = new Bun.Transpiler({ loader: "tsx" }).transformSync(head);
  const out = join(tmpdir(), `atmos-pure-${filename.replace(/\.tsx$/, "")}.js`);
  writeFileSync(out, js);
  return import(out) as Promise<Record<string, unknown>>;
}

function tool(id: string, status: "completed" | "running" = "completed"): AgentPart {
  return {
    type: "tool_call",
    tool_call_id: id,
    name: "Read",
    kind: "read",
    status,
    params: { type: "read", path: "a.ts" },
  };
}

describe("process fold", () => {
  test("header uses worked-for when the turn has duration, otherwise Process", async () => {
    const fold = await importPure("process-fold.tsx");
    const label = fold.processHeaderLabel as (ms: number | null | undefined) => string;
    expect(label(65_000)).toBe("Worked for 1m5s");
    expect(label(0)).toBe("Process");
    expect(label(null)).toBe("Process");
    expect(label(undefined)).toBe("Process");
  });

  test("settle writes expanded only on the transition into collapsible, and only when unset", async () => {
    const fold = await importPure("process-fold.tsx");
    const settle = fold.processExpandOnSettle as (input: {
      canCollapse: boolean;
      wasCollapsible: boolean;
      hasStoredProcess: boolean;
      userInspecting: boolean;
    }) => { expanded: boolean | null; wasCollapsible: boolean };

    expect(
      settle({
        canCollapse: false,
        wasCollapsible: false,
        hasStoredProcess: false,
        userInspecting: false,
      }),
    ).toEqual({ expanded: null, wasCollapsible: false });

    expect(
      settle({
        canCollapse: true,
        wasCollapsible: true,
        hasStoredProcess: false,
        userInspecting: false,
      }),
    ).toEqual({ expanded: null, wasCollapsible: true });

    expect(
      settle({
        canCollapse: true,
        wasCollapsible: false,
        hasStoredProcess: true,
        userInspecting: false,
      }),
    ).toEqual({ expanded: null, wasCollapsible: true });

    expect(
      settle({
        canCollapse: true,
        wasCollapsible: false,
        hasStoredProcess: false,
        userInspecting: true,
      }),
    ).toEqual({ expanded: true, wasCollapsible: true });

    expect(
      settle({
        canCollapse: true,
        wasCollapsible: false,
        hasStoredProcess: false,
        userInspecting: false,
      }),
    ).toEqual({ expanded: false, wasCollapsible: true });
  });

  test("wait section keeps its label and moves the open flag to the expand store", async () => {
    const fold = await importPure("process-fold.tsx");
    const label = fold.waitForLabel as (count: number) => string;
    const key = fold.agentChatWaitExpandKey as (id: string) => string;
    expect(label(1)).toBe("Wait for 1 background agent");
    expect(label(0)).toBe("Wait for 1 background agent");
    expect(label(3)).toBe("Wait for 3 background agents");
    expect(key("m1")).toBe("wait:m1");
  });
});

describe("tool group", () => {
  test("key, overview sentence, and persistent open follow the web compact group", async () => {
    const group = await importPure("tool-group.tsx");
    const key = group.toolGroupKey as (parts: AgentPart[], indexes: number[]) => string;
    const overview = group.toolGroupOverviewLabel as (parts: AgentPart[]) => string;
    const open = group.persistentToolGroupOpen as (
      stored: boolean | undefined,
      running: boolean,
    ) => boolean;

    expect(key([tool("call-1")], [4, 5])).toBe("call-1");
    expect(key([{ type: "thinking", text: "hmm" }], [3, 4])).toBe("3-4");
    expect(overview([tool("a"), tool("b")])).toBe("2 reads");
    expect(
      overview([
        {
          type: "tool_call",
          tool_call_id: "cmd",
          name: "Bash",
          kind: "execute",
          status: "completed",
          params: { type: "execute", command: "ls", background: false },
        },
        tool("read-1"),
      ]),
    ).toBe("Ran 1 command, 1 read");
    expect(overview([{ type: "thinking", text: "hmm" }])).toBe("Thinking");
    expect(overview([])).toBe("Working");
    expect(open(false, true)).toBe(false);
    expect(open(true, false)).toBe(true);
    expect(open(undefined, true)).toBe(true);
    expect(open(undefined, false)).toBe(false);
  });
});

describe("tool tree", () => {
  test("strokes use the shared reach and trunk paths and draw the trunk only between rows", async () => {
    const tree = await importPure("tool-tree.tsx");
    const strokes = tree.toolTreeStrokes as (input: {
      first: boolean;
      last: boolean;
      height: number;
    }) => { reach: string; trunk: string | null };
    const first = strokes({ first: true, last: false, height: 40 });
    expect(first.reach).toBe(treeReachPath(TREE_BRANCH_FIRST_START_Y, TREE_BRANCH_MID_Y));
    expect(first.trunk).toBe(treeTrunkPath(TREE_BRANCH_MID_Y - TREE_BRANCH_RADIUS, 40));
    expect(strokes({ first: false, last: true, height: 40 }).trunk).toBeNull();
    expect(strokes({ first: false, last: false, height: 0 }).trunk).toBeNull();
  });
});

describe("transcript source", () => {
  test("segments at compact density and no longer opens a detail sheet", () => {
    const transcript = readFileSync(join(here, "AgentChatTranscript.tsx"), "utf8");
    expect(transcript).toContain("segmentAssistantParts(message.parts, DEFAULT_TOOL_CALL_DENSITY)");
    expect(transcript).not.toContain("AgentChatDetailSheet");
    expect(transcript).not.toContain("event-model");
    const tree = readFileSync(join(here, "tool-tree.tsx"), "utf8");
    expect(tree).toContain("treeReachPath");
    expect(tree).toContain("treeTrunkPath");
    expect(tree).toContain("TREE_LINE_ALPHA");
    expect(tree).not.toContain("strokeDashoffset");
    expect(tree).not.toContain("strokeDasharray");
  });
});
