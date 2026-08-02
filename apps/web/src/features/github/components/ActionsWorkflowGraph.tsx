"use client";

import React from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  useNodesInitialized,
  useReactFlow,
  useUpdateNodeInternals,
} from "@xyflow/react";
import { useTranslations } from "next-intl";
import { parse } from "yaml";
import {
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Clock,
  Loader2,
  XCircle,
} from "lucide-react";
import type { GithubActionsJobPayload } from "@atmos/api-types/ws/dto/github";
import { cn } from "@/shared/lib/utils";

type WorkflowJobDefinition = {
  id: string;
  name: string;
  needs: string[];
};

type WorkflowNodeData = {
  duration: string | null;
  label: string;
  matrixJobs: WorkflowMatrixJob[];
  sourceConnected: boolean;
  status: string;
  summary: string | null;
  targetConnected: boolean;
  width: number;
};

type WorkflowMatrixJob = {
  duration: string | null;
  id: string;
  label: string;
  status: string;
};

function parseWorkflowJobs(content: string): WorkflowJobDefinition[] {
  try {
    const workflow = parse(content) as {
      jobs?: Record<
        string,
        {
          name?: string;
          needs?: string | string[];
        }
      >;
    };
    if (!workflow?.jobs || typeof workflow.jobs !== "object") return [];

    return Object.entries(workflow.jobs).map(([id, job]) => ({
      id,
      name: typeof job?.name === "string" ? job.name : id,
      needs: (
        Array.isArray(job?.needs)
          ? job.needs.filter((value): value is string => typeof value === "string")
          : typeof job?.needs === "string"
            ? [job.needs]
            : []
      )
        .map((need) => need.trim())
        .filter((need) => need.length > 0 && need !== id),
    }));
  } catch {
    return [];
  }
}

function isJobMatch(definition: WorkflowJobDefinition, job: GithubActionsJobPayload) {
  const jobName = job.name ?? "";
  if (definition.id === jobName || definition.name === jobName) return true;

  const expressionIndex = definition.name.indexOf("${{");
  if (expressionIndex < 0) return false;
  return jobName.startsWith(definition.name.slice(0, expressionIndex));
}

function getStatus(jobs: GithubActionsJobPayload[]) {
  const states = jobs.map((job) => job.conclusion ?? job.status ?? "unknown");
  if (states.includes("failure")) return "failure";
  if (states.includes("in_progress")) return "in_progress";
  if (states.includes("queued")) return "queued";
  if (states.includes("success")) return "success";
  return states[0] ?? "unknown";
}

function getDuration(jobs: GithubActionsJobPayload[]) {
  const duration = jobs.reduce((total, job) => {
    const startedAt = job.startedAt ?? job.started_at;
    const completedAt = job.completedAt ?? job.completed_at;
    if (!startedAt || !completedAt) return total;
    const milliseconds =
      new Date(completedAt).getTime() - new Date(startedAt).getTime();
    return Number.isFinite(milliseconds) ? total + Math.max(0, milliseconds) : total;
  }, 0);
  if (duration === 0) return null;

  const totalSeconds = Math.round(duration / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function getNodeWidth(
  label: string,
  duration: string | null,
  isMatrix: boolean,
) {
  if (isMatrix) return 360;
  return Math.min(360, Math.max(180, 68 + label.length * 8 + (duration?.length ?? 0) * 7));
}

function layoutNodes(definitions: WorkflowJobDefinition[], jobs: GithubActionsJobPayload[]) {
  const definitionIds = new Set(definitions.map((definition) => definition.id));
  const levelById = new Map<string, number>();

  const getLevel = (id: string, visiting = new Set<string>()): number => {
    const existing = levelById.get(id);
    if (existing != null) return existing;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const definition = definitions.find((candidate) => candidate.id === id);
    const level = Math.max(
      0,
      ...(definition?.needs
        .filter((need) => definitionIds.has(need))
        .map((need) => getLevel(need, visiting)) ?? []).map((value) => value + 1),
    );
    visiting.delete(id);
    levelById.set(id, level);
    return level;
  };

  definitions.forEach((definition) => getLevel(definition.id));
  const rowsByLevel = new Map<number, number>();

  const nodeDefinitions = definitions.map((definition) => {
    const matchedJobs = jobs.filter((job) => isJobMatch(definition, job));
    const level = levelById.get(definition.id) ?? 0;
    const row = rowsByLevel.get(level) ?? 0;
    rowsByLevel.set(level, row + 1);
    const isMatrix = matchedJobs.length > 1;
    const targetConnected = definition.needs.some((need) => definitionIds.has(need));
    const sourceConnected = definitions.some((candidate) =>
      candidate.needs.includes(definition.id),
    );
    const label = isMatrix ? `Matrix: ${definition.name}` : definition.name;
    const duration = getDuration(matchedJobs);
    const matrixJobs = isMatrix
      ? matchedJobs.map((job, index) => ({
          duration: getDuration([job]),
          id: String(job.databaseId ?? job.id ?? `${definition.id}-${index}`),
          label: job.name ?? `Job ${index + 1}`,
          status: job.conclusion ?? job.status ?? "unknown",
        }))
      : [];

    return {
      definition,
      level,
      row,
      data: {
        duration,
        label,
        matrixJobs,
        sourceConnected,
        status: getStatus(matchedJobs),
        summary: isMatrix
          ? `${matchedJobs.length} jobs`
          : matchedJobs.length === 0
            ? "Not run"
            : null,
        targetConnected,
        width: getNodeWidth(label, duration, isMatrix),
      },
    };
  });

  const columnWidths = new Map<number, number>();
  nodeDefinitions.forEach(({ level, data }) => {
    columnWidths.set(level, Math.max(columnWidths.get(level) ?? 0, data.width));
  });
  const columnPositions = new Map<number, number>();
  let nextColumnPosition = 0;
  [...columnWidths.entries()]
    .sort(([left], [right]) => left - right)
    .forEach(([level, width]) => {
      columnPositions.set(level, nextColumnPosition);
      nextColumnPosition += width + 80;
    });

  const nodes: Node<WorkflowNodeData>[] = nodeDefinitions.map(
    ({ definition, level, row, data }) => ({
      id: definition.id,
      type: "workflow",
      position: { x: columnPositions.get(level) ?? 0, y: row * 150 },
      style: { width: data.width },
      data,
    }),
  );

  const edges: Edge[] = definitions.flatMap((definition) =>
    definition.needs
      .filter((need) => definitionIds.has(need) && need !== definition.id)
      .map((need) => ({
        id: `${need}-${definition.id}`,
        source: need,
        target: definition.id,
        animated: true,
        style: { stroke: "var(--border)", strokeWidth: 1.5 },
      })),
  );

  return { nodes, edges };
}

function WorkflowNode({ data, id }: NodeProps<Node<WorkflowNodeData>>) {
  const [matrixExpanded, setMatrixExpanded] = React.useState(false);
  const updateNodeInternals = useUpdateNodeInternals();
  const isMatrix = data.matrixJobs.length > 0;

  React.useLayoutEffect(() => {
    if (!isMatrix) return;
    const frame = requestAnimationFrame(() => updateNodeInternals(id));
    const timeout = window.setTimeout(() => updateNodeInternals(id), 240);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [id, isMatrix, matrixExpanded, updateNodeInternals]);

  return (
    <div className="relative w-full rounded-md border border-border bg-background px-4 py-3 shadow-sm">
      {data.targetConnected && (
        <Handle
          className="size-2 border-2 border-background bg-muted-foreground"
          position={Position.Left}
          type="target"
        />
      )}
      <div className="flex items-center gap-2.5">
        <WorkflowStatusIcon status={data.status} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{data.label}</span>
        {data.duration && (
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {data.duration}
          </span>
        )}
      </div>
      {isMatrix ? (
        <>
          <button
            type="button"
            aria-expanded={matrixExpanded}
            className="nodrag nopan mt-2 flex w-full items-center justify-between rounded-sm px-1 py-0.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
            onClick={() => setMatrixExpanded((expanded) => !expanded)}
          >
            <span>{data.matrixJobs.length} jobs</span>
            <ChevronDown
              className={`size-3 transition-transform ${matrixExpanded ? "" : "-rotate-90"}`}
            />
          </button>
          <div
            className={cn(
              "grid overflow-hidden transition-[grid-template-rows,opacity] duration-240 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              matrixExpanded
                ? "mt-2 grid-rows-[1fr] opacity-100"
                : "mt-0 grid-rows-[0fr] opacity-0",
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="divide-y divide-border/40 border-t border-border/40">
                {data.matrixJobs.map((job) => (
                  <div key={job.id} className="flex items-center gap-2 py-2">
                    <WorkflowStatusIcon status={job.status} />
                    <span className="min-w-0 flex-1 truncate text-sm">{job.label}</span>
                    {job.duration && (
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {job.duration}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : data.summary ? (
        <div className="mt-2 text-xs text-muted-foreground">
          <span>{data.summary}</span>
        </div>
      ) : null}
      {data.sourceConnected && (
        <Handle
          className="size-2 border-2 border-background bg-muted-foreground"
          position={Position.Right}
          type="source"
        />
      )}
    </div>
  );
}

function WorkflowStatusIcon({ status }: { status: string }) {
  if (status === "success") {
    return <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />;
  }
  if (status === "failure") {
    return <XCircle className="size-4 shrink-0 text-red-500" />;
  }
  if (status === "queued" || status === "in_progress") {
    return <Loader2 className="size-4 shrink-0 animate-spin text-blue-500" />;
  }
  if (status === "skipped") {
    return <CircleDashed className="size-4 shrink-0 text-muted-foreground" />;
  }
  return <Clock className="size-4 shrink-0 text-muted-foreground" />;
}

const nodeTypes = { workflow: WorkflowNode };

function WorkflowViewportFitter({ nodes }: { nodes: Node[] }) {
  const flow = useReactFlow();
  const nodesInitialized = useNodesInitialized();

  React.useEffect(() => {
    if (!nodesInitialized || nodes.length === 0) return;
    const raf = requestAnimationFrame(() => {
      void flow.fitView({
        duration: 200,
        maxZoom: 1.5,
        minZoom: 0.4,
        padding: 0.1,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [flow, nodes, nodesInitialized]);

  return null;
}

export function ActionsWorkflowGraph({
  jobs,
  workflowFile,
}: {
  jobs: GithubActionsJobPayload[];
  workflowFile?: { content: string; path: string };
}) {
  const t = useTranslations("github.actionsDetail");
  const { edges, nodes } = React.useMemo(
    () =>
      workflowFile
        ? layoutNodes(parseWorkflowJobs(workflowFile.content), jobs)
        : { edges: [], nodes: [] },
    [jobs, workflowFile],
  );
  if (!workflowFile || nodes.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h4 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        {t("sections.workflow")}
      </h4>
      <div className="h-80 overflow-hidden rounded-xl border bg-muted/10">
        <ReactFlow
          className="actions-workflow-flow"
          edges={edges}
          maxZoom={1.5}
          minZoom={0.4}
          nodes={nodes}
          nodeTypes={nodeTypes}
          nodesConnectable={false}
          nodesDraggable={false}
          nodesFocusable={false}
          panOnDrag={[0, 1, 2]}
          proOptions={{ hideAttribution: true }}
          zoomOnDoubleClick={false}
        >
          <WorkflowViewportFitter nodes={nodes} />
          <Background color="var(--border)" gap={20} size={1} />
          <Controls
            className="actions-workflow-controls"
            position="bottom-right"
            showInteractive={false}
          />
        </ReactFlow>
      </div>
    </section>
  );
}
