import { describe, expect, it } from "bun:test";
import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentToolCallPart } from "./tool-kind";
import {
  GROK_CHROME_SUBAGENT_NAME,
  formatGrokElapsed,
  formatGrokTokens,
  grokChromeAgentIds,
  grokGoalPhaseSections,
  grokGoalStatusKey,
  grokWorkflowPhaseSections,
} from "./grok-chrome";

function assistant(parts: AgentPart[]): AgentMessage {
  return { id: "a1", role: "assistant", parts };
}

function chromeChild(id: string, description: string): AgentToolCallPart {
  return {
    type: "tool_call",
    tool_call_id: id,
    name: GROK_CHROME_SUBAGENT_NAME,
    kind: "subagent",
    status: "running",
    params: { type: "subagent", description, agent_type: "general-purpose" },
  };
}

describe("grok chrome phases", () => {
  it("formats tokens and elapsed and pauses without a phase", () => {
    expect(formatGrokTokens(381100)).toBe("381.1k");
    expect(formatGrokTokens(120037)).toBe("120k");
    expect(formatGrokElapsed(1155549)).toBe("19m15s");
    expect(
      grokGoalStatusKey({
        goal_id: "g1",
        objective: "obj",
        status: "infra_paused",
        phase: "executing",
        children: [],
      }),
    ).toEqual({ status: "infra_paused", phase: null });
  });

  it("groups workflow agents and keeps goal skeptics on verify", () => {
    const messages: AgentMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "go" }] },
      assistant([chromeChild("sa-a", "goal achievement skeptic"), chromeChild("sa-b", "skeptic")]),
    ];
    const workflow = grokWorkflowPhaseSections(
      {
        run_id: "wf-1",
        name: "deep-research",
        objective: "Compare",
        status: "running",
        phases: [
          { id: "plan", title: "Plan", state: "completed" },
          { id: "research", title: "Research", state: "running" },
        ],
        agents: [
          { id: "ag-plan", label: "research-planner", phase_id: "plan" },
          { id: "ag-r1", label: "researcher-1", phase_id: "research" },
        ],
      },
      messages,
    );
    expect(workflow.map((section) => section.title)).toEqual(["Plan", "Research"]);
    expect(workflow[1]!.agents.map((agent) => agent.tool_call_id)).toEqual(["ag-r1"]);

    const goal = grokGoalPhaseSections(
      {
        goal_id: "g1",
        objective: "Explore",
        status: "active",
        phase: "executing",
        planning: false,
        verifying_completion: true,
        children: [
          { id: "sa-a", label: "goal achievement skeptic", role: "verifying" },
          { id: "sa-b", label: "goal achievement skeptic", role: "verifying" },
        ],
      },
      messages,
    );
    expect(goal.map((section) => section.id)).toEqual([
      "planning",
      "implementing",
      "verifying",
      "summarizing",
    ]);
    expect(
      goal
        .find((section) => section.id === "implementing")!
        .agents.map((agent) => agent.tool_call_id),
    ).toEqual(["grok_implementer"]);
    expect(
      goal.find((section) => section.id === "verifying")!.agents.map((agent) => agent.tool_call_id),
    ).toEqual(["sa-a", "sa-b"]);
    expect(
      grokChromeAgentIds(
        {
          goal_id: "g1",
          objective: "Explore",
          status: "active",
          phase: "executing",
          children: [{ id: "sa-a", label: "skeptic", role: "verifying" }],
        },
        null,
      ),
    ).toEqual(new Set(["sa-a"]));
  });

  it("returns no sections for a cleared snapshot", () => {
    expect(
      grokGoalPhaseSections(
        {
          goal_id: "",
          objective: "",
          status: "cleared",
          phase: "idle",
          children: [{ id: "sa-a", label: "writer", role: "planning" }],
        },
        [],
      ),
    ).toEqual([]);
    expect(
      grokWorkflowPhaseSections(
        {
          run_id: "wf-1",
          name: "deep-research",
          objective: "Compare",
          status: "cleared",
          phases: [{ id: "plan", title: "Plan", state: "completed" }],
          agents: [{ id: "ag-plan", label: "research-planner", phase_id: "plan" }],
        },
        [],
      ),
    ).toEqual([]);
  });
});
