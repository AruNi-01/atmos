import type { AgentActivity, AgentTurn } from "@atmos/api-types/ws/dto/events";
import type { AgentHookSession } from "@/features/agent/store/agent-hooks-store";
import type { Project } from "@/shared/types/domain";

export type ObserverNodeKind =
  | "atmos"
  | "project"
  | "workspace"
  | "agent"
  | "subagent";

export type ObserverGraphNode = {
  id: string;
  parentId: string | null;
  kind: ObserverNodeKind;
  label: string;
  session?: AgentHookSession;
  activity?: AgentActivity;
  latestPrompt?: string;
  currentToolLine?: string;
  turnCount: number;
  visibleTurns: AgentTurn[];
  extraTurns: number;
  childCount: number;
  todoSummary?: string;
  sideChat: boolean;
};

export type ObserverGraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: "owns" | "spawn";
  animated: boolean;
};

export type ObserverGraph = {
  nodes: ObserverGraphNode[];
  edges: ObserverGraphEdge[];
};

const VISIBLE_TURNS = 8;

export function toolLineText(activity: AgentActivity | undefined): string | undefined {
  const tool = activity?.current_tool;
  if (!tool) return undefined;
  const detail = tool.detail?.trim();
  return detail ? `${tool.name} ${detail}` : tool.name;
}

export function latestTurnPrompt(activity: AgentActivity | undefined): string | undefined {
  const turn = activity?.turns?.length
    ? activity.turns[activity.turns.length - 1]
    : undefined;
  const prompt = turn?.prompt?.trim();
  return prompt || undefined;
}

export function todoSummary(activity: AgentActivity | undefined): string | undefined {
  const todos = activity?.todos ?? [];
  if (!todos.length) return undefined;
  const done = todos.filter((t) => t.status === "completed" || t.status === "cancelled").length;
  return `${done}/${todos.length}`;
}

export function sessionFromActivity(activity: AgentActivity): AgentHookSession {
  return {
    session_id: activity.session_id,
    tool: activity.tool,
    state: activity.last_state,
    timestamp: activity.last_event_at,
    project_path: activity.project_path,
    context_id: activity.context_id,
    pane_id: activity.pane_id,
    terminal_kind: activity.terminal_kind,
    side_chat_id: activity.side_chat_id,
    source_pane_id: activity.source_pane_id,
  };
}

function resolveParentIds(
  session: { context_id?: string | null; project_path?: string | null },
  projects: Project[],
): { projectId: string; workspaceId: string | null } {
  const contextId = session.context_id?.trim() || "";
  for (const project of projects) {
    const workspace = project.workspaces.find((w) => w.id === contextId);
    if (workspace) {
      return { projectId: project.id, workspaceId: workspace.id };
    }
  }
  for (const project of projects) {
    if (project.id === contextId) {
      return { projectId: project.id, workspaceId: null };
    }
  }
  const path = session.project_path?.trim() || "";
  if (path) {
    for (const project of projects) {
      const root = project.mainFilePath?.replace(/\/$/, "") ?? "";
      if (root && (path === root || path.startsWith(`${root}/`))) {
        return { projectId: project.id, workspaceId: null };
      }
    }
  }
  return { projectId: "unassigned", workspaceId: null };
}

export function buildObserverGraph({
  projects,
  sessions,
  activity,
  collapsedIds,
  expandedAgentIds,
  computerName,
}: {
  projects: Project[];
  sessions: Iterable<AgentHookSession>;
  activity: Iterable<AgentActivity>;
  collapsedIds: Set<string>;
  expandedAgentIds: Set<string>;
  computerName?: string;
}): ObserverGraph {
  const sessionMap = new Map<string, AgentHookSession>();
  for (const session of sessions) {
    sessionMap.set(session.session_id, session);
  }
  const activityMap = new Map<string, AgentActivity>();
  for (const record of activity) {
    activityMap.set(record.session_id, record);
  }

  const memberIds = new Set<string>();
  for (const id of sessionMap.keys()) memberIds.add(id);
  for (const [id, record] of activityMap) {
    if ((record.turns?.length ?? 0) >= 1) memberIds.add(id);
  }

  const nodes: ObserverGraphNode[] = [
    {
      id: "atmos",
      parentId: null,
      kind: "atmos",
      label: computerName?.trim() || "Atmos",
      turnCount: 0,
      visibleTurns: [],
      extraTurns: 0,
      childCount: 0,
      sideChat: false,
    },
  ];
  const edges: ObserverGraphEdge[] = [];
  const projectIds = new Set<string>();
  const workspaceIds = new Set<string>();

  const members: Array<{
    sessionId: string;
    session?: AgentHookSession;
    activity?: AgentActivity;
    projectId: string;
    workspaceId: string | null;
  }> = [];

  for (const sessionId of memberIds) {
    const session = sessionMap.get(sessionId);
    const record = activityMap.get(sessionId);
    const bind = session ?? (record ? sessionFromActivity(record) : null);
    if (!bind) continue;
    const parent = resolveParentIds(bind, projects);
    members.push({
      sessionId,
      session,
      activity: record,
      projectId: parent.projectId,
      workspaceId: parent.workspaceId,
    });
  }

  const projectLabel = (id: string) => {
    if (id === "unassigned") return "Unassigned";
    return projects.find((p) => p.id === id)?.name ?? id;
  };
  const workspaceLabel = (id: string) => {
    for (const project of projects) {
      const workspace = project.workspaces.find((w) => w.id === id);
      if (workspace) return workspace.branch || workspace.name || id;
    }
    return id;
  };

  for (const member of members) {
    const projectNodeId = `project:${member.projectId}`;
    if (!projectIds.has(member.projectId)) {
      projectIds.add(member.projectId);
      nodes.push({
        id: projectNodeId,
        parentId: "atmos",
        kind: "project",
        label: projectLabel(member.projectId),
        turnCount: 0,
        visibleTurns: [],
        extraTurns: 0,
        childCount: 0,
        sideChat: false,
      });
      edges.push({
        id: `e-atmos-${projectNodeId}`,
        source: "atmos",
        target: projectNodeId,
        kind: "owns",
        animated: false,
      });
    }
    if (collapsedIds.has(projectNodeId)) continue;

    let parentId = projectNodeId;
    if (member.workspaceId) {
      const workspaceNodeId = `workspace:${member.workspaceId}`;
      if (!workspaceIds.has(member.workspaceId)) {
        workspaceIds.add(member.workspaceId);
        nodes.push({
          id: workspaceNodeId,
          parentId: projectNodeId,
          kind: "workspace",
          label: workspaceLabel(member.workspaceId),
          turnCount: 0,
          visibleTurns: [],
          extraTurns: 0,
          childCount: 0,
          sideChat: false,
        });
        edges.push({
          id: `e-${projectNodeId}-${workspaceNodeId}`,
          source: projectNodeId,
          target: workspaceNodeId,
          kind: "owns",
          animated: false,
        });
      }
      if (collapsedIds.has(workspaceNodeId)) continue;
      parentId = workspaceNodeId;
    }

    const agentId = `agent:${member.sessionId}`;
    const record = member.activity;
    const turns = record?.turns ?? [];
    const visibleTurns = [...turns].reverse().slice(0, VISIBLE_TURNS);
    const extraTurns = Math.max(0, turns.length - VISIBLE_TURNS) + (record?.turns_omitted ?? 0);
    const session = member.session ?? (record ? sessionFromActivity(record) : undefined);
    const sideChat = Boolean(session?.side_chat_id || session?.terminal_kind === "side_chat");
    const children = record?.children ?? [];
    nodes.push({
      id: agentId,
      parentId,
      kind: "agent",
      label: session?.tool ?? record?.tool ?? member.sessionId,
      session,
      activity: record,
      latestPrompt: latestTurnPrompt(record),
      currentToolLine: toolLineText(record),
      turnCount: turns.length,
      visibleTurns: expandedAgentIds.has(agentId) ? visibleTurns : [],
      extraTurns: expandedAgentIds.has(agentId) ? extraTurns : 0,
      childCount: children.length,
      todoSummary: todoSummary(record),
      sideChat,
    });
    edges.push({
      id: `e-${parentId}-${agentId}`,
      source: parentId,
      target: agentId,
      kind: "owns",
      animated: false,
    });

    if (!expandedAgentIds.has(agentId)) continue;
    for (const child of children) {
      const childId = `child:${member.sessionId}:${child.child_id}`;
      nodes.push({
        id: childId,
        parentId: agentId,
        kind: "subagent",
        label: child.name || child.child_id,
        session,
        activity: record,
        currentToolLine: child.current_tool
          ? child.current_tool.detail
            ? `${child.current_tool.name} ${child.current_tool.detail}`
            : child.current_tool.name
          : undefined,
        turnCount: 0,
        visibleTurns: [],
        extraTurns: 0,
        childCount: 0,
        sideChat: false,
      });
      const running =
        child.state === "running" || child.current_tool?.state === "pending";
      edges.push({
        id: `e-${agentId}-${childId}`,
        source: agentId,
        target: childId,
        kind: "spawn",
        animated: running,
      });
    }
  }

  const childCountById = new Map<string, number>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    childCountById.set(node.parentId, (childCountById.get(node.parentId) ?? 0) + 1);
  }
  for (const node of nodes) {
    if (node.kind === "project" || node.kind === "workspace" || node.kind === "atmos") {
      node.childCount = childCountById.get(node.id) ?? 0;
    }
  }

  return { nodes, edges };
}

export function layoutObserverGraph(
  graph: ObserverGraph,
  expandedAgentIds: Set<string>,
): Map<string, { x: number; y: number }> {
  const children = new Map<string, string[]>();
  for (const node of graph.nodes) {
    if (!node.parentId) continue;
    const list = children.get(node.parentId) ?? [];
    list.push(node.id);
    children.set(node.parentId, list);
  }
  const positions = new Map<string, { x: number; y: number }>();
  const NODE_WIDTH = 260;
  const GAP_X = 48;
  const compactH = 96;
  const expandedH = 220;
  const GAP_Y = 36;

  function height(id: string): number {
    return expandedAgentIds.has(id) ? expandedH : compactH;
  }

  function subtreeWidth(id: string): number {
    const kids = children.get(id) ?? [];
    if (!kids.length) return NODE_WIDTH;
    const sum = kids.reduce((acc, kid) => acc + subtreeWidth(kid), 0) + GAP_X * (kids.length - 1);
    return Math.max(NODE_WIDTH, sum);
  }

  function place(id: string, x: number, y: number) {
    const width = subtreeWidth(id);
    positions.set(id, { x: x + width / 2 - NODE_WIDTH / 2, y });
    const kids = children.get(id) ?? [];
    let cursor = x;
    const childY = y + height(id) + GAP_Y;
    for (const kid of kids) {
      const w = subtreeWidth(kid);
      place(kid, cursor, childY);
      cursor += w + GAP_X;
    }
  }

  place("atmos", 0, 0);
  return positions;
}
