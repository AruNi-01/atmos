// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import type { AgentActivity } from "@atmos/api-types/ws/dto/events";
import type { AgentStatusRecord } from "@/features/agent/store/agent-status-store";
import type { Project } from "@/shared/types/domain";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  applyObserverLayoutShift,
  buildObserverGraph,
  dedupeNamedChildren,
  layoutObserverGraph,
  isLeakedTrackpadClick,
  observerCardCanFold,
  observerCardCanRemove,
  observerLastActiveBucket,
  observerLayoutShiftToAnchor,
  observerLeadPrompt,
  observerLiveHeadline,
  preserveMeasuredNodes,
  observerNodeHeight,
  observerNodeTitle,
  sessionFromActivity,
  toolLineText,
} from "../agent-observer-graph";
import {
  canNavigateToAgentStatusSession,
  resolveAgentStatusNavigationTarget,
} from "../agent-status-navigation";
import { DEFAULT_CENTER_SPACE_ID } from "@/app-shell/center-space/center-space";
import { LAUNCHPAD_ITEM_IDS } from "@/features/settings/lib/launchpad-items";

function project(id: string, name: string, workspaces: Array<{ id: string; name: string }>): Project {
  return {
    id,
    name,
    isOpen: true,
    workspaces: workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      branch: w.name,
    })) as Project["workspaces"],
    mainFilePath: `/tmp/${name}`,
    sidebarOrder: 0,
    borderColor: null,
    logoPath: null,
  };
}

function session(partial: Partial<AgentStatusRecord>): AgentStatusRecord {
  return {
    session_id: "s1",
    tool: "claude-code",
    state: "running",
    timestamp: "2026-08-27T00:00:00Z",
    ...partial,
  };
}

function activity(partial: Partial<AgentActivity> & { session_id: string }): AgentActivity {
  return {
    tool: "claude-code",
    last_state: "idle",
    todos: [],
    children: [],
    turns: [],
    turns_omitted: 0,
    started_at: "2026-08-27T00:00:00Z",
    last_event_at: "2026-08-27T00:00:00Z",
    ...partial,
  };
}

const projects = [
  project("p1", "App", [
    { id: "w1", name: "feat" },
    { id: "w2", name: "main" },
  ]),
];

describe("observerLastActiveBucket", () => {
  const now = Date.parse("2026-10-04T12:00:00.000Z");

  it("uses a long relative clock", () => {
    expect(observerLastActiveBucket("2026-10-04T11:59:10.000Z", now)).toEqual({ kind: "justNow" });
    expect(observerLastActiveBucket("2026-10-04T11:59:00.000Z", now)).toEqual({
      kind: "minutes",
      count: 1,
    });
    expect(observerLastActiveBucket("2026-10-04T09:00:00.000Z", now)).toEqual({
      kind: "hours",
      count: 3,
    });
    expect(observerLastActiveBucket("2026-10-02T12:00:00.000Z", now)).toEqual({
      kind: "days",
      count: 2,
    });
    expect(observerLastActiveBucket("not-a-date", now)).toBeNull();
    expect(observerLastActiveBucket(undefined, now)).toBeNull();
  });
});

describe("buildObserverGraph", () => {
  it("places two agents under one workspace as siblings", () => {
    const graph = buildObserverGraph({
      projects,
      sessions: [
        session({ session_id: "a", context_id: "w1" }),
        session({ session_id: "b", context_id: "w1", tool: "codex" }),
      ],
      activity: [],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
    });
    const ids = graph.nodes.map((n) => n.id);
    expect(ids).toContain("atmos");
    expect(ids).toContain("project:p1");
    expect(ids).toContain("workspace:w1");
    expect(ids).toContain("agent:a");
    expect(ids).toContain("agent:b");
    const agentParents = graph.nodes
      .filter((n) => n.kind === "agent")
      .map((n) => n.parentId);
    expect(agentParents).toEqual(["workspace:w1", "workspace:w1"]);
    const pos = layoutObserverGraph(graph, new Set());
    const atmos = pos.get("atmos");
    const project = pos.get("project:p1");
    const workspace = pos.get("workspace:w1");
    const agentA = pos.get("agent:a");
    const agentB = pos.get("agent:b");
    expect(atmos).toBeDefined();
    expect(project).toBeDefined();
    expect(workspace).toBeDefined();
    expect(agentA).toBeDefined();
    expect(agentB).toBeDefined();
    if (!atmos || !project || !workspace || !agentA || !agentB) return;
    expect(project.x).toBeGreaterThan(atmos.x);
    expect(workspace.x).toBeGreaterThan(project.x);
    expect(agentA.x).toBe(agentB.x);
    expect(agentA.x).toBeGreaterThan(workspace.x);
    expect(Math.abs(agentA.y - agentB.y)).toBeGreaterThan(40);
    const upper = agentA.y < agentB.y ? "agent:a" : "agent:b";
    const lower = upper === "agent:a" ? "agent:b" : "agent:a";
    const measured = layoutObserverGraph(graph, new Set(), new Map([[upper, 420]]));
    expect(measured.get(lower)!.y).toBeGreaterThan(
      (lower === "agent:a" ? agentA : agentB).y,
    );
  });

  it("falls back to Unassigned when bind is unknown", () => {
    const graph = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "x", context_id: "missing", project_path: "/nope" })],
      activity: [],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
    });
    expect(graph.nodes.some((n) => n.id === "project:unassigned")).toBe(true);
    expect(graph.nodes.find((n) => n.id === "agent:x")?.parentId).toBe("project:unassigned");
  });

  it("keeps activity-with-turns when the session row is gone", () => {
    const graph = buildObserverGraph({
      projects,
      sessions: [],
      activity: [
        activity({
          session_id: "kept",
          context_id: "w1",
          last_state: "idle",
          turns: [
            {
              turn_id: 1,
              prompt: "fix footer",
              started_at: "2026-08-27T00:00:00Z",
              tools: [],
              todos: [],
              spawned_child_ids: [],
            },
          ],
        }),
      ],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
    });
    const agent = graph.nodes.find((n) => n.id === "agent:kept");
    expect(agent).toBeTruthy();
    expect(agent?.session?.state).toBe("idle");
    expect(agent?.latestPrompt).toBe("fix footer");
    expect(agent?.parentId).toBe("workspace:w1");
  });

  it("hides a stale lead and its subagent, and keeps a recent lead", () => {
    const now = Date.parse("2026-10-04T12:00:00.000Z");
    const turn = (prompt: string, childId?: string) => ({
      turn_id: 1,
      prompt,
      started_at: "2026-10-04T11:00:00.000Z",
      tools: [],
      todos: [],
      spawned_child_ids: childId ? [childId] : [],
    });
    const graph = buildObserverGraph({
      projects,
      sessions: [
        session({
          session_id: "old",
          context_id: "w1",
          state: "idle",
          timestamp: "2026-10-04T11:00:00.000Z",
        }),
        session({
          session_id: "recent",
          context_id: "w1",
          state: "idle",
          timestamp: "2026-10-04T11:40:00.000Z",
        }),
      ],
      activity: [
        activity({
          session_id: "old",
          context_id: "w1",
          last_event_at: "2026-10-04T11:00:00.000Z",
          turns: [turn("old work", "c1")],
          children: [
            {
              child_id: "c1",
              name: "Explore",
              state: "idle",
              recent_tools: [],
              started_at: "2026-10-04T11:10:00.000Z",
              last_event_at: "2026-10-04T11:20:00.000Z",
            },
          ],
        }),
        activity({
          session_id: "recent",
          context_id: "w1",
          last_event_at: "2026-10-04T11:40:00.000Z",
          turns: [turn("still going")],
        }),
      ],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
      sessionTimeoutMins: 30,
      now,
    });
    const ids = graph.nodes.map((node) => node.id);
    expect(ids).not.toContain("agent:old");
    expect(ids).not.toContain("child:old:c1");
    expect(ids).toContain("agent:recent");
    expect(graph.knownIds).not.toContain("child:old:c1");
  });

  it("hides a card from the activity clock even when the session stamp is newer", () => {
    const now = Date.parse("2026-10-04T12:00:00.000Z");
    const graph = buildObserverGraph({
      projects,
      sessions: [
        session({
          session_id: "lead",
          context_id: "w1",
          timestamp: "2026-10-04T11:55:00.000Z",
        }),
      ],
      activity: [
        activity({
          session_id: "lead",
          context_id: "w1",
          last_event_at: "2026-10-04T10:00:00.000Z",
          turns: [
            {
              turn_id: 1,
              prompt: "stale",
              started_at: "2026-10-04T10:00:00.000Z",
              tools: [],
              todos: [],
              spawned_child_ids: [],
            },
          ],
        }),
      ],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
      sessionTimeoutMins: 30,
      now,
    });
    expect(graph.nodes.some((node) => node.id === "agent:lead")).toBe(false);
  });

  it("keeps a card that has no parseable activity clock", () => {
    const graph = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "weird", context_id: "w1", timestamp: "not-a-date" })],
      activity: [
        activity({
          session_id: "weird",
          context_id: "w1",
          last_event_at: "not-a-date",
          turns: [
            {
              turn_id: 1,
              prompt: "kept",
              started_at: "not-a-date",
              tools: [],
              todos: [],
              spawned_child_ids: [],
            },
          ],
        }),
      ],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
      sessionTimeoutMins: 30,
      now: Date.parse("2026-10-04T12:00:00.000Z"),
    });
    expect(graph.nodes.some((node) => node.id === "agent:weird")).toBe(true);
  });

  it("keeps live subagents visible while turn rows stay folded until expand", () => {
    const record = activity({
      session_id: "lead",
      context_id: "w1",
      last_state: "running",
      turns: [
        {
          turn_id: 1,
          prompt: "one",
          started_at: "t",
          tools: [],
          todos: [],
          spawned_child_ids: ["c1"],
        },
      ],
      children: [
        {
          child_id: "c1",
          name: "Explore",
          state: "running",
          recent_tools: [],
          started_at: "t",
          last_event_at: "t",
        },
      ],
    });
    const collapsed = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "lead", context_id: "w1" })],
      activity: [record],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
    });
    expect(collapsed.nodes.some((n) => n.id === "child:lead:c1")).toBe(true);
    expect(collapsed.nodes.find((n) => n.id === "agent:lead")?.visibleTurns).toEqual([]);
    expect(collapsed.nodes.find((n) => n.id === "agent:lead")?.childCount).toBe(1);

    const expanded = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "lead", context_id: "w1" })],
      activity: [record],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(["agent:lead"]),
    });
    expect(expanded.nodes.some((n) => n.id === "child:lead:c1")).toBe(true);
    const child = expanded.nodes.find((n) => n.id === "child:lead:c1");
    expect(child?.occupancy).toBe("running");
    expect(child?.label).toBe("Explore");
    expect(child?.session?.session_id).toBe("lead");
    expect(child?.child?.child_id).toBe("c1");
    expect(expanded.edges.some((e) => e.source === "agent:lead" && e.target === "child:lead:c1" && e.kind === "spawn")).toBe(
      true,
    );
    expect(expanded.edges.every((edge) => edge.animated === false)).toBe(true);
    expect(expanded.nodes.find((n) => n.id === "agent:lead")?.visibleTurns[0]?.prompt).toBe(
      "one",
    );
    expect(child?.currentToolLine).toBeUndefined();
  });

  it("shows the child live tool on the subagent card", () => {
    const record = activity({
      session_id: "lead",
      context_id: "w1",
      last_state: "running",
      turns: [
        {
          turn_id: 1,
          prompt: "explore",
          started_at: "t",
          tools: [],
          todos: [],
          spawned_child_ids: ["c1"],
        },
      ],
      children: [
        {
          child_id: "c1",
          name: "Explore",
          state: "running",
          current_tool: {
            name: "read_file",
            detail: "lib.rs",
            state: "pending",
            started_at: "t",
            repeat: 1,
          },
          recent_tools: [],
          started_at: "t",
          last_event_at: "t",
        },
      ],
    });
    const graph = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "lead", context_id: "w1", state: "running" })],
      activity: [record],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
    });
    expect(graph.nodes.find((n) => n.id === "child:lead:c1")?.currentToolLine).toBe(
      "read_file lib.rs",
    );
    expect(graph.nodes.find((n) => n.id === "agent:lead")?.currentToolLine).toBeUndefined();
  });

  it("uses the pending turn tool as the live step when current_tool is empty", () => {
    const record = activity({
      session_id: "lead",
      last_state: "running",
      turns: [
        {
          turn_id: 1,
          prompt: "fix overlay",
          started_at: "t",
          tools: [
            {
              name: "Read",
              detail: "observer-flow.tsx",
              state: "pending",
              started_at: "t",
              repeat: 1,
            },
          ],
          todos: [],
          spawned_child_ids: [],
        },
      ],
    });
    expect(toolLineText(record)).toBe("Read observer-flow.tsx");
    const graph = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "lead", context_id: "w1", state: "running" })],
      activity: [record],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
    });
    expect(graph.nodes.find((n) => n.id === "agent:lead")?.currentToolLine).toBe(
      "Read observer-flow.tsx",
    );
  });

  it("keeps the Atmos card when the computer is folded", () => {
    const graph = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "a", context_id: "w1" })],
      activity: [],
      collapsedIds: new Set(["atmos"]),
      expandedAgentIds: new Set(),
    });
    expect(graph.nodes.map((node) => node.id)).toEqual(["atmos"]);
    expect(graph.knownIds).toEqual(
      expect.arrayContaining(["atmos", "project:p1", "workspace:w1", "agent:a"]),
    );
    expect(graph.nodes[0]?.descendantCount).toBe(3);
    expect(graph.edges).toEqual([]);
  });

  it("omits agents when a workspace is collapsed", () => {
    const graph = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "a", context_id: "w1" })],
      activity: [],
      collapsedIds: new Set(["workspace:w1"]),
      expandedAgentIds: new Set(),
    });
    expect(graph.nodes.some((n) => n.id === "agent:a")).toBe(false);
    expect(graph.nodes.find((n) => n.id === "workspace:w1")?.descendantCount).toBe(1);
  });

  it("counts nested descendant cards and hides them when an agent is folded", () => {
    const record = activity({
      session_id: "lead",
      context_id: "w1",
      last_state: "running",
      turns: [
        {
          turn_id: 1,
          prompt: "one",
          started_at: "t",
          tools: [],
          todos: [],
          spawned_child_ids: ["c1"],
        },
      ],
      children: [
        {
          child_id: "c1",
          name: "Explore",
          state: "running",
          recent_tools: [],
          started_at: "t",
          last_event_at: "t",
        },
      ],
    });
    const open = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "lead", context_id: "w1" })],
      activity: [record],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
    });
    expect(open.nodes.find((n) => n.id === "workspace:w1")?.descendantCount).toBe(2);
    expect(open.nodes.find((n) => n.id === "agent:lead")?.descendantCount).toBe(1);
    expect(open.nodes.find((n) => n.id === "project:p1")?.descendantCount).toBe(3);

    const folded = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "lead", context_id: "w1" })],
      activity: [record],
      collapsedIds: new Set(["agent:lead"]),
      expandedAgentIds: new Set(),
    });
    expect(folded.nodes.some((n) => n.id === "child:lead:c1")).toBe(false);
    expect(folded.knownIds).toContain("child:lead:c1");
    expect(folded.nodes.find((n) => n.id === "agent:lead")?.descendantCount).toBe(1);
    expect(folded.edges.some((e) => e.target === "child:lead:c1")).toBe(false);
  });

  it("keeps same-type children distinct, nests a child under its parent, and keeps the lead running", () => {
    const record = activity({
      session_id: "lead",
      context_id: "w1",
      last_state: "idle",
      children: [
        {
          child_id: "sa-a",
          name: "Explore · scan specs",
          agent_type: "Explore",
          description: "scan specs",
          state: "running",
          recent_tools: [],
          started_at: "t",
          last_event_at: "t",
        },
        {
          child_id: "sa-b",
          name: "Explore · scan rust",
          agent_type: "Explore",
          description: "scan rust",
          state: "running",
          recent_tools: [],
          started_at: "t",
          last_event_at: "t",
        },
        {
          child_id: "kid",
          name: "Explore · nested",
          agent_type: "Explore",
          description: "nested",
          parent_child_id: "sa-a",
          state: "running",
          recent_tools: [],
          started_at: "t",
          last_event_at: "t",
        },
      ],
    });
    const graph = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "lead", context_id: "w1", state: "idle" })],
      activity: [record],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
    });
    expect(
      graph.nodes.filter((node) => node.kind === "subagent").map((node) => node.child?.child_id).sort(),
    ).toEqual(["kid", "sa-a", "sa-b"]);
    const specs = graph.nodes.find((node) => node.id === "child:lead:sa-a");
    const rust = graph.nodes.find((node) => node.id === "child:lead:sa-b");
    const kid = graph.nodes.find((node) => node.id === "child:lead:kid");
    expect(specs?.agentType).toBe("Explore");
    expect(specs?.description).toBe("scan specs");
    expect(rust?.agentType).toBe("Explore");
    expect(rust?.description).toBe("scan rust");
    expect(specs?.parentId).toBe("agent:lead");
    expect(rust?.parentId).toBe("agent:lead");
    expect(kid?.parentId).toBe("child:lead:sa-a");
    expect(kid?.description).toBe("nested");
    expect(specs?.activity?.session_id).toBe("lead");
    const lead = graph.nodes.find((node) => node.id === "agent:lead");
    expect(lead?.occupancy).toBe("running");
    expect(lead?.liveKind).toBe("working");
    expect(lead?.childCount).toBe(2);
    expect(lead?.descendantCount).toBe(3);

    const folded = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "lead", context_id: "w1", state: "idle" })],
      activity: [record],
      collapsedIds: new Set(["child:lead:sa-a"]),
      expandedAgentIds: new Set(),
    });
    expect(folded.nodes.some((node) => node.id === "child:lead:kid")).toBe(false);
    expect(folded.knownIds).toContain("child:lead:kid");

    const waiting = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "lead", context_id: "w1", state: "permission_request" })],
      activity: [record],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
    });
    expect(waiting.nodes.find((node) => node.id === "agent:lead")?.occupancy).toBe(
      "permission_request",
    );
  });

  it("shows a description on its own when the subagent has no type", () => {
    const graph = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "lead", context_id: "w1" })],
      activity: [
        activity({
          session_id: "lead",
          context_id: "w1",
          children: [
            {
              child_id: "sa-a",
              name: "scan specs",
              description: "scan specs",
              state: "running",
              recent_tools: [],
              started_at: "t",
              last_event_at: "t",
            },
          ],
        }),
      ],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
    });
    const card = graph.nodes.find((node) => node.id === "child:lead:sa-a");
    expect(card?.description).toBe("scan specs");
    expect(card?.agentType).toBeUndefined();
  });

  it("keeps a measured node box when the flow replaces the node object", () => {
    const next = preserveMeasuredNodes(
      [{ id: "project", measured: { width: 288, height: 112 } }, { id: "gone", measured: { width: 288, height: 80 } }],
      [{ id: "project" }, { id: "agent" }],
    );
    expect(next[0]?.measured).toEqual({ width: 288, height: 112 });
    expect(next[1]?.measured).toBeUndefined();
  });

  it("keeps a folded card at its previous point without fitting the viewport", () => {
    const record = activity({
      session_id: "lead",
      context_id: "w1",
      last_state: "running",
      children: [
        {
          child_id: "c1",
          name: "Explore",
          state: "running",
          recent_tools: [],
          started_at: "t",
          last_event_at: "t",
        },
        {
          child_id: "c2",
          name: "Plan",
          state: "running",
          recent_tools: [],
          started_at: "t",
          last_event_at: "t",
        },
      ],
    });
    const open = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "lead", context_id: "w1" })],
      activity: [record],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
    });
    const folded = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "lead", context_id: "w1" })],
      activity: [record],
      collapsedIds: new Set(["agent:lead"]),
      expandedAgentIds: new Set(),
    });
    const openPos = layoutObserverGraph(open, new Set());
    const foldedPos = layoutObserverGraph(folded, new Set());
    const keep = openPos.get("agent:lead");
    const raw = foldedPos.get("agent:lead");
    expect(keep).toBeDefined();
    expect(raw).toBeDefined();
    if (!keep || !raw) return;
    expect(raw.y).not.toBe(keep.y);
    const anchored = applyObserverLayoutShift(
      foldedPos,
      observerLayoutShiftToAnchor(foldedPos, "agent:lead", keep),
    );
    expect(anchored.get("agent:lead")).toEqual(keep);
  });

  it("titles agent cards from the session title and subagents from type plus description", () => {
    const record = activity({
      session_id: "lead",
      context_id: "w1",
      last_state: "running",
      children: [
        {
          child_id: "c1",
          name: "Explore · scan the tree",
          state: "running",
          recent_tools: [],
          started_at: "t",
          last_event_at: "t",
        },
      ],
    });
    const graph = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "lead", context_id: "w1" })],
      activity: [record],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
    });
    const agent = graph.nodes.find((n) => n.id === "agent:lead");
    const child = graph.nodes.find((n) => n.id === "child:lead:c1");
    expect(agent).toBeDefined();
    expect(child).toBeDefined();
    if (!agent || !child) return;
    expect(observerNodeTitle(agent, "启动多个 subagent")).toBe("启动多个 subagent");
    expect(observerNodeTitle(agent, "  ")).toBe(agent.label);
    expect(observerNodeTitle(child)).toBe("Explore · scan the tree");
  });

  it("titles a subagent from type and description when the stored name is a tool", () => {
    const graph = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "lead", context_id: "w1" })],
      activity: [
        activity({
          session_id: "lead",
          context_id: "w1",
          children: [
            {
              child_id: "sa-read",
              name: "Read /Users/aarynlu/OpenSource/atmos/agents/references/runtime/atmos-home-layout.md",
              agent_type: "tldraw-offline",
              description: "Explore Atmos monorepo",
              state: "idle",
              prompt: "You are exploring the Atmos monorepo",
              recent_tools: [
                {
                  name: "Read",
                  detail: "agents/references/runtime/atmos-home-layout.md",
                  state: "ok",
                  started_at: "t",
                  repeat: 1,
                },
              ],
              started_at: "t",
              last_event_at: "t",
            },
          ],
        }),
      ],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
    });
    const card = graph.nodes.find((node) => node.id === "child:lead:sa-read");
    expect(card).toBeDefined();
    if (!card) return;
    expect(observerNodeTitle(card)).toBe("tldraw-offline · Explore Atmos monorepo");
    expect(card.currentToolLine).toBe("Read agents/references/runtime/atmos-home-layout.md");
    expect(observerNodeHeight(card)).toBe(128);
  });
});

describe("Observer pane jump", () => {
  it("uses the same navigation target as hook-session pane jump, including side chat", () => {
    const record = activity({
      session_id: "side",
      context_id: "w1",
      pane_id: "w1:side-1",
      source_pane_id: "w1:3",
      side_chat_id: "side-1",
      terminal_kind: "side_chat",
      last_state: "idle",
      turns: [
        {
          turn_id: 1,
          prompt: "ask",
          started_at: "t",
          tools: [],
          todos: [],
          spawned_child_ids: [],
        },
      ],
    });
    const asSession = sessionFromActivity(record);
    const liveSession = session({
      session_id: "side",
      context_id: "w1",
      pane_id: "w1:side-1",
      source_pane_id: "w1:3",
      side_chat_id: "side-1",
      terminal_kind: "side_chat",
    });
    expect(canNavigateToAgentStatusSession(asSession)).toBe(true);
    expect(resolveAgentStatusNavigationTarget(asSession)).toEqual(
      resolveAgentStatusNavigationTarget(liveSession),
    );
    expect(resolveAgentStatusNavigationTarget(asSession)).toEqual({
      contextId: "w1",
      spaceId: DEFAULT_CENTER_SPACE_ID,
      surface: "terminal",
      chatId: null,
      isSideChat: true,
      sideChatId: "side-1",
      tmuxWindowName: "3",
    });
  });

  it("keeps Agent Chat nodes jumpable after the occupancy row is gone", () => {
    const record = activity({
      session_id: "chat:abc",
      context_id: "w1",
      pane_id: "chat:abc",
      surface: "chat",
      surface_id: "abc",
      space_id: "main",
      last_state: "idle",
      turns: [
        {
          turn_id: 1,
          prompt: "fix footer",
          started_at: "t",
          tools: [],
          todos: [],
          spawned_child_ids: [],
        },
      ],
    });
    const graph = buildObserverGraph({
      projects,
      sessions: [],
      activity: [record],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
    });
    const node = graph.nodes.find((n) => n.id === "agent:chat:abc");
    expect(node?.chat).toBe(true);
    const asSession = sessionFromActivity(record);
    expect(resolveAgentStatusNavigationTarget(asSession)).toEqual({
      contextId: "w1",
      spaceId: "main",
      surface: "chat",
      chatId: "abc",
      isSideChat: false,
      sideChatId: null,
      tmuxWindowName: null,
    });
  });

  it("wires Open pane on the Observer view to the shipped pane navigator", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../components/observer/AgentObserverView.tsx"),
      "utf8",
    );
    expect(source).toContain(
      'import { navigateToAgentStatusSession } from "@/features/agent/lib/agent-status-navigation"',
    );
    expect(source).toContain("navigateToAgentStatusSession(session, router, projects)");
    expect(source).toContain("OBSERVER_NODE_TYPES");
    expect(source).toContain("ObserverDrawer");
    expect(source).toContain("nodesDraggable={false}");
    expect(source).toContain("useObserverWireMotion");
    expect(source).not.toContain("dragHandle");
    expect(source).not.toContain("positionOverrides");
    expect(source).not.toContain("onNodeDragStop");
    expect(source).toContain("graph.knownIds.length <= 1");
    expect(source).not.toContain("graph.nodes.length <= 1");
    expect(source).toContain("ProjectEmpty");
    expect(source).toContain('variant="Minimal"');
    expect(source).toContain("IconActivity");
    expect(source).toContain("installAll");
    expect(source).toContain("getStatus");
    expect(source).toContain("ObserverInstallHooksButton");
    expect(source).toContain("ObserverNewChatPicker");
    expect(source).toContain("observer-edge-entering");
    expect(source).toContain("observer-edge-spawn");
    expect(source).not.toContain('t("spawn")');
    expect(source).toContain("mergeFlowEdges");
    expect(source).toContain("observerLayoutShiftToAnchor");
    expect(source).toContain("pendingAnchorRef");
    expect(source).toContain("preserveMeasuredNodes");
    expect(source).toContain("initialWidth");
    expect(source).toContain("knownIds");
    expect(source).not.toContain("ObserverViewportFitter");
    expect(source).not.toContain("pendingFocusRootRef");
    expect(source).not.toContain("observerSubtreeIds");
    expect(source).toContain("sessionTitle");
    expect(source).toContain("useAgentStatusSessionTitles");
    expect(source).toContain("animated: false");
    expect(source).toContain("docsAction=");
    expect(source).toContain("createAction=");
    expect(source).not.toContain("setAgentChatOpen");
    expect(source).not.toContain("useAgentChatUrl");
    expect(source).not.toContain("panelTitle");
    expect(source).not.toContain("<aside");
    expect(source).not.toContain("relayout");
    const install = readFileSync(
      join(import.meta.dir, "../../components/observer/ObserverInstallHooksButton.tsx"),
      "utf8",
    );
    expect(install).toContain("summarizeAgentHookInstall");
    expect(install).toContain("TooltipTrigger");
    expect(install).toContain("installHooksMissing");
    expect(install).toContain("hooksInstalled");
  });

  it("keeps the kind glyph and shows folded descendant counts without a drag handle", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../components/observer/observer-flow.tsx"),
      "utf8",
    );
    expect(source).not.toContain("observer-drag-handle");
    expect(source).not.toContain("GripVertical");
    expect(source).toContain("observerWirePath");
    expect(source).toContain("observer-edge-cap");
    expect(source).toContain("observer-card-shell");
    const shell = source.slice(source.indexOf("observer-card-shell"));
    expect(shell.indexOf("<Handle")).toBeGreaterThan(-1);
    expect(shell.indexOf("<Handle")).toBeLessThan(shell.indexOf("observer-card w-full"));
    expect(source).toContain("descendantCount");
    expect(source).toContain("observerNodeTitle");
    expect(source).toContain("sessionTitle");
    expect(source).not.toContain('t("kindAgent")');
    expect(source).not.toContain('t("kindSubagent")');
    expect(source).toContain("is-exiting");
    expect(source).not.toContain("getSmoothStepPath");
    expect(source).toContain("Position.Left");
    expect(source).toContain("Position.Right");
    expect(source).toContain("ChevronRight");
    expect(source).not.toContain("data-observer-agent-type");
    expect(source).not.toContain("data-observer-description");
    expect(source).toContain("subagentEvent");
    expect(source).toContain("observer-edge-spawn");
    expect(source).not.toContain("EdgeLabelRenderer");
    const header = source.slice(
      source.indexOf("observer-card-header"),
      source.indexOf("mt-2.5 rounded-lg"),
    );
    expect(header.indexOf("observer-kind-glyph")).toBeGreaterThan(-1);
    expect(header.indexOf("observer-kind-glyph")).toBeLessThan(header.indexOf("descendantCount"));
    expect(header.indexOf("descendantCount")).toBeLessThan(header.indexOf("ChevronRight"));
  });

  it("draws observer edges only when they enter or exit", () => {
    const css = readFileSync(
      join(import.meta.dir, "../../components/observer/observer-flow.css"),
      "utf8",
    );
    expect(css).toContain("observer-edge-entering");
    expect(css).toContain("observer-edge-exiting");
    expect(css).toContain("observer-edge-spawn");
    expect(css).toContain("stroke-dasharray: 6 4");
    expect(css).toContain("observer-edge-cap");
    expect(css).not.toContain("observer-edge-label");
    expect(css).not.toContain(".observer-drag-handle");
    expect(css).toContain(".observer-card {\n  cursor: pointer;");
    expect(css).not.toContain(".observer-card-header:hover .observer-drag-grip");
    expect(css).not.toContain(".react-flow__edge:not(.animated)");
    expect(css).not.toContain(".react-flow__edge.animated");
  });
});

describe("dedupeNamedChildren", () => {
  it("keeps every child id when labels match", () => {
    const child = (
      id: string,
      name: string,
      prompt?: string,
    ): AgentActivity["children"][number] => ({
      child_id: id,
      name,
      state: "running",
      recent_tools: [],
      prompt,
      started_at: "t",
      last_event_at: "t",
    });
    const next = dedupeNamedChildren([
      child("tc-specs", "Explore monorepo specs"),
      child("sa-specs", "Explore monorepo specs", "You are exploring Atmos"),
      child("sa-rust", "Explore Rust backend"),
      child("tc-rust", "Explore Rust backend"),
    ]);
    expect(next.map((item) => item.child_id).sort()).toEqual([
      "sa-rust",
      "sa-specs",
      "tc-rust",
      "tc-specs",
    ]);
  });

  it("keeps both ids when both sides already have the task prompt", () => {
    const child = (
      id: string,
      name: string,
      prompt: string,
    ): AgentActivity["children"][number] => ({
      child_id: id,
      name,
      state: "running",
      recent_tools: [],
      prompt,
      started_at: "t",
      last_event_at: "t",
    });
    const prompt = "You are exploring Atmos";
    const next = dedupeNamedChildren([
      child("tc-specs", "Explore monorepo specs", prompt),
      child("sa-specs", "Explore monorepo specs", prompt),
      child("tc-rust", "Explore Rust backend", prompt),
      child("sa-rust", "Explore Rust backend", prompt),
    ]);
    expect(next.map((item) => item.child_id).sort()).toEqual([
      "sa-rust",
      "sa-specs",
      "tc-rust",
      "tc-specs",
    ]);
  });
});

describe("observerLeadPrompt", () => {
  it("uses the chat title when the turn never stored the prompt", () => {
    expect(observerLeadPrompt(undefined, "Launch Subagent to Explore", "Grok Build")).toBe(
      "Launch Subagent to Explore",
    );
    expect(observerLeadPrompt("  ", "fix the card", "Grok Build")).toBe("fix the card");
  });

  it("keeps a stored prompt and rejects the agent name", () => {
    expect(observerLeadPrompt("fix the card body", "Launch Subagent", "Grok Build")).toBe(
      "fix the card body",
    );
    expect(observerLeadPrompt(undefined, "Grok Build", "Grok Build")).toBeUndefined();
    expect(observerLeadPrompt(undefined, "  ", "Grok Build")).toBeUndefined();
  });
});

describe("observerLiveHeadline", () => {
  const labels = { thinking: "Thinking", streaming: "Streaming", working: "Generating" };

  it("shows the in-flight tool, then generating, then the prompt", () => {
    expect(observerLiveHeadline({
      occupancy: "running",
      liveKind: "tool",
      currentToolLine: "Read observer-flow.tsx",
      latestPrompt: "fix the card",
      fallback: "Claude Code",
      labels,
    })).toBe("Read observer-flow.tsx");
    expect(observerLiveHeadline({
      occupancy: "running",
      liveKind: "thinking",
      latestPrompt: "fix the card",
      fallback: "Claude Code",
      labels,
    })).toBe("Thinking");
    expect(observerLiveHeadline({
      occupancy: "running",
      liveKind: "working",
      latestPrompt: "fix the card",
      fallback: "Claude Code",
      labels,
    })).toBe("Generating");
    expect(observerLiveHeadline({
      occupancy: "idle",
      latestPrompt: "fix the card",
      fallback: "Claude Code",
      labels,
    })).toBe("fix the card");
  });

  it("prefers the permission action over the tool line", () => {
    expect(observerLiveHeadline({
      occupancy: "permission_request",
      liveKind: "permission",
      currentToolLine: "Bash",
      fallback: "Claude Code",
      pendingPermission: {
        request_id: "1",
        tool: "Bash",
        description: "rm -rf ./tmp",
      },
      labels,
    })).toBe("rm -rf ./tmp");
  });
});

describe("observer card menu", () => {
  it("folds cards that have children and removes only an idle agent", () => {
    expect(observerCardCanFold({ kind: "atmos", descendantCount: 2 })).toBe(true);
    expect(observerCardCanFold({ kind: "project", descendantCount: 1 })).toBe(true);
    expect(observerCardCanFold({ kind: "workspace", descendantCount: 1 })).toBe(true);
    expect(observerCardCanFold({ kind: "agent", descendantCount: 1 })).toBe(true);
    expect(observerCardCanFold({ kind: "agent", descendantCount: 0 })).toBe(false);
    expect(observerCardCanFold({ kind: "subagent", descendantCount: 0 })).toBe(false);
    expect(observerCardCanFold({ kind: "subagent", descendantCount: 1 })).toBe(true);

    expect(observerCardCanRemove({ kind: "agent", occupancy: "idle", liveKind: "idle" })).toBe(true);
    expect(observerCardCanRemove({ kind: "agent", occupancy: "idle" })).toBe(true);
    expect(observerCardCanRemove({ kind: "agent", occupancy: "running", liveKind: "working" })).toBe(false);
    expect(observerCardCanRemove({ kind: "agent", occupancy: "idle", liveKind: "working" })).toBe(false);
    expect(observerCardCanRemove({ kind: "subagent", occupancy: "idle" })).toBe(false);
    expect(observerCardCanRemove({ kind: "project", occupancy: "idle" })).toBe(false);
    expect(observerCardCanRemove({ kind: "workspace" })).toBe(false);
    expect(observerCardCanRemove({ kind: "atmos" })).toBe(false);
  });

  it("ignores the primary click a two-finger trackpad tap leaks", () => {
    expect(isLeakedTrackpadClick({ button: 2 }, 0, 1_000)).toBe(true);
    expect(isLeakedTrackpadClick({ button: 0, ctrlKey: true }, 0, 1_000)).toBe(true);
    expect(isLeakedTrackpadClick({ button: 0 }, 800, 1_000)).toBe(true);
    expect(isLeakedTrackpadClick({ button: 0 }, 800, 1_600)).toBe(false);
    expect(isLeakedTrackpadClick({ button: 0 }, 0, 1_000)).toBe(false);
  });

  it("uses the footer agent status icon and copy on a card", () => {
    const card = readFileSync(
      join(import.meta.dir, "../../components/observer/observer-flow.tsx"),
      "utf8",
    );
    const drawer = readFileSync(
      join(import.meta.dir, "../../components/observer/ObserverDrawer.tsx"),
      "utf8",
    );
    expect(card).toContain("FooterAgentStatusMark");
    expect(card).toContain("footerBucketForAgentState");
    expect(card).not.toContain("stateIdle");
    expect(card).not.toContain("statePermission");
    expect(drawer).toContain("FooterAgentStatusMark");
  });

  it("opens the card menu from the observer canvas", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../components/observer/AgentObserverView.tsx"),
      "utf8",
    );
    expect(source).toContain("onNodeContextMenu");
    expect(source).toContain("observerCardCanRemove");
    expect(source).toContain('t("remove")');
    expect(source).toContain('t("fold")');
    expect(source).toContain('t("expand")');
  });
});

describe("product name", () => {
  it("uses Agent Observer as the user-visible label", async () => {
    const en = await import("../../../../../messages/en.json");
    expect(en.AgentObserver.title).toBe("Agent Observer");
    expect(en.AgentObserver.empty).toBe(
      "Agents appear here when a terminal agent hook fires or an Agent Chat turn runs.",
    );
    expect(en.AgentObserver.installHooks).toBe("Install {count} hooks");
    expect(en.AgentObserver.hooksInstalled).toBe("{count} hooks installed");
    expect(en.AgentObserver.recentWorkspacesHint).toBe("Recent 5 workspaces");
    expect(en.AgentObserver.stepsHint).toBe(
      "Hooks only see tool steps. Open the pane for the full turn.",
    );
    expect(en.AgentObserver.noTurns).toBe("No steps yet");
    expect(en.settings.layoutSection.launchpad.items.agentObserver.title).toBe(
      "Agent Observer",
    );
    expect(LAUNCHPAD_ITEM_IDS).toContain("agent-observer");
  });
});
