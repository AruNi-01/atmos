import { describe, expect, it } from "bun:test";
import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import {
  GROK_CHROME_SUBAGENT_NAME,
  formatGrokElapsed,
  formatGrokTokens,
  grokChromeAgentIds,
  grokChromeDuplicatesUserSpawn,
  grokGoalPhaseSections,
  grokGoalStatusKey,
  grokWorkflowPhaseSections,
} from "@/features/agent/lib/grok-chrome";
import { currentTurnSubagentTasks, messagesForSubagent } from "@/features/agent/lib/subagent-tasks";

function assistant(parts: AgentPart[], extra: Partial<AgentMessage> = {}): AgentMessage {
  return { id: "a1", role: "assistant", parts, ...extra };
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

describe("grok goal status text", () => {
  it("formats tokens and elapsed like the TUI status line", () => {
    expect(formatGrokTokens(381100)).toBe("381.1k");
    expect(formatGrokTokens(120037)).toBe("120k"); // 120.037 -> 120.0k stripped
    expect(formatGrokElapsed(1155549)).toBe("19m15s");
    expect(grokGoalStatusKey({
      goal_id: "g1",
      objective: "obj",
      status: "infra_paused",
      phase: "executing",
      children: [],
    })).toEqual({ status: "infra_paused", phase: null });
    expect(grokGoalStatusKey({
      goal_id: "g1",
      objective: "obj",
      status: "active",
      phase: "executing",
      planning: false,
      children: [],
    })).toEqual({ status: "active", phase: "executing" });
  });
});

describe("grok chrome phase sections", () => {
  it("groups workflow agents into Plan/Research/Verify/Report and keeps same-label goal skeptics distinct", () => {
    const a = chromeChild("sa-a", "goal achievement skeptic");
    const b = chromeChild("sa-b", "goal achievement skeptic");
    const messages: AgentMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "go" }] },
      assistant([
        a,
        b,
        { type: "text", text: "only-a", parent_tool_call_id: "sa-a" },
        { type: "text", text: "only-b", parent_tool_call_id: "sa-b" },
      ]),
    ];
    const workflow = grokWorkflowPhaseSections(
      {
        run_id: "wf-1",
        name: "deep-research",
        objective: "Compare Postgres 17 vs MySQL 9",
        status: "running",
        phases: [
          { id: "plan", title: "Plan", state: "completed" },
          { id: "research", title: "Research", state: "running" },
          { id: "verify", title: "Verify", state: "pending" },
          { id: "report", title: "Report", state: "pending" },
        ],
        agents: [
          { id: "ag-plan", label: "research-planner", phase_id: "plan" },
          { id: "ag-r1", label: "researcher-1", phase_id: "research" },
          { id: "ag-r2", label: "researcher-2", phase_id: "research" },
        ],
      },
      messages,
    );
    expect(workflow.map((section) => section.title)).toEqual([
      "Plan",
      "Research",
      "Verify",
      "Report",
    ]);
    expect(workflow[1]!.agents.map((agent) => agent.tool_call_id)).toEqual(["ag-r1", "ag-r2"]);

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
    expect(goal.find((section) => section.id === "implementing")!.agents.map((agent) => agent.tool_call_id)).toEqual([
      "grok_implementer",
    ]);
    expect(goal.find((section) => section.id === "verifying")!.agents.map((agent) => agent.tool_call_id)).toEqual([
      "sa-a",
      "sa-b",
    ]);
    const overlayA = messagesForSubagent(messages, "sa-a");
    const overlayB = messagesForSubagent(messages, "sa-b");
    expect(JSON.stringify(overlayA)).toContain("only-a");
    expect(JSON.stringify(overlayA)).not.toContain("only-b");
    expect(JSON.stringify(overlayB)).toContain("only-b");
    expect(JSON.stringify(overlayB)).not.toContain("only-a");
    expect(currentTurnSubagentTasks(messages).items).toEqual([]);
  });

  it("uses the child prompt for overlay user text and does not duplicate finished output", () => {
    const writer: AgentToolCallPart = {
      type: "tool_call",
      tool_call_id: "sa-plan",
      name: GROK_CHROME_SUBAGENT_NAME,
      kind: "subagent",
      status: "completed",
      params: {
        type: "subagent",
        description: "goal plan writer",
        agent_type: "general-purpose",
        prompt: "You are the Goal Plan Writer for the xAI Grok Build harness.",
      },
      result: { type: "text", text: "Done" },
    };
    const projected = messagesForSubagent(
      [
        { id: "u1", role: "user", parts: [{ type: "text", text: "go" }] },
        assistant([
          writer,
          { type: "text", text: "Done", parent_tool_call_id: "sa-plan" },
        ]),
      ],
      "sa-plan",
    );
    expect(projected![0]).toMatchObject({
      role: "user",
      parts: [{ type: "text", text: "You are the Goal Plan Writer for the xAI Grok Build harness." }],
    });
    const texts = projected![1]!.parts
      .filter((part) => part.type === "text")
      .map((part) => (part.type === "text" ? part.text : ""));
    expect(texts).toEqual(["Done"]);
  });

  it("keeps grok roster subagents out of the generic subagent card even when the spawn name is ordinary", () => {
    const skeptic: AgentToolCallPart = {
      type: "tool_call",
      tool_call_id: "sa-a",
      name: "spawn_subagent",
      kind: "subagent",
      status: "running",
      params: { type: "subagent", description: "goal achievement skeptic", agent_type: "general-purpose" },
    };
    const extra = chromeChild("sa-b", "goal achievement skeptic");
    const sibling: AgentToolCallPart = {
      type: "tool_call",
      tool_call_id: "user-task",
      name: "spawn_subagent",
      kind: "subagent",
      status: "running",
      params: { type: "subagent", description: "Write a helper", agent_type: "general-purpose" },
    };
    const messages: AgentMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "go" }] },
      assistant([skeptic, extra, sibling]),
    ];
    const goal = {
      goal_id: "g1",
      objective: "Explore",
      status: "active" as const,
      phase: "executing",
      children: [
        { id: "sa-a", label: "goal achievement skeptic", role: "verifying" },
        { id: "sa-b", label: "goal achievement skeptic", role: "verifying" },
      ],
    };
    const ids = grokChromeAgentIds(goal, null);
    expect([...ids].sort()).toEqual(["sa-a", "sa-b"]);
    expect(
      currentTurnSubagentTasks(messages, { excludeIds: ids }).items.map((item) => item.tool_call_id),
    ).toEqual(["user-task"]);
    expect(grokGoalPhaseSections(goal, messages).find((section) => section.id === "verifying")!.agents.map((agent) => agent.tool_call_id)).toEqual([
      "sa-a",
      "sa-b",
    ]);
  });

  it("returns no sections for a cleared snapshot so the composer card can hide", () => {
    expect(
      grokGoalPhaseSections(
        {
          goal_id: "",
          objective: "",
          status: "cleared",
          phase: "idle",
          children: [{ id: "sa-a", label: "goal plan writer", role: "planning" }],
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

describe("grokChromeDuplicatesUserSpawn", () => {
  it("treats synthesized chrome with the same description as a user spawn duplicate", () => {
    const spawn: AgentToolCallPart = {
      type: "tool_call",
      tool_call_id: "tc_rust",
      name: "spawn_subagent",
      kind: "subagent",
      status: "running",
      params: { type: "subagent", description: "Explore Rust backend layers", agent_type: "explore" },
    };
    const chrome = chromeChild("sa-rust", "Explore Rust backend layers");
    expect(grokChromeDuplicatesUserSpawn(chrome, [spawn, chrome])).toBe(true);
    expect(grokChromeDuplicatesUserSpawn(chrome, [chrome])).toBe(false);
    expect(grokChromeDuplicatesUserSpawn(spawn, [spawn, chrome])).toBe(false);
  });
});
