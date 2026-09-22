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
  observerLayoutShiftToAnchor,
  observerLiveHeadline,
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
    expect(folded.nodes.find((n) => n.id === "agent:lead")?.descendantCount).toBe(1);
    expect(folded.edges.some((e) => e.target === "child:lead:c1")).toBe(false);
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
    expect(source).toContain("ControlButton");
    expect(source).toContain("resetLayout");
    expect(source).toContain("dragHandle");
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

  it("swaps the header glyph for a drag handle and shows folded descendant counts", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../components/observer/observer-flow.tsx"),
      "utf8",
    );
    expect(source).toContain("observer-drag-handle");
    expect(source).toContain("GripVertical");
    expect(source).toContain("descendantCount");
    expect(source).toContain("observerNodeTitle");
    expect(source).toContain("sessionTitle");
    expect(source).not.toContain('t("kindAgent")');
    expect(source).not.toContain('t("kindSubagent")');
    expect(source).toContain("is-exiting");
    expect(source).toContain("pathLength={spawn ? undefined : 1}");
    expect(source).toContain("Position.Left");
    expect(source).toContain("Position.Right");
    expect(source).toContain("ChevronRight");
    expect(source).toContain("observer-edge-spawn");
    expect(source).not.toContain("EdgeLabelRenderer");
    const header = source.slice(
      source.indexOf("observer-card-header"),
      source.indexOf("mt-2.5 rounded-lg"),
    );
    expect(header.indexOf("observer-drag-handle")).toBeGreaterThan(-1);
    expect(header.indexOf("observer-drag-handle")).toBeLessThan(header.indexOf("descendantCount"));
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
    expect(css).not.toContain("observer-edge-label");
    expect(css).toContain(".observer-flow .react-flow__node.draggable");
    expect(css).toContain(".observer-card {\n  cursor: pointer;");
    expect(css).toContain(".observer-drag-handle {\n  cursor: grab;");
    expect(css).toContain(".observer-drag-handle:hover .observer-drag-grip");
    expect(css).not.toContain(".observer-card-header:hover .observer-drag-grip");
    expect(css).not.toContain(".react-flow__edge:not(.animated)");
    expect(css).not.toContain(".react-flow__edge.animated");
  });
});

describe("dedupeNamedChildren", () => {
  it("drops the idle twin that shares a descriptive label", () => {
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
    expect(next.map((item) => item.child_id).sort()).toEqual(["sa-rust", "sa-specs"]);
  });

  it("drops the generating twin when both sides already have the task prompt", () => {
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
    expect(next.map((item) => item.child_id).sort()).toEqual(["sa-rust", "sa-specs"]);
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
    expect(en.AgentObserver.resetLayout).toBe("Reset layout");
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
