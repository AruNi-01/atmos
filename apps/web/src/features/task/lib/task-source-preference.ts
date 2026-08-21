/**
 * Persist last-selected Task source tab (Atmos / GitHub / Linear).
 * URL `?taskSource=` still wins for deep links; storage covers plain `/tasks` navigations.
 */

import { globalKey, readJson, writeJson } from "@/shared/lib/browser-store";
import type { TaskSourceTab } from "@/shared/lib/nuqs/searchParams";

const TASK_SOURCE_STORAGE_KEY = globalKey("taskSource");

function isTaskSourceTab(value: unknown): value is TaskSourceTab {
  return value === "atmos" || value === "github" || value === "linear";
}

export function readStoredTaskSource(): TaskSourceTab | null {
  const stored = readJson<unknown>(TASK_SOURCE_STORAGE_KEY, null);
  return isTaskSourceTab(stored) ? stored : null;
}

export function writeStoredTaskSource(value: TaskSourceTab): void {
  writeJson(TASK_SOURCE_STORAGE_KEY, value);
}

/** Path for navigating to Tasks with the last source tab restored in the URL. */
export function tasksPathWithStoredSource(): string {
  const stored = readStoredTaskSource();
  if (stored && stored !== "atmos") {
    return `/tasks?taskSource=${encodeURIComponent(stored)}`;
  }
  return "/tasks";
}
