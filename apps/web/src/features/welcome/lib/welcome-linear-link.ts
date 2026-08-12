import type { LinearIssuePayload } from "@atmos/api-types/ws/dto/linear";
import type { TaskWorkspaceLinearDraft } from "@/features/task/store/task-workspace-draft-store";

/** Non-done Linear workflow types for the welcome picker. */
export const LINEAR_OPEN_STATE_TYPES = ["backlog", "unstarted", "started"] as const;

/** Page size for welcome Advanced select lists (GitHub + Linear). */
export const WELCOME_LINK_LIST_PAGE = 50;

export function linearIssueToDraft(
  issue: LinearIssuePayload,
): TaskWorkspaceLinearDraft {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    description: issue.description ?? null,
    priority: issue.priority ?? 0,
    state_name: issue.state_name ?? null,
    state_type: issue.state_type ?? null,
    project_name: issue.project_name ?? null,
    project_id: issue.project_id ?? null,
    team_id: issue.team_id ?? null,
    team_key: issue.team_key ?? null,
    labels: issue.labels ?? [],
    assignee: issue.assignee ?? null,
    github_refs: issue.github_refs ?? [],
    created_at: issue.created_at ?? null,
    updated_at: issue.updated_at ?? null,
  };
}
