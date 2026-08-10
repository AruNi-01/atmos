/**
 * Map GitHub / Linear issue metadata onto Atmos workspace fields
 * (priority, workflow status, labels) for New Workspace prefills.
 */

import type { GithubIssuePayload, GithubPrPayload } from "@/api/ws-api";
import type { LinearIssuePayload } from "@atmos/api-types/ws/dto/linear";
import type {
  WorkspaceLabel,
  WorkspacePriority,
  WorkspaceWorkflowStatus,
} from "@/shared/types/domain";

export type ExternalLabelInput = {
  name: string;
  color?: string | null;
};

/** Linear: 0 none · 1 urgent · 2 high · 3 medium · 4 low */
export function mapLinearPriority(priority: number | null | undefined): WorkspacePriority {
  switch (priority) {
    case 1:
      return "urgent";
    case 2:
      return "high";
    case 3:
      return "medium";
    case 4:
      return "low";
    default:
      return "no_priority";
  }
}

/**
 * Linear workflow state_type (+ optional state_name for In Review).
 * Unknown → in_progress default for open work.
 */
export function mapLinearWorkflowStatus(
  stateType: string | null | undefined,
  stateName?: string | null,
): WorkspaceWorkflowStatus {
  const type = (stateType ?? "").toLowerCase();
  const name = (stateName ?? "").toLowerCase();

  if (type === "completed" || name === "done") return "completed";
  if (type === "canceled" || name.includes("cancel") || name.includes("duplicate")) {
    return "canceled";
  }
  if (type === "backlog") return "backlog";
  if (type === "unstarted") return "todo";
  if (type === "started") {
    if (name.includes("review")) return "in_review";
    if (name.includes("block")) return "blocked";
    return "in_progress";
  }
  if (name.includes("progress")) return "in_progress";
  if (name.includes("review")) return "in_review";
  if (name.includes("todo") || name.includes("triage")) return "todo";
  return "in_progress";
}

/** GitHub issues have no native priority → default. */
export function mapGithubIssuePriority(
  _issue: GithubIssuePayload | null | undefined,
): WorkspacePriority {
  return "no_priority";
}

export function mapGithubIssueWorkflowStatus(
  issue: GithubIssuePayload | null | undefined,
): WorkspaceWorkflowStatus {
  const state = (issue?.state ?? "").toLowerCase();
  if (state === "closed") return "completed";
  // open
  return "todo";
}

export function mapGithubPrWorkflowStatus(
  pr: GithubPrPayload | null | undefined,
): WorkspaceWorkflowStatus {
  if (!pr) return "in_progress";
  const state = (pr.state ?? "").toLowerCase();
  if (state === "merged") return "completed";
  if (state === "closed") return "canceled";
  if (pr.is_draft) return "todo";
  return "in_progress";
}

export function mapGithubPrPriority(
  _pr: GithubPrPayload | null | undefined,
): WorkspacePriority {
  return "no_priority";
}

export function normalizeLabelColor(color?: string | null): string {
  const raw = color?.trim() ?? "";
  if (!raw) return "#94a3b8";
  return raw.startsWith("#") ? raw : `#${raw}`;
}

/**
 * Resolve external labels against Atmos workspace labels:
 * - match by name (case-insensitive), any source
 * - create missing labels then select
 */
export async function ensureWorkspaceLabelsForExternal(
  external: ExternalLabelInput[],
  existing: WorkspaceLabel[],
  createLabel: (input: {
    name: string;
    color: string;
    source?: "manual" | "gitHub_issue" | "gitHub_pr";
  }) => Promise<WorkspaceLabel>,
  source: "manual" | "gitHub_issue" | "gitHub_pr" = "manual",
): Promise<WorkspaceLabel[]> {
  const selected: WorkspaceLabel[] = [];
  const known = [...existing];

  for (const ext of external) {
    const name = ext.name?.trim();
    if (!name) continue;

    const lower = name.toLowerCase();
    let found =
      known.find((l) => l.name.toLowerCase() === lower) ??
      selected.find((l) => l.name.toLowerCase() === lower);

    if (!found) {
      try {
        found = await createLabel({
          name,
          color: normalizeLabelColor(ext.color),
          source,
        });
        known.push(found);
      } catch {
        // Skip failed creates; continue with the rest.
        continue;
      }
    }

    if (!selected.some((l) => l.id === found!.id)) {
      selected.push(found);
    }
  }

  return selected;
}

export function linearIssueMeta(issue: LinearIssuePayload): {
  priority: WorkspacePriority;
  workflowStatus: WorkspaceWorkflowStatus;
  labels: ExternalLabelInput[];
} {
  return {
    priority: mapLinearPriority(issue.priority),
    workflowStatus: mapLinearWorkflowStatus(issue.state_type, issue.state_name),
    labels: (issue.labels ?? []).map((l) => ({
      name: l.name,
      color: l.color,
    })),
  };
}

export function githubIssueMeta(issue: GithubIssuePayload): {
  priority: WorkspacePriority;
  workflowStatus: WorkspaceWorkflowStatus;
  labels: ExternalLabelInput[];
} {
  return {
    priority: mapGithubIssuePriority(issue),
    workflowStatus: mapGithubIssueWorkflowStatus(issue),
    labels: (issue.labels ?? []).map((l) => ({
      name: l.name,
      color: l.color,
    })),
  };
}

export function githubPrMeta(pr: GithubPrPayload): {
  priority: WorkspacePriority;
  workflowStatus: WorkspaceWorkflowStatus;
  labels: ExternalLabelInput[];
} {
  return {
    priority: mapGithubPrPriority(pr),
    workflowStatus: mapGithubPrWorkflowStatus(pr),
    labels: (pr.labels ?? []).map((l) => ({
      name: l.name,
      color: l.color,
    })),
  };
}
