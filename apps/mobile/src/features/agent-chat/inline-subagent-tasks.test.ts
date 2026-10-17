// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentToolCallPart } from "@atmos/agent-transcript";
import {
  formatSubagentTaskLine,
  inlineSubagentTasksByMessageId,
  subagentActivityLabel,
  subagentMarkDots,
  subagentRosterIds,
  subagentTasksCountLabel,
  titleCaseSubagentType,
} from "./inline-subagent-tasks";

const here = dirname(fileURLToPath(import.meta.url));

function assistant(parts: AgentPart[], extra: Partial<AgentMessage> = {}): AgentMessage {
  return { id: "a1", role: "assistant", parts, ...extra };
}

function subagent(
  partial: Partial<AgentToolCallPart> & Pick<AgentToolCallPart, "tool_call_id">,
): AgentToolCallPart {
  return {
    type: "tool_call",
    name: "Task",
    title: "Explore tests",
    kind: "subagent",
    status: "running",
    params: {
      type: "subagent",
      description: "Inspect the relevant test coverage",
      agent_type: "explore",
    },
    ...partial,
  };
}

describe("inline subagent tasks", () => {
  test("title-cases the type and formats the dock line", () => {
    expect(titleCaseSubagentType("general-purpose")).toBe("General Purpose");
    expect(titleCaseSubagentType("generalPurpose")).toBe("General Purpose");
    const part = subagent({ tool_call_id: "s1" });
    expect(formatSubagentTaskLine(part)).toBe("Explore - Inspect the relevant test coverage");
    expect(
      formatSubagentTaskLine(
        subagent({
          tool_call_id: "s2",
          title: "Map the repo",
          params: { type: "subagent", description: "", agent_type: "explore" },
        }),
      ),
    ).toBe("Explore - Map the repo");
  });

  test("count label matches the web panel", () => {
    const running = subagent({ tool_call_id: "run" });
    const done = subagent({ tool_call_id: "done", status: "completed" });
    expect(subagentTasksCountLabel([running, done])).toBe("1 running");
    expect(subagentTasksCountLabel([done, { ...done, tool_call_id: "done-2" }])).toBe("All done");
    expect(
      subagentTasksCountLabel([{ ...done, status: "failed", tool_call_id: "bad" }, done]),
    ).toBe("1/2 completed");
  });

  test("live mode keeps the current turn off the inline card", () => {
    const previous = subagent({
      tool_call_id: "old",
      status: "completed",
      params: { type: "subagent", description: "First", agent_type: "explore" },
    });
    const current = subagent({
      tool_call_id: "new",
      params: { type: "subagent", description: "Now", agent_type: "explore" },
    });
    const messages: AgentMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "first" }] },
      assistant([previous], { id: "a-old" }),
      { id: "u2", role: "user", parts: [{ type: "text", text: "next" }] },
      assistant([current], { id: "a-new" }),
    ];
    const live = inlineSubagentTasksByMessageId(messages, { mode: "live" });
    expect([...live.keys()]).toEqual(["a-old"]);
    expect(live.get("a-old")?.map((part) => part.tool_call_id)).toEqual(["old"]);
    const transcript = inlineSubagentTasksByMessageId(messages, { mode: "transcript" });
    expect([...transcript.keys()]).toEqual(["a-old", "a-new"]);
  });

  test("a Claude task notification does not start a new turn", () => {
    const previous = subagent({
      tool_call_id: "old",
      status: "completed",
      params: { type: "subagent", description: "First", agent_type: "explore" },
    });
    const current = subagent({
      tool_call_id: "new",
      params: { type: "subagent", description: "Now", agent_type: "explore" },
    });
    const notice: AgentMessage = {
      id: "notice",
      role: "user",
      parts: [{ type: "text", text: "<task-notification>done</task-notification>" }],
    };
    const open = inlineSubagentTasksByMessageId([
      { id: "u1", role: "user", parts: [{ type: "text", text: "first" }] },
      assistant([previous], { id: "a-old" }),
      notice,
    ]);
    expect([...open.keys()]).toEqual([]);
    const closed = inlineSubagentTasksByMessageId([
      { id: "u1", role: "user", parts: [{ type: "text", text: "first" }] },
      assistant([previous], { id: "a-old" }),
      notice,
      { id: "u2", role: "user", parts: [{ type: "text", text: "next" }] },
      assistant([current], { id: "a-new" }),
    ]);
    expect([...closed.keys()]).toEqual(["a-old"]);
  });

  test("nested and roster subagents stay off the host card", () => {
    const parent = subagent({ tool_call_id: "parent" });
    const nested = subagent({
      tool_call_id: "child-sub",
      parent_tool_call_id: "parent",
      params: { type: "subagent", description: "Nested", agent_type: "explore" },
    });
    const roster = subagent({
      tool_call_id: "sa-plan",
      params: { type: "subagent", description: "goal plan writer", agent_type: "general-purpose" },
    });
    const messages: AgentMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "go" }] },
      assistant([parent, nested, roster], { id: "a1" }),
    ];
    expect(inlineSubagentTasksByMessageId(messages, { mode: "live" }).size).toBe(0);
    const transcript = inlineSubagentTasksByMessageId(messages, {
      excludeIds: subagentRosterIds({
        goal_id: "g",
        objective: "ship",
        status: "active",
        phase: "plan",
        children: [{ id: "sa-plan", label: "Plan", role: "planner" }],
      }),
      mode: "transcript",
    });
    expect(transcript.get("a1")?.map((part) => part.tool_call_id)).toEqual(["parent"]);
  });

  test("a running row shows the child activity and a settled row does not", () => {
    const parent = subagent({ tool_call_id: "parent" });
    const child: AgentPart = {
      type: "tool_call",
      tool_call_id: "child-read",
      name: "Read",
      kind: "read",
      status: "running",
      title: "Read notes",
      parent_tool_call_id: "parent",
      params: { type: "read", path: "a.ts" },
    };
    const messages = [assistant([parent, child])];
    expect(subagentActivityLabel(messages, parent)).toBe("Read notes a.ts");
    expect(subagentActivityLabel(messages, { ...parent, status: "completed" })).toBeNull();
  });

  test("the mark is the reduced-motion five-dot frame", () => {
    expect(subagentMarkDots("idle").length).toBeGreaterThan(0);
    expect(subagentMarkDots("thinking").length).toBeGreaterThan(0);
    const source = readFileSync(join(here, "inline-subagent-panel.tsx"), "utf8");
    expect(source).toContain("SUBAGENT_PANEL_RADIUS");
    expect(source).toContain("borderRadius: 14");
    expect(source).toContain("XCircleIcon");
    const row = source.slice(
      source.indexOf("function SubagentTaskRow"),
      source.indexOf("export function InlineSubagentPanel"),
    );
    expect(row).not.toContain("onPress");
    expect(row).toContain("chatForeground(theme.isDark)");
    expect(row).toContain("const muted = chatMutedForeground(theme.isDark)");
    expect(row).not.toContain("theme.colors.label");
    expect(row).not.toContain("theme.colors.secondaryLabel");
    const panel = source.slice(source.indexOf("export function InlineSubagentPanel"));
    expect(panel).toContain("const foreground = chatForeground(theme.isDark)");
    expect(panel).toContain("const muted = chatMutedForeground(theme.isDark)");
    expect(panel).toContain("<BotMessageSquareIcon color={muted}");
    expect(panel).not.toContain("theme.colors.label");
    expect(panel).not.toContain("theme.colors.secondaryLabel");
    const transcript = readFileSync(join(here, "AgentChatTranscript.tsx"), "utf8");
    expect(transcript).toContain('mode: "live"');
    expect(transcript).toContain("<InlineSubagentPanel");
  });

  test("the composer card uses the same panel when the live parts are present", () => {
    const card = readFileSync(join(here, "cards/subagent-card.tsx"), "utf8");
    expect(card).toContain("<InlineSubagentPanel");
    expect(card).toContain("tools.length > 0");
    const lane = readFileSync(join(here, "cards/lane-body.tsx"), "utf8");
    expect(lane).toContain("cards.subagentTools");
    const frame = readFileSync(join(here, "cards/expanded-card.tsx"), "utf8");
    expect(frame).toContain("bare");
    const thread = readFileSync(join(here, "AgentChatThreadScreen.tsx"), "utf8");
    expect(thread).toContain('lane.visible === "subagents" && cards.subagentTools.length > 0');
    const titles = readFileSync(join(here, "composer-cards.ts"), "utf8");
    const titleFn = titles.slice(
      titles.indexOf("function subagentTitle"),
      titles.indexOf("function visibleSubagentParts"),
    );
    expect(titleFn).toContain("part.title?.trim() || description || part.name.trim()");
  });
});
