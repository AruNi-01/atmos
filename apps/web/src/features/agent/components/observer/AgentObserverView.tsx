"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  ReactFlow,
  applyNodeChanges,
  type Edge,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { LayoutGrid } from "lucide-react";
import { useTranslations } from "next-intl";
import { useShallow } from "zustand/react/shallow";
import { IconActivity, ProjectEmpty } from "@workspace/ui";
import { agentHooksApi, type AgentHookInstallReport } from "@/api/rest-api";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import { useAgentStatusStore } from "@/features/agent/store/agent-status-store";
import { useAgentActivityStore } from "@/features/agent/store/agent-activity-store";
import { useAtmosComputerStore } from "@/features/connection/lib/atmos-computer-store";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { navigateToAgentStatusSession } from "@/features/agent/lib/agent-status-navigation";
import { ObserverNewChatPicker } from "./ObserverNewChatPicker";
import { ObserverInstallHooksButton } from "./ObserverInstallHooksButton";
import {
  buildObserverGraph,
  layoutObserverGraph,
  sessionFromActivity,
  type ObserverGraphNode,
} from "@/features/agent/lib/agent-observer-graph";
import { useObserverPresence } from "@/features/agent/hooks/use-observer-presence";
import {
  OBSERVER_NODE_TYPES,
  OBSERVER_EDGE_TYPES,
  type ObserverEdgeData,
  type ObserverFlowData,
} from "./observer-flow";
import { ObserverDrawer } from "./ObserverDrawer";

function agentLike(kind: ObserverGraphNode["kind"]): boolean {
  return kind === "agent" || kind === "subagent";
}

function sameFlowNodes(
  current: Node<ObserverFlowData>[],
  next: Node<ObserverFlowData>[],
): boolean {
  if (current.length !== next.length) return false;
  for (let i = 0; i < current.length; i++) {
    const left = current[i];
    const right = next[i];
    if (
      left.id !== right.id ||
      left.position.x !== right.position.x ||
      left.position.y !== right.position.y ||
      left.selected !== right.selected ||
      left.className !== right.className ||
      left.data.presence !== right.data.presence ||
      left.data.collapsed !== right.data.collapsed
    ) {
      return false;
    }
  }
  return true;
}

function sameFlowEdges(
  current: Edge<ObserverEdgeData>[],
  next: Edge<ObserverEdgeData>[],
): boolean {
  if (current.length !== next.length) return false;
  for (let i = 0; i < current.length; i++) {
    const left = current[i];
    const right = next[i];
    if (
      left.id !== right.id ||
      left.source !== right.source ||
      left.target !== right.target ||
      left.className !== right.className ||
      left.animated !== right.animated ||
      left.data?.presence !== right.data?.presence
    ) {
      return false;
    }
  }
  return true;
}

export function AgentObserverView() {
  const t = useTranslations("AgentObserver");
  const router = useAppRouter();
  const projects = useProjects();
  const sessionsMap = useAgentStatusStore(useShallow((s) => s.sessions));
  const activityMap = useAgentActivityStore(useShallow((s) => s.records));
  const computerName = useAtmosComputerStore((s) => s.localComputerDisplayName);
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const queryScope = useComputerQueryScope();
  const hookTarget = [
    queryScope.activeInstanceId,
    queryScope.connectionEpoch,
    queryScope.relaySessionRevision,
  ].join(":");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [positionOverrides, setPositionOverrides] = useState<Map<string, { x: number; y: number }>>(
    () => new Map(),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [installingHooks, setInstallingHooks] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [hookReport, setHookReport] = useState<AgentHookInstallReport | null>(null);
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
        expandedAgentIds: new Set(),
        computerName: computerName || undefined,
      }),
    [projects, sessionsMap, activityMap, collapsedIds, computerName],
  );

  const positions = useMemo(() => layoutObserverGraph(graph, new Set()), [graph]);

  const connected = connectionState === "connected";

  useEffect(() => {
    if (!connected) {
      setHookReport(null);
      return;
    }
    let cancelled = false;
    void agentHooksApi
      .getStatus()
      .then((status) => {
        if (!cancelled) setHookReport(status);
      })
      .catch(() => {
        if (!cancelled) setHookReport(null);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, hookTarget]);

  const installHooks = useCallback(async () => {
    setInstallingHooks(true);
    setInstallError(null);
    try {
      const next = await agentHooksApi.installAll();
      setHookReport(next);
    } catch {
      setInstallError(t("installError"));
    } finally {
      setInstallingHooks(false);
    }
  }, [t]);

  const openSession = useCallback(
    (node: ObserverGraphNode) => {
      const target =
        node.kind === "subagent" && node.parentId
          ? (graph.nodes.find((item) => item.id === node.parentId) ?? node)
          : node;
      const session =
        target.session ?? (target.activity ? sessionFromActivity(target.activity) : null);
      if (!session) return;
      navigateToAgentStatusSession(session, router, projects);
    },
    [graph.nodes, projects, router],
  );

  const toggleNode = useCallback((node: ObserverGraphNode) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });
  }, []);

  const liveNodes: Node<ObserverFlowData>[] = useMemo(
    () =>
      graph.nodes.map((node) => {
        const position = positionOverrides.get(node.id) ?? positions.get(node.id) ?? { x: 0, y: 0 };
        return {
          id: node.id,
          position,
          data: {
            node,
            collapsed: collapsedIds.has(node.id),
            presence: "live",
            onToggle: () => toggleNode(node),
          },
          type: "observer",
          selected: node.id === selectedId,
          dragHandle: ".observer-drag-handle",
          style: { width: 288 },
        };
      }),
    [collapsedIds, graph.nodes, positionOverrides, positions, selectedId, toggleNode],
  );

  const liveEdges: Edge<ObserverEdgeData>[] = useMemo(
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
          presence: "live",
        },
      })),
    [graph.edges, t],
  );

  const { exitingNodes, exitingEdges } = useObserverPresence(liveNodes, liveEdges);
  const liveNodeIds = useMemo(() => new Set(liveNodes.map((node) => node.id)), [liveNodes]);
  const liveEdgeIds = useMemo(() => new Set(liveEdges.map((edge) => edge.id)), [liveEdges]);

  const flowNodes = useMemo(
    () => [
      ...liveNodes,
      ...exitingNodes
        .filter((node) => !liveNodeIds.has(node.id))
        .map((node) => ({
          ...node,
          draggable: false,
          selectable: false,
          className: "observer-node-exiting",
          data: { ...node.data, presence: "exit" as const },
        })),
    ],
    [exitingNodes, liveNodeIds, liveNodes],
  );

  const flowEdges = useMemo(
    () => [
      ...liveEdges,
      ...exitingEdges
        .filter((edge) => !liveEdgeIds.has(edge.id))
        .map((edge) => ({
          ...edge,
          className: "observer-edge-exiting",
          data: { ...edge.data, presence: "exit" as const },
        })),
    ],
    [exitingEdges, liveEdgeIds, liveEdges],
  );

  const [nodes, setNodes] = useState<Node<ObserverFlowData>[]>([]);
  const [edges, setEdges] = useState<Edge<ObserverEdgeData>[]>([]);

  useLayoutEffect(() => {
    setNodes((current) => {
      if (current.some((node) => node.dragging)) return current;
      return sameFlowNodes(current, flowNodes) ? current : flowNodes;
    });
  }, [flowNodes]);

  useLayoutEffect(() => {
    setEdges((current) => (sameFlowEdges(current, flowEdges) ? current : flowEdges));
  }, [flowEdges]);

  const onNodesChange = useCallback((changes: NodeChange<Node<ObserverFlowData>>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onNodeDragStop: NodeMouseHandler = useCallback((_event, node) => {
    setPositionOverrides((prev) => {
      const next = new Map(prev);
      next.set(node.id, node.position);
      return next;
    });
  }, []);

  const resetLayout = useCallback(() => {
    setPositionOverrides(new Map());
  }, []);

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    setSelectedId(node.id);
  }, []);

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const found = graph.nodes.find((item) => item.id === node.id);
      if (found && agentLike(found.kind)) {
        openSession(found);
      }
    },
    [graph.nodes, openSession],
  );

  const selected = graph.nodes.find((node) => node.id === selectedId) ?? null;
  const canResetLayout = positionOverrides.size > 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="min-h-0 flex-1">
        {graph.nodes.length <= 1 ? (
          <div className="flex h-full items-center justify-center bg-background p-8">
            <ProjectEmpty
              variant="Minimal"
              className="max-w-[440px]"
              title={connected ? t("emptyTitle") : t("disconnectedTitle")}
              description={
                installError ?? (connected ? t("empty") : t("disconnected"))
              }
              createAction={
                <ObserverInstallHooksButton
                  connected={connected}
                  installing={installingHooks}
                  report={hookReport}
                  onInstall={() => {
                    void installHooks();
                  }}
                />
              }
              docsAction={<ObserverNewChatPicker projects={projects} />}
              icon={<IconActivity />}
            />
          </div>
        ) : (
          <ReactFlow<Node<ObserverFlowData>, Edge<ObserverEdgeData>>
            className="observer-flow bg-background"
            nodes={nodes.length > 0 ? nodes : flowNodes}
            edges={edges.length > 0 ? edges : flowEdges}
            nodeTypes={OBSERVER_NODE_TYPES}
            edgeTypes={OBSERVER_EDGE_TYPES}
            onNodesChange={onNodesChange}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeDragStop={onNodeDragStop}
            onInit={(instance) => {
              flowRef.current = instance;
              instance.fitView({ padding: 0.18 });
            }}
            nodesConnectable={false}
            nodesDraggable
            selectNodesOnDrag={false}
            nodeDragThreshold={5}
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
              className="!overflow-hidden !rounded-lg !border !border-border !bg-card !shadow-none [&>button]:!border-border [&>button]:!bg-card [&>button]:!fill-foreground [&>button]:!text-foreground"
            >
              <ControlButton
                onClick={resetLayout}
                disabled={!canResetLayout}
                title={t("resetLayout")}
                aria-label={t("resetLayout")}
              >
                <LayoutGrid className="size-3.5" />
              </ControlButton>
            </Controls>
          </ReactFlow>
        )}
      </div>
      <ObserverDrawer
        node={selected}
        onClose={() => setSelectedId(null)}
        onOpenSession={openSession}
      />
    </div>
  );
}
