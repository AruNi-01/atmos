"use client";

import type { CSSProperties } from "react";
import {
  Handle,
  Position,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { ChevronRight, FolderGit2, GitBranch, GripVertical, Monitor } from "lucide-react";
import { useTranslations } from "next-intl";
import { MatrixOrb, cn } from "@workspace/ui";
import { observerStaggerMs } from "@/features/agent/lib/observer-graph-motion";
import "./observer-flow.css";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import {
  AGENT_TOOL_ICON_IDS,
  AGENT_TOOL_LABELS,
} from "@/features/agent/store/agent-status-store";
import {
  observerNodeTitle,
  type ObserverGraphNode,
} from "@/features/agent/lib/agent-observer-graph";

export type ObserverPresence = "live" | "exit";

export type ObserverFlowData = {
  node: ObserverGraphNode;
  collapsed: boolean;
  presence: ObserverPresence;
  onToggle: () => void;
  sessionTitle?: string;
};

export type ObserverEdgeData = {
  kind: "owns" | "spawn";
  presence: ObserverPresence;
};

type Tone = {
  shell: string;
  kicker: string;
  handle: string;
  well: string;
};

function occupancyOf(node: ObserverGraphNode): string | undefined {
  return node.occupancy ?? node.session?.state ?? node.activity?.last_state;
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

function agentTitle(node: ObserverGraphNode): string {
  if (node.kind === "agent" && node.session?.tool) {
    return AGENT_TOOL_LABELS[node.session.tool] ?? node.label;
  }
  return node.label;
}

function kindTone(node: ObserverGraphNode): Tone {
  const state = occupancyOf(node);
  if (node.kind === "subagent") {
    if (state === "permission_request") {
      return {
        shell: "border-warning/50 bg-warning/12",
        kicker: "text-warning",
        handle: "var(--warning)",
        well: "bg-background",
      };
    }
    return {
      shell:
        state === "running"
          ? "border-success/45 bg-success/12"
          : "border-success/28 bg-success/8",
      kicker: "text-success",
      handle: "var(--success)",
      well: "bg-background",
    };
  }
  if (node.kind === "agent") {
    if (state === "permission_request") {
      return {
        shell: "border-warning/50 bg-warning/12",
        kicker: "text-warning",
        handle: "var(--warning)",
        well: "bg-background",
      };
    }
    if (state === "running") {
      return {
        shell: "border-info/45 bg-info/12",
        kicker: "text-info",
        handle: "var(--info)",
        well: "bg-background",
      };
    }
    return {
      shell: "border-border bg-muted/20",
      kicker: "text-muted-foreground",
      handle: "color-mix(in oklch, var(--muted-foreground) 80%, transparent)",
      well: "bg-background",
    };
  }
  return {
    shell: "border-border bg-card",
    kicker: "text-muted-foreground",
    handle: "color-mix(in oklch, var(--muted-foreground) 70%, transparent)",
    well: "bg-background",
  };
}

function KindGlyph({ node }: { node: ObserverGraphNode }) {
  const running = occupancyOf(node) === "running";
  if (node.kind === "atmos") {
    return <Monitor className="size-3.5" />;
  }
  if (node.kind === "project") {
    return <FolderGit2 className="size-3.5" />;
  }
  if (node.kind === "workspace") {
    return <GitBranch className="size-3.5" />;
  }
  if (node.kind === "subagent") {
    return (
      <MatrixOrb
        state={running ? "thinking" : "idle"}
        size={16}
        seed={node.id}
        aria-hidden
      />
    );
  }
  const tool = node.session?.tool ?? node.activity?.tool;
  if (tool) {
    return (
      <AgentIcon
        registryId={AGENT_TOOL_ICON_IDS[tool] ?? tool}
        name={agentTitle(node)}
        size={16}
      />
    );
  }
  return (
    <MatrixOrb
      state={running ? "thinking" : "idle"}
      size={16}
      seed={node.id}
      aria-hidden
    />
  );
}

function ObserverNodeCard({
  data,
  selected,
  collapsed,
  presence,
  sessionTitle,
  onToggle,
}: {
  data: ObserverGraphNode;
  selected: boolean;
  collapsed: boolean;
  presence: ObserverPresence;
  sessionTitle?: string;
  onToggle: () => void;
}) {
  const t = useTranslations("AgentObserver");
  const tone = kindTone(data);
  const state = occupancyOf(data);
  const name = agentTitle(data);
  const resolvedTitle = observerNodeTitle(data, sessionTitle);
  const headline =
    data.kind === "atmos"
      ? t("kindComputer")
      : data.kind === "project"
        ? t("kindProject")
        : data.kind === "workspace"
          ? t("kindWorkspace")
          : data.kind === "agent" && resolvedTitle === data.label
            ? name
            : resolvedTitle;
  const activityLine =
    state === "running"
      ? (data.currentToolLine ?? data.latestPrompt)
      : (data.latestPrompt ?? data.currentToolLine);
  const wellTitle = activityLine || name;
  const canToggle =
    data.descendantCount > 0 &&
    (data.kind === "agent" || data.kind === "project" || data.kind === "workspace");
  const folded = collapsed;
  const exiting = presence === "exit";
  const caption = [
    occupancyLabel(t, state) || null,
    (data.kind === "agent" || data.kind === "subagent") && headline !== name ? name : null,
    data.chat ? t("chat") : data.sideChat ? t("sideChat") : null,
    data.kind === "agent" && data.turnCount > 0 ? t("turns", { count: data.turnCount }) : null,
    data.kind === "agent" && data.childCount > 0
      ? t("children", { count: data.childCount })
      : null,
    data.todoSummary,
    data.kind !== "agent" && data.kind !== "subagent"
      ? t("members", { count: data.childCount })
      : null,
  ].filter(Boolean);

  const handleStyle = {
    width: 10,
    height: 10,
    minWidth: 10,
    minHeight: 10,
    background: tone.handle,
    borderWidth: 2,
    borderColor: "var(--background)",
    borderRadius: 9999,
  } as const;

  return (
    <div
      className={cn(
        "observer-card w-[288px] rounded-xl border px-3 pt-2.5 pb-3",
        tone.shell,
        selected && "ring-1 ring-foreground/25",
        exiting && "is-exiting",
      )}
      data-presence={presence}
      style={{ "--observer-stagger": `${observerStaggerMs(data.depth)}ms` } as CSSProperties}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        style={handleStyle}
      />

      <div className="observer-card-header flex items-center gap-2">
        <button
          type="button"
          aria-label={t("dragCard")}
          className={cn(
            "observer-drag-handle relative flex size-6 shrink-0 items-center justify-center",
            tone.kicker,
          )}
        >
          <span className="observer-kind-glyph flex size-6 items-center justify-center">
            <KindGlyph node={data} />
          </span>
          <span className="observer-drag-grip absolute inset-0 flex items-center justify-center text-muted-foreground">
            <GripVertical className="size-3.5" />
          </span>
        </button>
        <div className={cn("min-w-0 flex-1 truncate text-[13px] font-medium leading-none", tone.kicker)} title={headline}>
          {headline}
        </div>
        {canToggle ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <span
              className={cn(
                "min-w-[1.25rem] text-right text-[11px] font-medium tabular-nums text-muted-foreground",
                !(folded && data.descendantCount > 0) && "invisible",
              )}
            >
              {data.descendantCount}
            </span>
            <button
              type="button"
              aria-label={t(folded ? "expand" : "fold")}
              className="nodrag nopan flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background/80 hover:text-foreground"
              onClick={(event) => {
                event.stopPropagation();
                onToggle();
              }}
            >
              <ChevronRight className={cn("size-3.5 transition-transform", folded && "rotate-90")} />
            </button>
          </div>
        ) : null}
      </div>

      <div className={cn("mt-2.5 rounded-lg px-2.5 py-2", tone.well)}>
        <div className="truncate text-[13px] font-medium leading-5" title={wellTitle}>
          {wellTitle}
        </div>
        {caption.length > 0 ? (
          <div className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground" title={caption.join(" · ")}>
            {caption.join(" · ")}
          </div>
        ) : null}
        {data.visibleTurns.length > 0 ? (
          <ol className="mt-2 max-h-32 space-y-1 overflow-y-auto border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
            {data.visibleTurns.map((turn) => (
              <li key={turn.turn_id} className="truncate">
                {turn.prompt || t("emptyPrompt")}
              </li>
            ))}
            {data.extraTurns > 0 ? <li>{t("moreTurns", { count: data.extraTurns })}</li> : null}
          </ol>
        ) : null}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={handleStyle}
      />
    </div>
  );
}

function ObserverFlowNode({ data, selected }: NodeProps<Node<ObserverFlowData>>) {
  return (
    <ObserverNodeCard
      data={data.node}
      selected={selected}
      collapsed={data.collapsed}
      presence={data.presence}
      sessionTitle={data.sessionTitle}
      onToggle={data.onToggle}
    />
  );
}

function ObserverFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<Edge<ObserverEdgeData>>) {
  const spawn = data?.kind === "spawn";
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
  });
  const stroke = spawn
    ? "color-mix(in oklch, var(--success) 70%, transparent)"
    : "color-mix(in oklch, var(--muted-foreground) 40%, transparent)";
  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        pathLength={spawn ? undefined : 1}
        markerEnd={markerEnd}
        className={cn(
          "react-flow__edge-path observer-edge-stroke",
          spawn && "observer-edge-spawn",
        )}
        style={{
          stroke,
          strokeWidth: spawn ? 1.8 : 1.35,
          ["--observer-stagger" as string]: "0ms",
        }}
      />
      <path
        d={edgePath}
        fill="none"
        strokeWidth={20}
        className="react-flow__edge-interaction"
      />
    </>
  );
}

export const OBSERVER_NODE_TYPES = { observer: ObserverFlowNode };
export const OBSERVER_EDGE_TYPES = { observer: ObserverFlowEdge };
export { occupancyLabel, occupancyOf, agentTitle };
