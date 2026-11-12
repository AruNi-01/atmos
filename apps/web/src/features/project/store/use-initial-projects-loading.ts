"use client";

import { useProjectBootstrapQuery } from "@/features/project/hooks/use-project-bootstrap-query";

/** True only on the first load when project list is still empty. */
export function useInitialProjectsLoading(enabled = true): boolean {
  const query = useProjectBootstrapQuery({ enabled });
  return enabled && query.isPending && !query.data;
}
