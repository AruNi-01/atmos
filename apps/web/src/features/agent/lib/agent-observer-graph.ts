import type {
  AgentActivity,
  AgentChildActivity,
  AgentTurn,
} from "@atmos/api-types/ws/dto/events";
import { childToolLine, isLeakedChildTurn } from "@/features/agent/lib/observer-conversation";
import type { AgentStatusRecord } from "@/features/agent/store/agent-status-store";
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
  session?: AgentStatusRecord;
  activity?: AgentActivity;
  latestPrompt?: string;
  currentToolLine?: string;
  turnCount: number;
  visibleTurns: AgentTurn[];
  extraTurns: number;
  childCount: number;
  descendantCount: number;
  depth: number;
  todoSummary?: string;
  sideChat: boolean;
  chat: boolean;
  occupancy?: string;
  child?: AgentChildActivity;
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

function formatToolLine(tool: { name: string; detail?: string | null }): string {
  const detail = tool.detail?.trim();
  return detail ? `${tool.name} ${detail}` : tool.name;
}

export function toolLineText(activity: AgentActivity | undefined): string | undefined {
  if (!activity) return undefined;
  if (activity.current_tool) return formatToolLine(activity.current_tool);
  const tools = activity.turns?.length
    ? activity.turns[activity.turns.length - 1]?.tools ?? []
    : [];
  const pending = [...tools].reverse().find((tool) => tool.state === "pending");
  if (pending) return formatToolLine(pending);
  const todo = (activity.todos ?? []).find((item) => {
    const status = item.status.trim().toLowerCase();
    return status === "in_progress" || status === "in-progress" || status === "pending";
  });
  const todoText = todo?.content?.trim();
  return todoText || undefined;
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

export function sessionFromActivity(activity: AgentActivity): AgentStatusRecord {
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
    surface: activity.surface,
    surface_id: activity.surface_id,
    space_id: activity.space_id,
    provider_id: activity.provider_id,
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
  sessions: Iterable<AgentStatusRecord>;
  activity: Iterable<AgentActivity>;
  collapsedIds: Set<string>;
  expandedAgentIds: Set<string>;
  computerName?: string;
}): ObserverGraph {
  const sessionMap = new Map<string, AgentStatusRecord>();
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
      descendantCount: 0,
      depth: 0,
      sideChat: false,
      chat: false,
    },
  ];
  const edges: ObserverGraphEdge[] = [];
  const projectIds = new Set<string>();
  const workspaceIds = new Set<string>();

  const members: Array<{
    sessionId: string;
    session?: AgentStatusRecord;
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
        descendantCount: 0,
        depth: 1,
        sideChat: false,
        chat: false,
      });
      edges.push({
        id: `e-atmos-${projectNodeId}`,
        source: "atmos",
        target: projectNodeId,
        kind: "owns",
        animated: false,
      });
    }
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
          descendantCount: 0,
          depth: 2,
          sideChat: false,
          chat: false,
        });
        edges.push({
          id: `e-${projectNodeId}-${workspaceNodeId}`,
          source: projectNodeId,
          target: workspaceNodeId,
          kind: "owns",
          animated: false,
        });
      }
      parentId = workspaceNodeId;
    }

    const agentId = `agent:${member.sessionId}`;
    const record = member.activity;
    const children = record?.children ?? [];
    const turns = (record?.turns ?? []).filter((turn) => !isLeakedChildTurn(turn, children));
    const visibleTurns = [...turns].reverse().slice(0, VISIBLE_TURNS);
    const extraTurns = Math.max(0, turns.length - VISIBLE_TURNS) + (record?.turns_omitted ?? 0);
    const session = member.session ?? (record ? sessionFromActivity(record) : undefined);
    const sideChat = Boolean(session?.side_chat_id || session?.terminal_kind === "side_chat");
    const chat = session?.surface === "chat" || Boolean(session?.session_id?.startsWith("chat:"));
    nodes.push({
      id: agentId,
      parentId,
      kind: "agent",
      label: session?.tool ?? record?.tool ?? member.sessionId,
      session,
      activity: record,
      latestPrompt: turns.at(-1)?.prompt.trim() || undefined,
      currentToolLine: toolLineText(record),
      turnCount: turns.length,
      visibleTurns: expandedAgentIds.has(agentId) ? visibleTurns : [],
      extraTurns: expandedAgentIds.has(agentId) ? extraTurns : 0,
      childCount: children.length,
      descendantCount: children.length,
      depth: parentId.startsWith("workspace:") ? 3 : 2,
      todoSummary: todoSummary(record),
      sideChat,
      chat,
      occupancy: session?.state ?? record?.last_state,
    });
    edges.push({
      id: `e-${parentId}-${agentId}`,
      source: parentId,
      target: agentId,
      kind: "owns",
      animated: false,
    });

    for (const child of children) {
      const childId = `child:${member.sessionId}:${child.child_id}`;
      nodes.push({
        id: childId,
        parentId: agentId,
        kind: "subagent",
        label: child.name || child.child_id,
        session,
        currentToolLine: childToolLine(child),
        latestPrompt: child.prompt?.trim() || undefined,
        turnCount: 0,
        visibleTurns: [],
        extraTurns: 0,
        childCount: 0,
        descendantCount: 0,
        depth: parentId.startsWith("workspace:") ? 4 : 3,
        sideChat: false,
        chat: false,
        occupancy: child.state,
        child,
      });
      edges.push({
        id: `e-${agentId}-${childId}`,
        source: agentId,
        target: childId,
        kind: "spawn",
        animated: false,
      });
    }
  }

  const childrenById = new Map<string, string[]>();
  const parentById = new Map<string, string | null>();
  for (const node of nodes) {
    parentById.set(node.id, node.parentId);
    if (!node.parentId) continue;
    const list = childrenById.get(node.parentId) ?? [];
    list.push(node.id);
    childrenById.set(node.parentId, list);
  }

  function descendantCountOf(id: string): number {
    const kids = childrenById.get(id) ?? [];
    let total = kids.length;
    for (const kid of kids) total += descendantCountOf(kid);
    return total;
  }

  function hiddenByCollapse(id: string): boolean {
    let parent = parentById.get(id) ?? null;
    while (parent) {
      if (collapsedIds.has(parent)) return true;
      parent = parentById.get(parent) ?? null;
    }
    return false;
  }

  for (const node of nodes) {
    node.childCount = (childrenById.get(node.id) ?? []).length;
    node.descendantCount = descendantCountOf(node.id);
  }

  const visibleNodes = nodes.filter((node) => !hiddenByCollapse(node.id));
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = edges.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
  );

  return { nodes: visibleNodes, edges: visibleEdges };
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
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const positions = new Map<string, { x: number; y: number }>();
  const NODE_WIDTH = 288;
  const GAP_X = 96;
  const GAP_Y = 48;

  function height(id: string): number {
    const node = byId.get(id);
    if (!node) return 108;
    if (node.kind === "subagent") return 128;
    if (node.kind === "agent") {
      const extra = expandedAgentIds.has(id)
        ? Math.min(node.visibleTurns.length, 6) * 22 + (node.extraTurns > 0 ? 18 : 0)
        : 0;
      return 136 + extra;
    }
    return 112;
  }

  function subtreeHeight(id: string): number {
    const kids = children.get(id) ?? [];
    if (!kids.length) return height(id);
    const sum =
      kids.reduce((acc, kid) => acc + subtreeHeight(kid), 0) + GAP_Y * (kids.length - 1);
    return Math.max(height(id), sum);
  }

  function place(id: string, x: number, y: number) {
    const tall = subtreeHeight(id);
    const h = height(id);
    positions.set(id, { x, y: y + tall / 2 - h / 2 });
    const kids = children.get(id) ?? [];
    let cursor = y;
    const childX = x + NODE_WIDTH + GAP_X;
    for (const kid of kids) {
      const kidH = subtreeHeight(kid);
      place(kid, childX, cursor);
      cursor += kidH + GAP_Y;
    }
  }

  place("atmos", 0, 0);
  return positions;
}

export function observerSubtreeIds(nodes: ObserverGraphNode[], rootId: string): string[] {
  const ids = [rootId];
  const byParent = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const list = byParent.get(node.parentId) ?? [];
    list.push(node.id);
    byParent.set(node.parentId, list);
  }
  const stack = [...(byParent.get(rootId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id) continue;
    ids.push(id);
    const kids = byParent.get(id);
    if (kids) stack.push(...kids);
  }
  return ids;
}

export function observerNodeTitle(
  node: ObserverGraphNode,
  sessionTitle?: string | null,
): string {
  if (node.kind === "agent") {
    const titled = sessionTitle?.trim();
    if (titled) return titled;
    return node.label;
  }
  if (node.kind === "subagent") {
    const named = node.child?.name?.trim() || node.label.trim();
    if (named) return named;
  }
  return node.label;
}
