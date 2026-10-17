// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { GrokGoal } from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentToolCallPart, GrokChromePhaseSection } from "@atmos/agent-transcript";
import { copy } from "./copy";
import {
  grokGoalEmptyHint,
  grokGoalHeadline,
  grokPhaseStartsOpen,
  grokWorkflowCountLabel,
} from "./grok-chrome-label";

function goal(patch: Partial<GrokGoal> = {}): GrokGoal {
  return {
    goal_id: "g1",
    objective: "Ship the panel",
    status: "active",
    phase: "executing",
    children: [],
    ...patch,
  };
}

function section(id: string, agents: AgentToolCallPart[] = []): GrokChromePhaseSection {
  return { id, title: id, state: "pending", agents };
}

function agent(status: "running" | "completed"): AgentToolCallPart {
  return {
    type: "tool_call",
    tool_call_id: status,
    name: "task",
    kind: "subagent",
    status,
    title: "Look",
    params: { type: "subagent", description: "Look", agent_type: "general-purpose" },
  };
}

describe("grok chrome labels", () => {
  test("an active goal headline joins the status and phase", () => {
    expect(grokGoalHeadline(goal())).toBe("Active · Executing");
    expect(grokGoalHeadline(goal({ status: "complete", phase: "executing" }))).toBe("Complete");
    expect(grokGoalHeadline(goal({ status: "infra_paused" }))).toBe("Infra paused");
  });

  test("empty hints only cover verify and summarize with no agents", () => {
    expect(grokGoalEmptyHint(section("verifying"))).toBe(copy.grokGoalEmptyVerify);
    expect(grokGoalEmptyHint(section("summarizing"))).toBe(copy.grokGoalEmptySummarize);
    expect(grokGoalEmptyHint(section("planning"))).toBeNull();
    expect(grokGoalEmptyHint(section("verifying", [agent("running")]))).toBeNull();
  });

  test("a phase starts open while it is running or active", () => {
    expect(grokPhaseStartsOpen("running")).toBe(true);
    expect(grokPhaseStartsOpen("active")).toBe(true);
    expect(grokPhaseStartsOpen("pending")).toBe(false);
    expect(grokPhaseStartsOpen("completed")).toBe(false);
  });

  test("the workflow count is the running agents, or idle", () => {
    expect(grokWorkflowCountLabel([section("a", [agent("running")]), section("b")])).toBe(
      "1 running",
    );
    expect(grokWorkflowCountLabel([section("a", [agent("completed")])])).toBe("Idle");
  });
});
