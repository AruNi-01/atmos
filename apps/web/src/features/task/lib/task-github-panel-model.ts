/** Pure helpers and constants for the Task GitHub list panel. */

import type { TaskGithubFilters, TaskGithubStateFilter } from "@/features/task/components/TaskGithubFilterMenu";
import type { TaskGithubSortParam } from "@/shared/lib/nuqs/searchParams";

export const TASK_GITHUB_PAGE_SIZE = 20;

export type TaskGithubKind = "issues" | "prs";

/** GitHub.com PR/Issue list sort menu (same labels/order). */
export const TASK_GITHUB_SORT_OPTIONS: TaskGithubSortParam[] = [
  "created-desc",
  "created-asc",
  "comments-desc",
  "comments-asc",
  "updated-desc",
  "updated-asc",
  "best-match",
];

export function filtersFromUrl(params: {
  taskGhState: TaskGithubStateFilter;
  taskGhRepos: string[];
  taskGhAssignees: string[];
  taskGhLabels: string[];
}): TaskGithubFilters {
  return {
    state: params.taskGhState,
    repoFullNames: params.taskGhRepos,
    assignees: params.taskGhAssignees,
    labels: params.taskGhLabels,
  };
}
