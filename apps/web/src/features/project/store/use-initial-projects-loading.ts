'use client';

import { useProjectStore } from '@/features/project/store/use-project-store';

/** True only on the first load when project list is still empty. */
export function useInitialProjectsLoading(): boolean {
  const isLoading = useProjectStore((s) => s.isLoading);
  const projects = useProjectStore((s) => s.projects);
  return isLoading && projects.length === 0;
}
