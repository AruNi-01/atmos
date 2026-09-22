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
import { useState } from "react";
import { useTranslations } from "next-intl";
import { MatrixOrb, Popover, PopoverContent, PopoverTrigger, cn } from "@workspace/ui";
import type { AgentPendingPermission, AgentTodoItem } from "@atmos/api-types/ws/dto/events";
import { observerStaggerMs } from "@/features/agent/lib/observer-graph-motion";
import "./observer-flow.css";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { AgentPermissionCard } from "@/features/agent/components/AgentPermissionCard";
import type { PendingPermission } from "@/features/agent/lib/chat-helpers";
import { agentChatApi } from "@/api/ws/agent-chat-api";
import { agentStatusApi } from "@/api/rest-api";
import { useObserverTerminalStore } from "./ObserverTerminalDrawer";
import {
  AGENT_TOOL_ICON_IDS,
  AGENT_TOOL_LABELS,
} from "@/features/agent/store/agent-status-store";
import type { AttentionReason } from "@/features/agent/store/agent-attention-store";
import {
  observerLiveHeadline,
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
  attentionReason?: AttentionReason | null;
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
  attentionReason,
  onToggle,
}: {
  data: ObserverGraphNode;
  selected: boolean;
  collapsed: boolean;
  presence: ObserverPresence;
  sessionTitle?: string;
  attentionReason?: AttentionReason | null;
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
  const wellTitle = observerLiveHeadline({
    occupancy: state,
    liveKind: data.liveKind,
    currentToolLine: data.currentToolLine,
    latestPrompt: data.latestPrompt,
    fallback: name,
    pendingPermission: data.pendingPermission,
    labels: {
      thinking: t("stateThinking"),
      streaming: t("stateStreaming"),
      working: t("stateWorking"),
    },
  });
  const permission = data.pendingPermission;
  const needsPermission = state === "permission_request" || data.liveKind === "permission";
  const attention =
    needsPermission || attentionReason === "permission_request"
      ? "permission_request"
      : attentionReason === "task_complete"
        ? "task_complete"
        : null;
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
        attention === "permission_request" &&
          "agent-attention-ring-card agent-attention-ring-permission",
        attention === "task_complete" &&
          "agent-attention-ring-card agent-attention-ring-complete",
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
        {needsPermission && permission ? (
          <ObserverPermissionLine
            node={data}
            permission={permission}
            label={wellTitle}
          />
        ) : (
          <div className="truncate text-[13px] font-medium leading-5" title={wellTitle}>
            {wellTitle}
          </div>
        )}
        {caption.length > 0 ? (
          <div className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground" title={caption.join(" · ")}>
            {caption.join(" · ")}
          </div>
        ) : null}
        {data.todos.length > 0 ? <ObserverTodos todos={data.todos} /> : null}
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

function currentTodo(todos: AgentTodoItem[]): AgentTodoItem | undefined {
  const active = todos.find((todo) => {
    const status = todo.status.trim().toLowerCase();
    return status === "in_progress" || status === "in-progress";
  });
  if (active) return active;
  return todos.find((todo) => {
    const status = todo.status.trim().toLowerCase();
    return status !== "completed" && status !== "cancelled" && status !== "canceled";
  }) ?? todos[0];
}

function ObserverTodos({ todos }: { todos: AgentTodoItem[] }) {
  const t = useTranslations("AgentObserver");
  const [open, setOpen] = useState(false);
  const current = currentTodo(todos);
  if (!current) return null;
  return (
    <div className="nodrag nopan mt-2 border-t border-border/60 pt-2">
      <button
        type="button"
        className="flex w-full min-w-0 items-start gap-1.5 text-left"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <ChevronRight className={cn("mt-0.5 size-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className="min-w-0 flex-1 truncate text-[12px] leading-4 text-foreground" title={current.content}>
          {current.content}
        </span>
      </button>
      {open ? (
        <ul className="mt-1 max-h-28 space-y-1 overflow-y-auto pl-4">
          {todos.map((todo, index) => {
            const done = todo.status === "completed" || todo.status === "cancelled" || todo.status === "canceled";
            return (
              <li
                key={`${todo.content}-${index}`}
                className={cn(
                  "truncate text-[11px] leading-4",
                  done ? "text-muted-foreground line-through" : "text-foreground",
                )}
                title={todo.content}
              >
                {todo.content}
              </li>
            );
          })}
        </ul>
      ) : (
        <span className="sr-only">{t("currentTask")}</span>
      )}
    </div>
  );
}

const PANEL_REPLY_TOOLS = new Set([
  "claude-code",
  "codex",
  "gemini",
  "antigravity",
  "pi",
  "opencode",
]);

function canReplyFromPanel(node: ObserverGraphNode): boolean {
  const sessionId = node.session?.session_id ?? node.activity?.session_id ?? "";
  if (node.chat || node.session?.surface === "chat" || sessionId.startsWith("chat:")) {
    return true;
  }
  const tool = node.session?.tool ?? node.activity?.tool;
  return Boolean(tool && PANEL_REPLY_TOOLS.has(tool));
}

function toPendingPermission(permission: AgentPendingPermission): PendingPermission {
  return {
    request_id: permission.request_id,
    tool: permission.tool,
    description: permission.description,
    content_markdown: permission.content_markdown ?? undefined,
    plan_todos: permission.plan_todos?.map((todo) => ({
      id: todo.id,
      content: todo.content,
      status: todo.status ?? undefined,
    })),
    risk_level: "unknown",
    options: (permission.options ?? []).map((option) => ({
      option_id: option.option_id,
      name: option.name,
      kind: option.kind,
    })),
    questions: permission.questions?.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: question.options,
    })),
  };
}

function ObserverPermissionLine({
  node,
  permission,
  label,
}: {
  node: ObserverGraphNode;
  permission: AgentPendingPermission;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const card = toPendingPermission(permission);
  const openTerminal = useObserverTerminalStore((state) => state.open);
  const sessionId = node.session?.session_id ?? node.activity?.session_id;
  if (!canReplyFromPanel(node)) {
    return (
      <button
        type="button"
        className="nodrag nopan block w-full truncate text-left text-[13px] font-medium leading-5 text-foreground"
        title={label}
        onClick={(event) => {
          event.stopPropagation();
          if (node.session) openTerminal(node.session);
        }}
      >
        {label}
      </button>
    );
  }
  const chat =
    node.chat || node.session?.surface === "chat" || Boolean(sessionId?.startsWith("chat:"));
  const chatId = chat
    ? node.session?.surface_id ?? node.activity?.surface_id ?? sessionId?.replace(/^chat:/, "")
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="nodrag nopan block w-full truncate text-left text-[13px] font-medium leading-5 text-foreground"
          title={label}
          onClick={(event) => event.stopPropagation()}
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="nodrag nopan nowheel w-[360px] p-2"
        onClick={(event) => event.stopPropagation()}
      >
        <AgentPermissionCard
          permission={card}
          markdown={permission.content_markdown ?? null}
          onRespond={(optionId) => {
            if (chatId) {
              void agentChatApi.permissionRespond(chatId, permission.request_id, optionId);
              setOpen(false);
              return;
            }
            if (!sessionId) return;
            void agentStatusApi
              .respondPermission({
                sessionId,
                requestId: permission.request_id,
                optionId,
              })
              .then((result) => {
                if (result.accepted) setOpen(false);
              });
          }}
        />
      </PopoverContent>
    </Popover>
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
      attentionReason={data.attentionReason}
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
