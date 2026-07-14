'use client';

import { useProjectBootstrapQuery } from '@/features/project/hooks/use-project-bootstrap-query';

/** True only on the first load when project list is still empty. */
export function useInitialProjectsLoading(): boolean {
  const query = useProjectBootstrapQuery();
  return query.isPending && !query.data;
}
