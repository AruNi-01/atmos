"use client";

import React, { useCallback } from "react";
import { Button } from "@workspace/ui";
import { ClipboardCheck, ExternalLink, Sparkles } from "lucide-react";
import { useQueryStates } from "nuqs";
import { parseAsString } from "nuqs";
import { rightSidebarParams } from "@/lib/nuqs/searchParams";
import { useSidebarLayout } from "@/components/layout/SidebarLayoutContext";
import type { AtmosReviewMetadata } from "@/lib/review-report-frontmatter";

interface ReviewReportMetadataCardProps {
  metadata: AtmosReviewMetadata;
}

/**
 * Rendered above the markdown body of an Atmos review report. Shows session / run /
 * revision / skill identifiers and a single action to reopen the originating session
 * in the right sidebar's Review tab (by setting `rsTab`, `reviewSession`, `reviewRevision`
 * and expanding the sidebar).
 */
export const ReviewReportMetadataCard: React.FC<ReviewReportMetadataCardProps> = ({
  metadata,
}) => {
  const { setIsRightCollapsed, setShowRightSidebar } = useSidebarLayout();
  const [, setSidebarParams] = useQueryStates({
    rsTab: rightSidebarParams.rsTab,
    reviewSession: parseAsString,
    reviewRevision: parseAsString,
  });

  const handleOpenSession = useCallback(() => {
    void setSidebarParams({
      rsTab: "review",
      reviewSession: metadata.session_guid,
      reviewRevision: metadata.current_revision_guid,
    });
    setShowRightSidebar(true);
    setIsRightCollapsed(false);
  }, [
    metadata.session_guid,
    metadata.current_revision_guid,
    setSidebarParams,
    setShowRightSidebar,
    setIsRightCollapsed,
  ]);

  const generatedAtDisplay = formatGeneratedAt(metadata.generated_at);

  return (
    <div className="mb-6 rounded-lg border border-border/60 bg-muted/40 px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="mt-0.5 shrink-0 rounded-md bg-primary/10 p-1.5 text-primary">
            <ClipboardCheck className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              Atmos Review Report
              {generatedAtDisplay ? (
                <span className="text-[10px] font-normal text-muted-foreground">
                  · {generatedAtDisplay}
                </span>
              ) : null}
            </div>
            <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground sm:grid-cols-2">
              <MetadataRow label="Session" value={metadata.session_guid} />
              <MetadataRow label="Run" value={metadata.run_guid} />
              <MetadataRow
                label="Revision"
                value={metadata.current_revision_guid}
                suffix={
                  metadata.base_revision_guid &&
                  metadata.base_revision_guid !== metadata.current_revision_guid
                    ? `← ${shortGuid(metadata.base_revision_guid)}`
                    : null
                }
              />
              <MetadataRow
                label="Skill"
                value={metadata.skill_id}
                icon={<Sparkles className="size-3" />}
              />
            </div>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 gap-1.5 text-[11px]"
          onClick={handleOpenSession}
          title="Open this session in the right sidebar"
        >
          <ExternalLink className="size-3" />
          Open in Review Sidebar
        </Button>
      </div>
    </div>
  );
};

interface MetadataRowProps {
  label: string;
  value: string;
  suffix?: React.ReactNode;
  icon?: React.ReactNode;
}

function MetadataRow({ label, value, suffix, icon }: MetadataRowProps) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="w-16 shrink-0 text-muted-foreground/70">{label}</span>
      {icon ? <span className="shrink-0 text-muted-foreground/70">{icon}</span> : null}
      <code
        className="truncate font-mono text-[10.5px] text-foreground/80"
        title={value}
      >
        {shortGuid(value)}
      </code>
      {suffix ? (
        <span className="shrink-0 text-[10px] text-muted-foreground/60">{suffix}</span>
      ) : null}
    </div>
  );
}

function shortGuid(value: string): string {
  // GUIDs are long and repetitive in UI; keep the first 8 + last 4 so the card stays compact
  // without losing enough context for the user to spot-check the value.
  if (!value.includes("-") || value.length <= 16) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function formatGeneratedAt(raw: string): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  // Local date + HH:MM — matches other timestamps in the app.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
