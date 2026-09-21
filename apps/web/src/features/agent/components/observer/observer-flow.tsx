"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { ChevronDown, FolderGit2, GitBranch, Monitor } from "lucide-react";
import { useTranslations } from "next-intl";
import { MatrixOrb, cn } from "@workspace/ui";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import {
  AGENT_TOOL_ICON_IDS,
  AGENT_TOOL_LABELS,
} from "@/features/agent/store/agent-status-store";
import type { ObserverGraphNode } from "@/features/agent/lib/agent-observer-graph";

export type ObserverFlowData = {
  node: ObserverGraphNode;
  expanded: boolean;
  collapsed: boolean;
  onToggle: () => void;
};

export type ObserverEdgeData = {
  kind: "owns" | "spawn";
  label?: string;
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
  expanded,
  collapsed,
  onToggle,
}: {
  data: ObserverGraphNode;
  selected: boolean;
  expanded: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("AgentObserver");
  const tone = kindTone(data);
  const state = occupancyOf(data);
  const name = agentTitle(data);
  const activityLine =
    state === "running"
      ? (data.currentToolLine ?? data.latestPrompt)
      : (data.latestPrompt ?? data.currentToolLine);
  const wellTitle = activityLine || name;
  const canToggle =
    data.kind === "agent" || data.kind === "project" || data.kind === "workspace";
  const folded = data.kind === "agent" ? !expanded : collapsed;
  const kicker =
    data.kind === "atmos"
      ? t("kindComputer")
      : data.kind === "project"
        ? t("kindProject")
        : data.kind === "workspace"
          ? t("kindWorkspace")
          : data.kind === "subagent"
            ? t("kindSubagent")
            : t("kindAgent");
  const caption = [
    occupancyLabel(t, state) || null,
    wellTitle !== name ? name : null,
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
        "w-[288px] rounded-xl border px-3 pt-2.5 pb-3",
        tone.shell,
        selected && "ring-1 ring-foreground/25",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        style={handleStyle}
      />

      <div className="flex items-center gap-2">
        <span className={cn("flex size-6 shrink-0 items-center justify-center", tone.kicker)}>
          <KindGlyph node={data} />
        </span>
        <div className={cn("min-w-0 flex-1 truncate text-[13px] font-medium leading-none", tone.kicker)}>
          {kicker}
        </div>
        {canToggle ? (
          <button
            type="button"
            aria-label={t(folded ? "expand" : "fold")}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background/80 hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            <ChevronDown className={cn("size-3.5 transition-transform", folded && "-rotate-90")} />
          </button>
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
        position={Position.Bottom}
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
      expanded={data.expanded}
      collapsed={data.collapsed}
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
  animated,
}: EdgeProps<Edge<ObserverEdgeData>>) {
  const spawn = data?.kind === "spawn";
  const [edgePath, labelX, labelY] = getSmoothStepPath({
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
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        className={animated ? "animated" : undefined}
        style={{
          stroke,
          strokeWidth: spawn ? 1.8 : 1.35,
        }}
      />
      {data?.label ? (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "nodrag nopan pointer-events-none rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none",
              spawn
                ? "border-success/35 bg-background text-success"
                : "border-border bg-background text-muted-foreground",
            )}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const OBSERVER_NODE_TYPES = { observer: ObserverFlowNode };
export const OBSERVER_EDGE_TYPES = { observer: ObserverFlowEdge };
export { occupancyLabel, occupancyOf, agentTitle };
