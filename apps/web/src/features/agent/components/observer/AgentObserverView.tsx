"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTranslations } from "next-intl";
import { Button } from "@workspace/ui";
import { useShallow } from "zustand/react/shallow";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import { useAgentStatusStore } from "@/features/agent/store/agent-status-store";
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
import {
  OBSERVER_EDGE_TYPES,
  OBSERVER_NODE_TYPES,
  agentTitle,
  occupancyLabel,
  occupancyOf,
  type ObserverEdgeData,
  type ObserverFlowData,
} from "./observer-flow";

function agentLike(kind: ObserverGraphNode["kind"]): boolean {
  return kind === "agent" || kind === "subagent";
}

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
  const flowRef = useRef<ReactFlowInstance<Node<ObserverFlowData>, Edge<ObserverEdgeData>> | null>(
    null,
  );

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
          },
          type: "observer",
          draggable: false,
          style: { width: 288 },
        };
      }),
    [collapsedIds, expandedAgentIds, graph.nodes, positions, toggleNode],
  );

  const flowEdges: Edge<ObserverEdgeData>[] = useMemo(
    () =>
      graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "observer",
        animated: edge.animated,
        data: {
          kind: edge.kind,
          label: edge.kind === "spawn" ? t("spawn") : undefined,
        },
      })),
    [graph.edges, t],
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
    flowRef.current?.fitView({ padding: 0.18 });
  }, [layoutNonce, graph.nodes.length]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-5">
        <div className="min-w-0">
          <h1 className="text-[13px] font-semibold leading-none">{t("title")}</h1>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{t("subtitle")}</p>
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
            <ReactFlow<Node<ObserverFlowData>, Edge<ObserverEdgeData>>
              className="bg-background"
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={OBSERVER_NODE_TYPES}
              edgeTypes={OBSERVER_EDGE_TYPES}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
              onInit={(instance) => {
                flowRef.current = instance;
                instance.fitView({ padding: 0.18 });
              }}
              nodesConnectable={false}
              elementsSelectable
              minZoom={0.2}
              proOptions={{ hideAttribution: true }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={22}
                size={1}
                color="color-mix(in oklch, var(--muted-foreground) 28%, transparent)"
              />
              <Controls
                showInteractive={false}
                className="!overflow-hidden !rounded-lg !border !border-border !bg-card !shadow-none [&>button]:!border-border [&>button]:!bg-card [&>button]:!fill-foreground"
              />
            </ReactFlow>
          )}
        </div>
        {selected && agentLike(selected.kind) ? (
          <aside className="w-80 shrink-0 overflow-y-auto border-l bg-card/40 p-4">
            <div className="text-[11px] font-medium text-muted-foreground">
              {selected.kind === "subagent" ? t("kindSubagent") : occupancyLabel(t, occupancyOf(selected))}
            </div>
            <div className="mt-1 text-sm font-medium">{agentTitle(selected)}</div>
            {selected.kind === "agent" ? (
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => openSession(selected)}
              >
                {selected.chat ? t("openChat") : t("openPane")}
              </Button>
            ) : null}
            <ol className="mt-4 space-y-2 text-xs">
              {(selected.activity?.turns ?? [])
                .slice()
                .reverse()
                .map((turn) => (
                  <li key={turn.turn_id} className="rounded-lg border border-border bg-background p-2.5">
                    <div className="font-medium">{turn.prompt || t("emptyPrompt")}</div>
                    <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
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
