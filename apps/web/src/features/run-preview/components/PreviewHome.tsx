"use client";

import { cn } from "@workspace/ui";

import { LocalServicesPreviewPanel } from "@/features/local-services/components/LocalServicesPreviewPanel";

interface PreviewHomeProps {
  projectId?: string | null;
  workspaceId?: string | null;
  shouldStackPreviewHomeCards: boolean;
  onOpenUrl: (url: string) => void;
}

export function PreviewHome({
  projectId,
  workspaceId,
  shouldStackPreviewHomeCards,
  onOpenUrl,
}: PreviewHomeProps) {
  return (
    <div className="flex h-full w-full items-start justify-center overflow-y-auto px-4 py-8 sm:px-6 sm:py-10">
      <div className="w-full max-w-4xl">
        <div className="space-y-2">
          <div
            className={cn(
              "font-semibold tracking-tight text-foreground",
              shouldStackPreviewHomeCards ? "text-2xl" : "text-3xl sm:text-4xl",
            )}
          >
            Preview
          </div>
          <p
            className={cn(
              "max-w-2xl leading-relaxed text-muted-foreground",
              shouldStackPreviewHomeCards ? "text-sm" : "text-base",
            )}
          >
            Open a local service for this Project or Workspace, or enter a URL above.
          </p>
        </div>

        <LocalServicesPreviewPanel
          projectId={projectId}
          workspaceId={workspaceId}
          onOpenUrl={onOpenUrl}
        />
      </div>
    </div>
  );
}
