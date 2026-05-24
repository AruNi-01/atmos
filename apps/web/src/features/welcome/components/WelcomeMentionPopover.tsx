"use client";

import React from "react";
import { createPortal } from "react-dom";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  getFileIconProps,
} from "@workspace/ui";
import {
  CircleDot,
  Files,
  GitPullRequestArrow,
  Github,
  Loader2,
} from "lucide-react";
import type { GithubIssuePayload, GithubPrPayload } from "@/api/ws-api";
import type { MentionFileCandidate } from "@/features/welcome/lib/welcome-page-helpers";

export type MentionPopoverState = {
  top: number;
  left: number;
  atOffset: number;
  query: string;
} | null;

export type MentionNavItem =
  | { type: "issue"; issue: GithubIssuePayload }
  | { type: "pr"; pr: GithubPrPayload }
  | { type: "file"; file: MentionFileCandidate };

export function WelcomeMentionPopover({
  activeIndex,
  issuePreview,
  isLoading,
  listRef,
  mentionFiles,
  onClose,
  onSelectFile,
  onSelectNavItem,
  onSetItemRef,
  popover,
  prPreview,
}: {
  activeIndex: number;
  issuePreview: GithubIssuePayload | null;
  isLoading: boolean;
  listRef: React.RefObject<HTMLDivElement | null>;
  mentionFiles: MentionFileCandidate[];
  onClose: () => void;
  onSelectFile: (item: MentionFileCandidate) => void;
  onSelectNavItem: (item: MentionNavItem) => void;
  onSetItemRef: (index: number, element: HTMLButtonElement | null) => void;
  popover: MentionPopoverState;
  prPreview: GithubPrPayload | null;
}) {
  if (!popover || typeof document === "undefined") return null;

  const issueIndex = issuePreview ? 0 : -1;
  const prIndex = prPreview ? (issuePreview ? 1 : 0) : -1;
  const githubCount = (issuePreview ? 1 : 0) + (prPreview ? 1 : 0);

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[2147483646]"
        onMouseDown={onClose}
      />
      <div
        ref={listRef}
        className="fixed z-[2147483647] max-h-80 w-[min(90vw,460px)] overflow-y-auto rounded-md border border-border/70 bg-popover p-1 text-sm text-popover-foreground shadow-md"
        style={{
          top: popover.top,
          left: popover.left,
        }}
      >
        <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground">
          <Github className="size-3" />
          <span>GitHub</span>
        </div>
        {issuePreview ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                ref={(element) => {
                  onSetItemRef(issueIndex, element);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left hover:bg-muted",
                  issueIndex === activeIndex && "bg-muted",
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelectNavItem({ type: "issue", issue: issuePreview });
                }}
              >
                <CircleDot className="size-4 text-muted-foreground" />
                <span className="font-mono text-xs text-muted-foreground">
                  #{issuePreview.number}
                </span>
                <span className="truncate">{issuePreview.title}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              align="end"
              className="z-[2147483647] max-w-xs whitespace-normal break-words"
            >
              #{issuePreview.number} {issuePreview.title}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {prPreview ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                ref={(element) => {
                  onSetItemRef(prIndex, element);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left hover:bg-muted",
                  prIndex === activeIndex && "bg-muted",
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelectNavItem({ type: "pr", pr: prPreview });
                }}
              >
                <GitPullRequestArrow className="size-4 text-muted-foreground" />
                <span className="font-mono text-xs text-muted-foreground">
                  #{prPreview.number}
                </span>
                <span className="truncate">{prPreview.title}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              align="end"
              className="z-[2147483647] max-w-xs whitespace-normal break-words"
            >
              #{prPreview.number} {prPreview.title}
            </TooltipContent>
          </Tooltip>
        ) : null}
        <div className="my-1 h-px bg-border/60" />
        <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground">
          <Files className="size-3" />
          <span>Files</span>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Searching files...
          </div>
        ) : mentionFiles.length > 0 ? (
          mentionFiles.map((item, index) => {
            const iconProps = getFileIconProps({
              name: item.name,
              isDir: item.isDir,
              className: "size-4",
            });
            const navIndex = githubCount + index;
            return (
              <Tooltip key={item.relativePath}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    ref={(element) => {
                      onSetItemRef(navIndex, element);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left hover:bg-muted",
                      item.isHidden && "text-muted-foreground",
                      navIndex === activeIndex && "bg-muted",
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onSelectFile(item);
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- file icons are tiny decorative SVG/data assets from the UI package. */}
                    <img {...iconProps} alt="" />
                    <span className="min-w-0 flex-1 truncate">
                      {item.name}
                    </span>
                    <span className="ml-2 max-w-[55%] shrink truncate text-right text-[11px] text-muted-foreground">
                      {item.relativePath}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  align="end"
                  className="z-[2147483647] max-w-xs whitespace-normal break-words"
                >
                  {item.relativePath}
                </TooltipContent>
              </Tooltip>
            );
          })
        ) : (
          <div className="px-2.5 py-2 text-xs text-muted-foreground">
            Continue typing after @ to search files
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
