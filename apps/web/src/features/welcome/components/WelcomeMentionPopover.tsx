"use client";

import React from "react";
import { useTranslations } from "next-intl";
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
import {
  isImmediateMentionListingQuery,
  splitHighlightParts,
} from "@/features/welcome/lib/mention-file-search";
import type { MentionFileCandidate } from "@/features/welcome/lib/welcome-page-helpers";

export type MentionPopoverState = {
  top?: number;
  bottom?: number;
  left: number;
  atOffset: number;
  query: string;
} | null;

export type MentionNavItem =
  | { type: "issue"; issue: GithubIssuePayload }
  | { type: "pr"; pr: GithubPrPayload }
  | { type: "file"; file: MentionFileCandidate };

function MentionHighlightText({
  text,
  query,
  className,
}: {
  text: string;
  query: string;
  className?: string;
}) {
  const parts = splitHighlightParts(text, query);
  return (
    <span className={className}>
      {parts.map((part, index) =>
        part.match ? (
          <mark
            key={`${part.text}-${index}`}
            className="rounded-sm bg-primary/20 px-0.5 text-foreground"
          >
            {part.text}
          </mark>
        ) : (
          <React.Fragment key={`${part.text}-${index}`}>{part.text}</React.Fragment>
        ),
      )}
    </span>
  );
}

/** Name segment after the last `/` — what name-only search actually matches. */
function mentionNameHighlightQuery(rawQuery: string): string {
  const query = rawQuery.trim().replace(/\\/g, "/");
  const slashIndex = query.lastIndexOf("/");
  if (slashIndex < 0) return query;
  return query.slice(slashIndex + 1).trim();
}

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
  const t = useTranslations("Welcome.components");
  if (!popover || typeof document === "undefined") return null;

  const issueIndex = issuePreview ? 0 : -1;
  const prIndex = prPreview ? (issuePreview ? 1 : 0) : -1;
  const githubCount = (issuePreview ? 1 : 0) + (prPreview ? 1 : 0);
  const nameHighlightQuery = mentionNameHighlightQuery(popover.query);

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[2147483646]"
        onMouseDown={onClose}
      />
      <div
        ref={listRef}
        className="fixed z-[2147483647] max-h-80 w-[min(90vw,460px)] space-y-0.5 overflow-y-auto rounded-md border border-border/70 bg-popover p-1 text-sm text-popover-foreground shadow-md"
        style={{
          top: popover.top,
          bottom: popover.bottom,
          left: popover.left,
        }}
      >
        {githubCount > 0 ? (
          <>
            <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground">
              <Github className="size-3" />
              <span>{t("mentionPopover.github")}</span>
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
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-muted",
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
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-muted",
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
          </>
        ) : null}
        <div className={cn("flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground", githubCount > 0 && "mt-1.5")}>
          <Files className="size-3" />
          <span>{t("mentionPopover.files")}</span>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {t("mentionPopover.searchingFiles")}
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
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-muted",
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
                    <MentionHighlightText
                      text={item.name}
                      query={nameHighlightQuery}
                      className="min-w-0 flex-1 truncate"
                    />
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
            {isImmediateMentionListingQuery(popover.query)
              ? t("mentionPopover.noFiles")
              : t("mentionPopover.noMatches")}
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
