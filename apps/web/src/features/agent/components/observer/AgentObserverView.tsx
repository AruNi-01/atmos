"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTranslations } from "next-intl";
import { Button } from "@workspace/ui";
import { useShallow } from "zustand/react/shallow";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import { useAgentStatusStore, AGENT_TOOL_LABELS } from "@/features/agent/store/agent-status-store";
import { useAgentActivityStore } from "@/features/agent/store/agent-activity-store";
import { useAtmosComputerStore } from "@/features/connection/lib/atmos-computer-store";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { navigateToAgentStatusSession } from "@/features/agent/lib/agent-status-navigation";
import {
  buildObserverGraph,
  layoutObserverGraph,
  sessionFromActivity,
  type ObserverGraphNode,
} from "@/features/agent/lib/agent-observer-graph";

const HIDDEN_HANDLE_CLASS =
  "!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent !opacity-0";

function nodeClass(state?: string): string {
  if (state === "permission_request") return "border-warning/70 bg-warning/10";
  if (state === "running") return "border-info/60 bg-info/10";
  return "border-border bg-card";
}

function occupancyLabel(
  t: (key: "stateIdle" | "stateRunning" | "statePermission") => string,
  state?: string,
): string {
  if (state === "permission_request") return t("statePermission");
  if (state === "running") return t("stateRunning");
  if (state === "idle") return t("stateIdle");
  return state ?? "";
}

function nodeOccupancy(node: ObserverGraphNode): string | undefined {
  return node.occupancy ?? node.session?.state ?? node.activity?.last_state;
}

function agentLike(kind: ObserverGraphNode["kind"]): boolean {
  return kind === "agent" || kind === "subagent";
}

type ObserverFlowData = {
  node: ObserverGraphNode;
  expanded: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onOpen: () => void;
};

function ObserverNodeCard({
  data,
  selected,
  expanded,
  collapsed,
  onToggle,
  onOpen,
}: {
  data: ObserverGraphNode;
  selected: boolean;
  expanded: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const t = useTranslations("AgentObserver");
  const label =
    data.kind === "agent" && data.session?.tool
      ? AGENT_TOOL_LABELS[data.session.tool] ?? data.label
      : data.label;
  const state = nodeOccupancy(data);
  const line =
    state === "running" ? data.currentToolLine : data.latestPrompt ?? data.currentToolLine;
  const canToggle =
    data.kind === "agent" || data.kind === "project" || data.kind === "workspace";

  return (
    <div
      className={`min-w-[220px] max-w-[260px] rounded-lg border px-3 py-2 shadow-sm ${nodeClass(state)} ${selected ? "ring-2 ring-primary/50" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-sm font-medium">{label}</div>
        {canToggle ? (
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            {data.kind === "agent"
              ? t(expanded ? "fold" : "expand")
              : t(collapsed ? "expand" : "fold")}
          </button>
        ) : null}
      </div>
      {agentLike(data.kind) ? (
        <>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {occupancyLabel(t, state)}
            {data.chat ? ` · ${t("chat")}` : data.sideChat ? ` · ${t("sideChat")}` : ""}
            {data.turnCount > 1 ? ` · ${t("turns", { count: data.turnCount })}` : ""}
            {data.todoSummary ? ` · ${data.todoSummary}` : ""}
            {data.childCount ? ` · ${t("children", { count: data.childCount })}` : ""}
          </div>
          {line ? (
            <div className="mt-1 truncate text-xs" title={line}>
              {line}
            </div>
          ) : null}
          {data.visibleTurns.length > 0 ? (
            <ol className="mt-2 max-h-36 space-y-1 overflow-y-auto text-[11px]">
              {data.visibleTurns.map((turn) => (
                <li key={turn.turn_id} className="truncate text-muted-foreground">
                  {turn.prompt || t("emptyPrompt")}
                </li>
              ))}
              {data.extraTurns > 0 ? (
                <li className="text-muted-foreground">{t("moreTurns", { count: data.extraTurns })}</li>
              ) : null}
            </ol>
          ) : null}
          {data.kind === "agent" ? (
            <Button
              size="sm"
              variant="ghost"
              className="mt-2 h-7 px-2 text-[11px]"
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}
            >
              {t(data.chat ? "openChat" : "openPane")}
            </Button>
          ) : null}
        </>
      ) : (
        <div className="mt-1 text-[11px] text-muted-foreground">
          {t("members", { count: data.childCount })}
        </div>
      )}
    </div>
  );
}

function ObserverFlowNode({ data, selected }: NodeProps<Node<ObserverFlowData>>) {
  return (
    <div className="relative">
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        className={HIDDEN_HANDLE_CLASS}
      />
      <ObserverNodeCard
        data={data.node}
        selected={selected}
        expanded={data.expanded}
        collapsed={data.collapsed}
        onToggle={data.onToggle}
        onOpen={data.onOpen}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className={HIDDEN_HANDLE_CLASS}
      />
    </div>
  );
}

const OBSERVER_NODE_TYPES = { observer: ObserverFlowNode };

export function AgentObserverView() {
  const t = useTranslations("AgentObserver");
  const router = useAppRouter();
  const projects = useProjects();
  const sessionsMap = useAgentStatusStore(useShallow((s) => s.sessions));
  const activityMap = useAgentActivityStore(useShallow((s) => s.records));
  const computerName = useAtmosComputerStore((s) => s.localComputerDisplayName);
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [expandedAgentIds, setExpandedAgentIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layoutNonce, setLayoutNonce] = useState(0);
  const flowRef = useRef<ReactFlowInstance<Node<ObserverFlowData>, Edge> | null>(null);

  const graph = useMemo(
    () =>
      buildObserverGraph({
        projects,
        sessions: sessionsMap.values(),
        activity: activityMap.values(),
        collapsedIds,
        expandedAgentIds,
        computerName: computerName || undefined,
      }),
    [projects, sessionsMap, activityMap, collapsedIds, expandedAgentIds, computerName],
  );

  const positions = useMemo(
    () => layoutObserverGraph(graph, expandedAgentIds),
    [graph, expandedAgentIds, layoutNonce],
  );

  const openSession = useCallback(
    (node: ObserverGraphNode) => {
      const session = node.session ?? (node.activity ? sessionFromActivity(node.activity) : null);
      if (!session) return;
      navigateToAgentStatusSession(session, router, projects);
    },
    [projects, router],
  );

  const toggleNode = useCallback((node: ObserverGraphNode) => {
    if (node.kind === "agent") {
      setExpandedAgentIds((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return next;
      });
      return;
    }
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });
  }, []);

  const flowNodes: Node<ObserverFlowData>[] = useMemo(
    () =>
      graph.nodes.map((node) => {
        const position = positions.get(node.id) ?? { x: 0, y: 0 };
        return {
          id: node.id,
          position,
          data: {
            node,
            expanded: expandedAgentIds.has(node.id),
            collapsed: collapsedIds.has(node.id),
            onToggle: () => toggleNode(node),
            onOpen: () => openSession(node),
          },
          type: "observer",
          draggable: false,
        };
      }),
    [collapsedIds, expandedAgentIds, graph.nodes, openSession, positions, toggleNode],
  );

  const flowEdges: Edge[] = useMemo(
    () =>
      graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        animated: edge.animated,
        style: { strokeWidth: 1.5 },
      })),
    [graph.edges],
  );

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    setSelectedId(node.id);
  }, []);

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const found = graph.nodes.find((n) => n.id === node.id);
      if (found && agentLike(found.kind)) {
        openSession(found);
      }
    },
    [graph.nodes, openSession],
  );

  const selected = graph.nodes.find((n) => n.id === selectedId);
  const connected = connectionState === "connected";

  useEffect(() => {
    flowRef.current?.fitView();
  }, [layoutNonce]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setLayoutNonce((n) => n + 1)}>
          {t("relayout")}
        </Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {graph.nodes.length <= 1 ? (
            <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted-foreground">
              {connected ? t("empty") : t("disconnected")}
            </div>
          ) : (
            <ReactFlow<Node<ObserverFlowData>, Edge>
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={OBSERVER_NODE_TYPES}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
              onInit={(instance) => {
                flowRef.current = instance;
                instance.fitView();
              }}
              nodesConnectable={false}
              elementsSelectable
              minZoom={0.2}
              defaultEdgeOptions={{
                type: "smoothstep",
                style: {
                  stroke: "color-mix(in srgb, var(--muted-foreground) 45%, transparent)",
                  strokeWidth: 1.5,
                },
              }}
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
            </ReactFlow>
          )}
        </div>
        {selected && agentLike(selected.kind) ? (
          <aside className="w-80 shrink-0 overflow-y-auto border-l p-4">
            <div className="text-sm font-medium">
              {selected.kind === "subagent"
                ? selected.label
                : selected.session?.tool
                  ? AGENT_TOOL_LABELS[selected.session.tool] ?? selected.label
                  : selected.label}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {occupancyLabel(t, nodeOccupancy(selected))}
            </div>
            {selected.kind === "agent" ? (
              <Button className="mt-3" size="sm" onClick={() => openSession(selected)}>
                {selected.chat ? t("openChat") : t("openPane")}
              </Button>
            ) : null}
            <ol className="mt-4 space-y-3 text-xs">
              {(selected.activity?.turns ?? []).slice().reverse().map((turn) => (
                <li key={turn.turn_id} className="rounded-md border p-2">
                  <div className="font-medium">{turn.prompt || t("emptyPrompt")}</div>
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {turn.tools.map((tool, index) => (
                      <li key={`${turn.turn_id}-${tool.name}-${index}`}>
                        {tool.name}
                        {tool.repeat > 1 ? ` ×${tool.repeat}` : ""}
                        {tool.detail ? ` ${tool.detail}` : ""}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
