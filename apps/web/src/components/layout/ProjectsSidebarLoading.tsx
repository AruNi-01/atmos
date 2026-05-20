'use client';

import { Skeleton } from '@workspace/ui';

export function ProjectsSidebarLoading() {
  return (
    <div className="space-y-2 px-2 py-2" aria-busy="true" aria-label="Loading projects">
      {[0, 1, 2].map((key) => (
        <div key={key} className="rounded-lg border border-sidebar-border/60 px-2 py-2">
          <div className="flex items-center gap-2">
            <Skeleton className="size-4 rounded-sm" />
            <Skeleton className="h-4 flex-1 max-w-[140px]" />
          </div>
          <div className="mt-2 space-y-1.5 pl-6">
            <Skeleton className="h-3 w-[85%]" />
            <Skeleton className="h-3 w-[70%]" />
          </div>
        </div>
      ))}
    </div>
  );
}
