"use client";

import { cn } from "@workspace/ui";
import { ProjectLogoMark } from "@/features/project/components/ProjectLogoMark";
import { useProjectLogoUrl } from "@/features/project/hooks/use-project-logo-url";
import type { Project } from "@/shared/types/domain";

export function ProjectGlyph({
  project,
  className,
}: {
  project: Pick<Project, "name" | "logoPath" | "borderColor">;
  className?: string;
}) {
  const { logoUrl, hasLogoLoadError, onLogoError } = useProjectLogoUrl(project.logoPath);
  const initialLetter = project.name.charAt(0).toUpperCase() || "?";
  return (
    <div
      className={cn(
        "flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-[9px] font-bold text-muted-foreground",
        className,
      )}
      style={{
        borderLeft: project.borderColor ? `2px solid ${project.borderColor}` : undefined,
      }}
    >
      {logoUrl && !hasLogoLoadError ? (
        <ProjectLogoMark src={logoUrl} onError={onLogoError} />
      ) : (
        <span>{initialLetter}</span>
      )}
    </div>
  );
}
