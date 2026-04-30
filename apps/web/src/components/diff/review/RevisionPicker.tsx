"use client";

import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { compareReviewTimestamps } from "@/components/diff/review/utils";
import type { ReviewSessionDto } from "@/api/ws-api";

interface RevisionPickerProps {
  revisions: ReviewSessionDto["revisions"];
  selectedGuid: string | null;
  onSelect: (guid: string) => void;
}

export const RevisionPicker: React.FC<RevisionPickerProps> = ({
  revisions,
  selectedGuid,
  onSelect,
}) => {
  const sorted = [...revisions].sort((a, b) =>
    compareReviewTimestamps(a.created_at, b.created_at),
  );
  const selectedIndex = sorted.findIndex((rev) => rev.guid === selectedGuid);
  const label = selectedIndex >= 0 ? `v${selectedIndex + 1}` : "v1";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1 rounded-md border border-sidebar-border px-2 py-1 text-xs",
            "bg-background text-foreground hover:bg-sidebar-accent transition-colors cursor-pointer",
          )}
        >
          <span>{label}</span>
          <ChevronDown className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[8rem]">
        {sorted.map((rev, idx) => {
          const isActive = rev.guid === selectedGuid;
          return (
            <DropdownMenuItem
              key={rev.guid}
              onClick={() => onSelect(rev.guid)}
              className="flex items-center gap-2 text-xs"
            >
              <span className="flex-1">{rev.title || `v${idx + 1}`}</span>
              {isActive && <Check className="size-3.5 text-foreground" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
