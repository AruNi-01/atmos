import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "bun:test";
import { compareFixtures, scrubParityText } from "../../../scripts/agent-chat-parity/compare";
import {
  PARITY_FIXTURE_IDS,
  PARITY_FIXTURES,
  parityFixtureById,
  projectParityTree,
  type ParityNode,
} from "./parity-tree";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/parity");

function walk(nodes: readonly ParityNode[], visit: (node: ParityNode) => void): void {
  for (const node of nodes) {
    visit(node);
    if (node.children) walk(node.children, visit);
  }
}

function kinds(nodes: readonly ParityNode[]): string[] {
  return nodes.map((node) => node.kind);
}

function findLabel(
  nodes: readonly ParityNode[],
  label: string,
  kind?: string,
): ParityNode | undefined {
  let found: ParityNode | undefined;
  walk(nodes, (node) => {
    if (!found && node.label === label && (kind == null || node.kind === kind)) found = node;
  });
  return found;
}

function labels(nodes: readonly ParityNode[]): string[] {
  const found: string[] = [];
  walk(nodes, (node) => {
    if (node.label) found.push(node.label);
  });
  return found;
}

describe("parity fixtures", () => {
  it("matches every committed tree", () => {
    const report = compareFixtures();
    expect(report.mismatches).toEqual([]);
    expect(report.checked).toBe(PARITY_FIXTURE_IDS.length);
    expect(report.ok).toBe(true);
  });

  it("keeps fixture ids on disk aligned with the catalog", () => {
    const onDisk = readdirSync(fixtureDir)
      .filter((name) => /^F\d+\.json$/.test(name))
      .map((name) => name.slice(0, -".json".length))
      .sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)));
    expect(onDisk).toEqual([...PARITY_FIXTURE_IDS]);
    expect(PARITY_FIXTURES.map((fixture) => fixture.id)).toEqual([...PARITY_FIXTURE_IDS]);
  });

  it("rejects home directories and token prefixes", () => {
    expect(scrubParityText("see /Users/ada")).toEqual(["contains /Users/"]);
    expect(scrubParityText("src/main.ts")).toEqual([]);
  });
});

describe("projectParityTree", () => {
  it("outlines F1 markdown without drawing mermaid", () => {
    const fixture = parityFixtureById("F1");
    expect(fixture).toBeDefined();
    const tree = projectParityTree(fixture!.messages);
    const text = tree.find((node) => node.kind === "text");
    expect(text?.children?.map((node) => node.kind)).toEqual([
      "heading",
      "list",
      "table",
      "paragraph",
      "code",
      "code",
      "mermaid",
      "paragraph",
      "path",
      "link",
    ]);
    expect(findLabel(tree, "Release notes")?.kind).toBe("heading");
    expect(findLabel(tree, "Check the build, Update the notes")?.kind).toBe("list");
    expect(findLabel(tree, "Step, Owner")?.kind).toBe("table");
    expect(findLabel(tree, "bun test")?.kind).toBe("code");
    expect(findLabel(tree, "ts")?.kind).toBe("code");
    expect(findLabel(tree, "mermaid")?.kind).toBe("mermaid");
    expect(findLabel(tree, "src/main.ts")?.kind).toBe("path");
    expect(findLabel(tree, "http://example.com/docs")?.kind).toBe("link");
    expect(kinds(tree).includes("diagram")).toBe(false);
    let sawDiagram = false;
    walk(tree, (node) => {
      if (node.kind === "diagram") sawDiagram = true;
    });
    expect(sawDiagram).toBe(false);
  });

  it("labels F2 thinking with and without a duration", () => {
    const fixture = parityFixtureById("F2")!;
    const tree = projectParityTree(fixture.messages);
    expect(findLabel(tree, "Thought for 2s", "thinking")?.kind).toBe("thinking");
    expect(findLabel(tree, "Thinking", "thinking")?.kind).toBe("thinking");
    expect(findLabel(tree, "Worked for 4s")?.expanded).toBe(false);
  });

  it("collapses the F3 settled process and opens it from expand", () => {
    const fixture = parityFixtureById("F3")!;
    const assistant = fixture.messages.find((message) => message.role === "assistant");
    expect(assistant?.worked_ms).toBe(42000);
    expect(assistant?.streaming).toBe(false);
    expect(assistant?.completed_at).toBeTruthy();

    const closed = projectParityTree(fixture.messages);
    const process = closed.find((node) => node.kind === "process");
    expect(process?.label).toBe("Worked for 42s");
    expect(process?.expanded).toBe(false);
    const group = process?.children?.find((node) => node.kind === "tool_group");
    expect(group?.label).toBe("1 write, 1 search, 1 read");
    expect(group?.expanded).toBe(false);
    expect(group?.children?.[0]).toMatchObject({ kind: "diff_stats", label: "-1 / +3" });

    const processOnly = projectParityTree(fixture.messages, { expand: "process" });
    const opened = processOnly.find((node) => node.kind === "process");
    expect(opened?.expanded).toBe(true);
    expect(opened?.children?.find((node) => node.kind === "tool_group")?.expanded).toBe(false);

    const all = projectParityTree(fixture.messages, { expand: "all" });
    const allGroup = all
      .find((node) => node.kind === "process")
      ?.children?.find((node) => node.kind === "tool_group");
    expect(allGroup?.expanded).toBe(true);
    expect(allGroup?.children?.some((node) => node.kind === "thinking" && node.expanded)).toBe(
      true,
    );
  });

  it("keeps F4 script ordered and separate from the settled tree", () => {
    const fixture = parityFixtureById("F4")!;
    const script = fixture.script ?? [];
    expect(script.length).toBeGreaterThan(0);
    const times = script.map((step) => step.atMs);
    expect([...times].sort((left, right) => left - right)).toEqual(times);
    expect(script[0]?.event.payload.type).toBe("text_chunk");
    expect(script.some((step) => step.event.payload.type === "tool_call_started")).toBe(true);
    expect(script.at(-1)?.event.payload.type).toBe("turn_completed");
    const assistant = fixture.messages.find((message) => message.role === "assistant");
    expect(assistant?.completed_at).toBeTruthy();
    expect(assistant?.streaming).toBe(false);
    expect(findLabel(projectParityTree(fixture.messages), "Worked for 15s")?.kind).toBe("process");
  });

  it("keeps F5 ANSI inside the command body", () => {
    const tree = projectParityTree(parityFixtureById("F5")!.messages);
    expect(findLabel(tree, "bun test src")?.kind).toBe("text");
    expect(labels(tree).some((label) => label.includes("\u001b[32m"))).toBe(true);
    expect(findLabel(tree, "Worked for 5s")?.expanded).toBe(false);
  });

  it("groups F6 edit and patch writes", () => {
    const tree = projectParityTree(parityFixtureById("F6")!.messages);
    const group = findLabel(tree, "2 writes");
    expect(group?.kind).toBe("tool_group");
    expect(
      group?.children?.some((node) => node.kind === "diff_stats" && node.label?.includes("+")),
    ).toBe(true);
    expect(group?.children?.some((node) => node.kind === "patch")).toBe(true);
  });

  it("uses presentAgentTool kinds for F7", () => {
    const tree = projectParityTree(parityFixtureById("F7")!.messages);
    const seen = new Set<string>();
    walk(tree, (node) => seen.add(node.kind));
    expect(seen.has("web_search")).toBe(true);
    expect(seen.has("images")).toBe(true);
    expect(seen.has("markdown")).toBe(true);
    expect(seen.has("plan_document")).toBe(false);
    expect(seen.has("diagram")).toBe(false);
    expect(findLabel(tree, "2 tools, 1 search")?.kind).toBe("tool_group");
  });

  it("nests F8 child tools under the subagent and keeps the wait row", () => {
    const tree = projectParityTree(parityFixtureById("F8")!.messages);
    const subagent = findLabel(tree, "Inspect src/main.ts");
    expect(subagent?.children?.some((node) => node.kind === "code")).toBe(true);
    expect(findLabel(tree, "Waiting for subagent")?.kind).toBe("text");
    expect(findLabel(tree, "Worked for 11s")?.expanded).toBe(false);
  });

  it("projects F9 session chrome tones", () => {
    const tree = projectParityTree(parityFixtureById("F9")!.messages);
    expect(labels(tree)).toEqual(
      expect.arrayContaining([
        "Creating session...",
        "Created session",
        "Failed to create session: provider offline",
        "Switched model from fast to standard",
        "Couldn't switch model in this session",
        "Couldn't switch mode in this session",
        "The session could not continue.",
      ]),
    );
    const hints = tree.filter((node) => node.kind === "session_hint");
    expect(hints.map((node) => node.tone)).toEqual(["warning", "error"]);
    expect(findLabel(tree, "Failed to create session: provider offline")?.tone).toBe("error");
    expect(findLabel(tree, "The session could not continue.")?.tone).toBe("error");
    expect(tree.some((node) => node.kind === "process")).toBe(false);
  });

  it("collapses long F10 user text and opens meta from an expand key", () => {
    const fixture = parityFixtureById("F10")!;
    expect(fixture.messages.find((message) => message.id === "f10-pending")?.pending).toBe(true);
    const tree = projectParityTree(fixture.messages);
    const users = tree.filter((node) => node.kind === "user");
    expect(users.map((node) => node.expanded)).toEqual([
      false,
      false,
      undefined,
      undefined,
      undefined,
    ]);
    expect(findLabel(tree, "Pasted: 12 lines")?.kind).toBe("paste");
    expect(findLabel(tree, "http://example.com/guide")?.kind).toBe("link");
    expect(findLabel(tree, "note.txt")?.kind).toBe("attachment");
    expect(findLabel(tree, "Pending")?.kind).toBe("pending");
    expect(
      users.every((node) =>
        node.children?.some((child) => child.kind === "user-meta" && child.expanded === false),
      ),
    ).toBe(true);

    const opened = projectParityTree(fixture.messages, { expand: { "user-meta:f10-url": true } });
    const url = opened.find((node) => node.label === "See http://example.com/guide");
    expect(url?.children?.find((child) => child.kind === "user-meta")?.expanded).toBe(true);
    const pending = opened.find((node) => node.label === "Send this");
    expect(pending?.children?.find((child) => child.kind === "user-meta")?.expanded).toBe(false);
  });

  it("shows F11 historic permission and the pending card", () => {
    const fixture = parityFixtureById("F11")!;
    const tree = projectParityTree(fixture.messages, { cards: fixture.cards });
    const permissions = tree.filter((node) => node.kind === "permission");
    expect(permissions.map((node) => node.label)).toEqual([
      "Read src/main.ts",
      "Questions for you",
    ]);
    expect(permissions[0]?.children?.some((node) => node.label === "allowed")).toBe(true);
  });

  it("projects every F12 card", () => {
    const fixture = parityFixtureById("F12")!;
    const tree = projectParityTree(fixture.messages, { cards: fixture.cards });
    const queue = findLabel(tree, "Message Queue");
    expect(queue?.kind).toBe("queue");
    expect(queue?.children).toHaveLength(3);
    expect(labels(tree)).toEqual(
      expect.arrayContaining([
        "Plan",
        "Background",
        "Subagent Tasks",
        "Goal",
        "Research",
        "Context Usage",
        "2400 / 16000",
        "Questions for you",
      ]),
    );
  });

  it("projects all 200 F13 messages", () => {
    const fixture = parityFixtureById("F13")!;
    expect(fixture.messages).toHaveLength(200);
    expect(projectParityTree(fixture.messages)).toHaveLength(200);
  });
});
