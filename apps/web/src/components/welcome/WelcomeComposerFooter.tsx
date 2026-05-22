"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui";
import {
  Eye,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequestArrow,
  Github,
  Sparkles,
} from "lucide-react";
import type { ComposerAttachment } from "@/components/welcome/AttachmentBar";
import { SlashCommandPopover } from "@/components/welcome/SlashCommandPopover";
import { WelcomeAdvancedOptions } from "@/components/welcome/WelcomeAdvancedOptions";
import { WelcomeMentionPopover } from "@/components/welcome/WelcomeMentionPopover";

type SummaryItem = {
  key:
    | "display-name"
    | "base-branch"
    | "workspace-branch"
    | "github-issue"
    | "github-pr"
    | "auto-todos";
  value: string;
  title: string;
};

function SummaryIcon({ type }: { type: SummaryItem["key"] }) {
  switch (type) {
    case "display-name":
      return <Eye className="size-3 shrink-0" />;
    case "base-branch":
      return <GitBranch className="size-3 shrink-0" />;
    case "workspace-branch":
      return <GitCommitHorizontal className="size-3 shrink-0" />;
    case "github-issue":
      return <Github className="size-3 shrink-0" />;
    case "github-pr":
      return <GitPullRequestArrow className="size-3 shrink-0" />;
    case "auto-todos":
      return <Sparkles className="size-3 shrink-0" />;
  }
}

export function WelcomeComposerFooter({
  advancedOptionsProps,
  mentionPopoverProps,
  previewAttachment,
  slashPopoverProps,
  summaryItems,
  onPreviewAttachmentClose,
}: {
  advancedOptionsProps: React.ComponentProps<typeof WelcomeAdvancedOptions>;
  mentionPopoverProps: React.ComponentProps<typeof WelcomeMentionPopover>;
  previewAttachment: ComposerAttachment | null;
  slashPopoverProps: React.ComponentProps<typeof SlashCommandPopover>;
  summaryItems: SummaryItem[];
  onPreviewAttachmentClose: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <WelcomeAdvancedOptions {...advancedOptionsProps} />
        <WelcomeMentionPopover {...mentionPopoverProps} />
        <SlashCommandPopover {...slashPopoverProps} />

        {previewAttachment && typeof document !== "undefined"
          ? createPortal(
              <div
                className="fixed inset-0 z-[2147483647] flex cursor-zoom-out items-center justify-center bg-black/80 backdrop-blur-sm"
                onClick={onPreviewAttachmentClose}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- previews use local object URLs and must not go through Next image optimization. */}
                <img
                  src={previewAttachment.objectUrl}
                  alt={previewAttachment.filename}
                  className="max-h-[92vh] max-w-[92vw] rounded-md object-contain shadow-2xl"
                />
              </div>,
              document.body,
            )
          : null}

        {summaryItems.length > 0 ? (
          <div className="scrollbar-on-hover flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap pr-1">
            {summaryItems.map((item) => (
              <Tooltip key={item.key}>
                <TooltipTrigger asChild>
                  <span className="inline-flex h-6 max-w-[9rem] cursor-default items-center gap-1.5 rounded-md border border-border/70 bg-muted/35 px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted">
                    <SummaryIcon type={item.key} />
                    <span className="truncate">{item.value}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">{item.title}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
