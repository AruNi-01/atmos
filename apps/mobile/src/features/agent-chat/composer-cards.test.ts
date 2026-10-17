// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import type {
  AgentMessage,
  AgentPart,
  AgentQueueItem,
  GrokGoal,
  GrokWorkflow,
} from "@atmos/api-types/ws/dto/agent-chat";
import {
  cardPillTitle,
  deriveComposerCards,
  laneCardDrawsOwnFrame,
  moveQueueItem,
  planBodyMarkdown,
} from "./composer-cards";
import { copy } from "./copy";

function user(id: string, text: string): AgentMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

function assistant(id: string, parts: AgentPart[]): AgentMessage {
  return { id, role: "assistant", parts };
}

function emptyCards(
  patch: Partial<Parameters<typeof deriveComposerCards>[0]> = {},
): ReturnType<typeof deriveComposerCards> {
  return deriveComposerCards({
    messages: [],
    pendingPermission: null,
    pendingSessionOp: null,
    queue: [],
    grokGoal: null,
    grokWorkflow: null,
    sessionUsage: null,
    ...patch,
  });
}

const goal: GrokGoal = {
  goal_id: "g1",
  objective: "  Ship the lane  ",
  status: "running",
  phase: "build",
  children: [{ id: "chrome-1", label: "Planner", role: "planner" }],
};

const workflow: GrokWorkflow = {
  run_id: "w1",
  name: "Deep dive",
  objective: "",
  status: "running",
  phases: [{ id: "p1", title: "Search", state: "active" }],
  agents: [{ id: "agent-1", label: "Searcher", phase_id: "p1" }],
};

describe("card titles", () => {
  test("permission titles follow the web branch and never say Permission needed", () => {
    expect(
      cardPillTitle("permission", {
        permission: { questions: [{ id: "q" }] },
        goal: null,
        workflow: null,
      }),
    ).toBe("Questions for you");
    expect(
      cardPillTitle("permission", {
        permission: { tool: "exit_plan", description: "approve plan" },
        goal: null,
        workflow: null,
      }),
    ).toBe("Plan ready");
    expect(
      cardPillTitle("permission", {
        permission: { tool: "bash", description: "run tests" },
        goal: null,
        workflow: null,
      }),
    ).toBe("Permission requested");
    expect(cardPillTitle("permission", { permission: null, goal: null, workflow: null })).toBe(
      "Permission requested",
    );
    expect(copy.permissionTitle).toBe("Permission needed");
    expect(
      cardPillTitle("permission", {
        permission: { description: "run tests" },
        goal: null,
        workflow: null,
      }),
    ).not.toBe(copy.permissionTitle);
  });

  test("goal and workflow titles trim, then fall back", () => {
    expect(cardPillTitle("goal", { permission: null, goal, workflow: null })).toBe("Ship the lane");
    expect(
      cardPillTitle("goal", {
        permission: null,
        goal: { ...goal, objective: "  " },
        workflow: null,
      }),
    ).toBe("Goal");
    expect(cardPillTitle("workflow", { permission: null, goal: null, workflow })).toBe("Deep dive");
    expect(
      cardPillTitle("workflow", {
        permission: null,
        goal: null,
        workflow: { ...workflow, name: "  ", objective: "  " },
      }),
    ).toBe("Research");
    expect(cardPillTitle("session_op", { permission: null, goal: null, workflow: null })).toBe(
      "Session action requested",
    );
    expect(cardPillTitle("context", { permission: null, goal: null, workflow: null })).toBe(
      "Context Usage",
    );
    expect(cardPillTitle("queue", { permission: null, goal: null, workflow: null })).toBe(
      "Message Queue",
    );
  });
});

describe("deriveComposerCards", () => {
  test("plan markdown comes from a string or markdown/content, and an active goal hides it", () => {
    expect(planBodyMarkdown("hello")).toBe("hello");
    expect(planBodyMarkdown({ markdown: "# From markdown", content: "ignored" })).toBe(
      "# From markdown",
    );
    expect(planBodyMarkdown({ content: "from content" })).toBe("from content");
    expect(planBodyMarkdown({})).toBe("");

    const stringPlan = emptyCards({
      messages: [user("u1", "go"), assistant("a1", [{ type: "plan", plan: "# Do it" }])],
    });
    expect(stringPlan.available).toContain("plan");
    expect(stringPlan.planText).toBe("# Do it");

    const objectPlan = emptyCards({
      messages: [assistant("a1", [{ type: "plan", plan: { content: "body" } }])],
    });
    expect(objectPlan.planText).toBe("body");

    const emptyPlan = emptyCards({
      messages: [assistant("a1", [{ type: "plan", plan: "  " }])],
    });
    expect(emptyPlan.available).toContain("plan");
    expect(emptyPlan.planText).toBe("  ");

    const hidden = emptyCards({
      grokGoal: goal,
      messages: [assistant("a1", [{ type: "plan", plan: "# hidden" }])],
    });
    expect(hidden.available).not.toContain("plan");
    expect(hidden.available).toContain("goal");
    expect(hidden.planText).toBe("");
  });

  test("background cards are live execute tools with background true", () => {
    const cards = emptyCards({
      messages: [
        assistant("a1", [
          {
            type: "tool_call",
            tool_call_id: "bg",
            name: "bash",
            kind: "execute",
            status: "running",
            params: { type: "execute", command: " npm test ", background: true },
          },
          {
            type: "tool_call",
            tool_call_id: "fg",
            name: "bash",
            kind: "execute",
            status: "running",
            params: { type: "execute", command: "echo hi", background: false },
          },
          {
            type: "tool_call",
            tool_call_id: "done",
            name: "bash",
            kind: "execute",
            status: "completed",
            params: { type: "execute", command: "old", background: true },
          },
        ]),
      ],
    });
    expect(cards.background).toEqual([{ id: "bg", command: "npm test" }]);
    expect(cards.available).toContain("background");
  });

  test("subagent titles skip chrome, nested rows, and finished tasks while a queue is pending", () => {
    const messages: AgentMessage[] = [
      user("u0", "earlier"),
      assistant("old", [
        {
          type: "tool_call",
          tool_call_id: "old-sub",
          name: "explore",
          title: "Old task",
          kind: "subagent",
          status: "running",
          params: { type: "subagent", description: "old" },
        },
      ]),
      user("u1", "now"),
      user("note", "<task-notification>\ndone\n</task-notification>"),
      assistant("a1", [
        {
          type: "tool_call",
          tool_call_id: "chrome-1",
          name: "grok_chrome",
          title: "Chrome",
          kind: "subagent",
          status: "running",
          params: { type: "subagent", description: "chrome" },
        },
        {
          type: "tool_call",
          tool_call_id: "roster",
          name: "explore",
          title: "Roster child",
          kind: "subagent",
          status: "running",
          params: { type: "subagent", description: "child", task_id: "agent-1" },
        },
        {
          type: "tool_call",
          tool_call_id: "nested",
          parent_tool_call_id: "live",
          name: "explore",
          title: "Nested",
          kind: "subagent",
          status: "running",
          params: { type: "subagent", description: "nested" },
        },
        {
          type: "tool_call",
          tool_call_id: "live",
          name: "explore",
          title: "Find the bug",
          kind: "subagent",
          status: "running",
          params: { type: "subagent", description: "look" },
        },
        {
          type: "tool_call",
          tool_call_id: "done-sub",
          name: "explore",
          title: "Finished",
          kind: "subagent",
          status: "completed",
          params: { type: "subagent", description: "done" },
        },
      ]),
    ];
    const queued: AgentQueueItem = {
      id: "q1",
      seq: 1,
      status: "queued",
      prompt: "next",
    };
    const pending = emptyCards({
      messages,
      queue: [queued],
      grokGoal: goal,
      grokWorkflow: workflow,
    });
    expect(pending.subagents).toEqual([{ id: "live", title: "Find the bug" }]);
    expect(pending.subagentTools.map((part) => part.tool_call_id)).toEqual(["live"]);
    const settled = emptyCards({ messages, grokGoal: goal, grokWorkflow: workflow });
    expect(settled.subagents.map((item) => item.id)).toEqual(["live", "done-sub"]);
    expect(settled.subagentTools.map((part) => part.tool_call_id)).toEqual(["live", "done-sub"]);
  });

  test("context stats need used and a positive window", () => {
    expect(emptyCards({ sessionUsage: { used: 1200, context_window: 8000 } }).context).toEqual({
      used: 1200,
      context_window: 8000,
      percent: 15,
    });
    expect(emptyCards({ sessionUsage: { used: 100, size: 1000 } }).context).toEqual({
      used: 100,
      context_window: 1000,
      percent: 10,
    });
    expect(emptyCards({ sessionUsage: { context_window: 1000 } }).context).toBeNull();
    expect(emptyCards({ sessionUsage: { used: 10, context_window: 0 } }).context).toBeNull();
  });

  test("available pills stay in lane order", () => {
    const cards = emptyCards({
      pendingPermission: {
        request_id: "r1",
        tool: "bash",
        description: "run",
        status: "pending",
      },
      pendingSessionOp: {
        request_id: "s1",
        kind: "fork",
        title: "Fork?",
        options: [],
      },
      queue: [{ id: "q", seq: 1, status: "queued", prompt: "later" }],
      sessionUsage: { used: 1, context_window: 10 },
      grokWorkflow: workflow,
      messages: [
        assistant("a1", [
          { type: "plan", plan: "plan" },
          {
            type: "tool_call",
            tool_call_id: "bg",
            name: "bash",
            kind: "execute",
            status: "running",
            params: { type: "execute", command: "sleep 1", background: true },
          },
          {
            type: "tool_call",
            tool_call_id: "sub",
            name: "explore",
            title: "Look",
            kind: "subagent",
            status: "running",
            params: { type: "subagent", description: "look" },
          },
        ]),
      ],
    });
    expect(cards.available).toEqual([
      "permission",
      "session_op",
      "plan",
      "queue",
      "background",
      "subagents",
      "workflow",
      "context",
    ]);
  });
});

describe("moveQueueItem", () => {
  test("swaps up and down and refuses the ends", () => {
    expect(moveQueueItem(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveQueueItem(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
    expect(moveQueueItem(["a", "b"], "a", "up")).toBeNull();
    expect(moveQueueItem(["a", "b"], "b", "down")).toBeNull();
  });
});

describe("laneCardDrawsOwnFrame", () => {
  test("goal, workflow, context, and a live subagent panel draw their own border", () => {
    const cards = { subagentTools: [{ tool_call_id: "a" }] } as never;
    const empty = { subagentTools: [] } as never;
    expect(laneCardDrawsOwnFrame("goal", empty)).toBe(true);
    expect(laneCardDrawsOwnFrame("workflow", empty)).toBe(true);
    expect(laneCardDrawsOwnFrame("context", empty)).toBe(true);
    expect(laneCardDrawsOwnFrame("permission", empty)).toBe(true);
    expect(laneCardDrawsOwnFrame("subagents", cards)).toBe(true);
    expect(laneCardDrawsOwnFrame("subagents", empty)).toBe(false);
    expect(laneCardDrawsOwnFrame("plan", empty)).toBe(false);
    expect(laneCardDrawsOwnFrame(null, empty)).toBe(false);
  });
});

describe("lane goal and workflow type", () => {
  test("the phase panel uses web type and agent rows stay unpressable", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const panel = readFileSync(join(here, "grok-chrome-panel.tsx"), "utf8");
    expect(panel).toContain("chatForeground(theme.isDark)");
    expect(panel).toContain("chatMutedForeground(theme.isDark)");
    expect(panel).toContain("fontSize: 14");
    expect(panel).toContain('fontWeight: "500"');
    expect(panel).toContain("lineHeight: 20");
    expect(panel).toContain("<SubagentTaskRow");
    expect(panel).toContain("gap: 4");
    expect(panel).not.toContain("onPress={() => open");
    expect(panel).not.toContain("theme.colors.label");
    expect(panel).not.toContain("theme.colors.secondaryLabel");
    const goal = readFileSync(join(here, "cards", "goal-card.tsx"), "utf8");
    expect(goal).toContain("grokGoalPhaseSections");
    expect(goal).toContain("messages={messages}");
    expect(goal).toContain("chatMutedForeground(theme.isDark)");
    expect(goal).not.toContain("theme.colors.label");
    const workflow = readFileSync(join(here, "cards", "workflow-card.tsx"), "utf8");
    expect(workflow).toContain("grokWorkflowPhaseSections");
    expect(workflow).toContain("messages={messages}");
    expect(workflow).not.toContain("theme.colors.label");
    const lane = readFileSync(join(here, "cards", "lane-body.tsx"), "utf8");
    expect(lane).toContain("<GoalCard goal={cards.goal} messages={messages} />");
    const row = readFileSync(join(here, "inline-subagent-panel.tsx"), "utf8");
    const taskRow = row.slice(
      row.indexOf("export function SubagentTaskRow"),
      row.indexOf("export function InlineSubagentPanel"),
    );
    expect(taskRow).not.toContain("onPress");
  });
});
