"use client";

import React from "react";
import { useTranslations, useLocale } from "next-intl";
import dynamic from "next/dynamic";
import { Loader2, GitCommit, Copy, Check } from "lucide-react";
import { Github } from "@workspace/ui/components/icons/lucide-brand-icons";
import { formatDistanceToNow, fromUnixTime } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  cn,
  drawerCloseReserveClass,
  ScrollArea,
  useDrawerCloseReserve,
} from "@workspace/ui";
import { useGithubCommitDetail } from "@/features/github/hooks/use-github";
import type { PrFile } from "@/features/github/hooks/use-github";
import { useLocalCommitView } from "@/features/git/hooks/use-local-commit-view";
import { resolveCommitDiffFocusFile } from "@/features/git/lib/commit-diff-focus-file";
import { PRFilesTab } from "@/features/github/components/PRFilesTab";
import { usePrContextHeader } from "@/features/github/components/use-pr-context-header";

const MarkdownRenderer = dynamic(
  () => import("@/shared/components/markdown/MarkdownRenderer").then((m) => m.MarkdownRenderer),
  { ssr: false },
);

export interface GitCommitDiffViewProps {
  sha: string;
  subject: string;
  authorName: string;
  active: boolean;
  onRequestClose: () => void;
  repoPath?: string | null;
  timestamp?: number | null;
  owner?: string | null;
  repo?: string | null;
  focusFilePath?: string | null;
}

export function GitCommitDiffView({
  sha,
  subject,
  authorName,
  active,
  onRequestClose: _onRequestClose,
  repoPath,
  timestamp,
  owner,
  repo,
  focusFilePath,
}: GitCommitDiffViewProps) {
  const t = useTranslations("git.commitDiff");
  const locale = useLocale();
  const reserveClose = useDrawerCloseReserve();
  const dateLocale = locale.startsWith("zh") ? zhCN : enUS;
  const [copied, setCopied] = React.useState(false);
  const ownerName = owner?.trim() ?? "";
  const repoName = repo?.trim() ?? "";

  const {
    handleFilesCodeViewTopBoundaryWheel,
    mainScrollRef,
    resetPrContext,
  } = usePrContextHeader();
  const titleRef = React.useRef<HTMLDivElement | null>(null);
  const handleFilesTabWheelCapture = React.useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (event.deltaY <= 8) return;
      const scrollRoot = mainScrollRef.current;
      const titleHeight = titleRef.current?.offsetHeight ?? 0;
      if (!scrollRoot || titleHeight <= 0) return;
      if (scrollRoot.scrollTop >= titleHeight) return;
      scrollRoot.scrollTop = Math.min(
        titleHeight,
        scrollRoot.scrollTop + event.deltaY,
      );
      event.preventDefault();
      event.stopPropagation();
    },
    [mainScrollRef],
  );

  React.useEffect(() => {
    resetPrContext();
  }, [sha, resetPrContext]);

  const useLocal = Boolean(repoPath);
  const githubQuery = useGithubCommitDetail(
    ownerName,
    repoName,
    active && !useLocal ? sha : undefined,
    active && !useLocal && Boolean(ownerName && repoName),
  );
  const localQuery = useLocalCommitView(repoPath, sha, active && useLocal);

  const detail = githubQuery.data;
  const commit = detail?.commit;
  const author = detail?.author;
  const files: PrFile[] = React.useMemo(() => {
    if (useLocal) return localQuery.data?.files ?? [];
    return Array.isArray(detail?.files) ? (detail.files as PrFile[]) : [];
  }, [detail, localQuery.data?.files, useLocal]);

  const loading = useLocal ? localQuery.isLoading : githubQuery.loading;
  const hasData = useLocal ? Boolean(localQuery.data) : Boolean(detail);

  const commitDate = React.useMemo(() => {
    if (typeof timestamp === "number" && timestamp > 0) {
      return fromUnixTime(timestamp);
    }
    const dateStr = commit?.author?.date ?? commit?.committer?.date;
    return dateStr ? new Date(dateStr) : null;
  }, [commit, timestamp]);

  const fullMessage = useLocal
    ? [subject, localQuery.data?.body].filter(Boolean).join("\n\n")
    : (commit?.message ?? subject);
  const messageParts = React.useMemo(() => {
    const idx = fullMessage.indexOf("\n\n");
    if (idx < 0) return { headline: fullMessage, body: "" };
    return { headline: fullMessage.slice(0, idx), body: fullMessage.slice(idx + 2) };
  }, [fullMessage]);

  const githubUrl =
    ownerName && repoName
      ? `https://github.com/${ownerName}/${repoName}/commit/${sha}`
      : null;
  const totalAdditions = useLocal
    ? (localQuery.data?.insertions ?? files.reduce((sum, f) => sum + (f.additions ?? 0), 0))
    : files.reduce((sum, f) => sum + (f.additions ?? 0), 0);
  const totalDeletions = useLocal
    ? (localQuery.data?.deletions ?? files.reduce((sum, f) => sum + (f.deletions ?? 0), 0))
    : files.reduce((sum, f) => sum + (f.deletions ?? 0), 0);
  const resolvedFocusFile = React.useMemo(
    () => resolveCommitDiffFocusFile(files, focusFilePath),
    [files, focusFilePath],
  );

  React.useEffect(() => {
    if (!resolvedFocusFile || loading) return;
    const scrollRoot = mainScrollRef.current;
    const titleHeight = titleRef.current?.offsetHeight ?? 0;
    if (!scrollRoot || titleHeight <= 0) return;
    scrollRoot.scrollTop = titleHeight;
  }, [loading, mainScrollRef, resolvedFocusFile]);

  const handleCopyHash = () => {
    navigator.clipboard.writeText(sha).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (loading && !hasData) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-6 animate-spin opacity-50" />
          <span className="text-xs">{t("loading")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <ScrollArea
        scrollFade
        className="min-h-0 flex-1"
        viewportRef={mainScrollRef}
        viewportProps={{
          onWheelCapture: handleFilesTabWheelCapture,
        }}
      >
        <div
          ref={titleRef}
          className={cn(reserveClose && drawerCloseReserveClass)}
        >
          <div className="flex min-w-0 items-center gap-2 py-2.5 pl-4 pr-4">
            <GitCommit className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {messageParts.headline}
            </span>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={handleCopyHash}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-muted"
              >
                {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
                {sha.substring(0, 7)}
              </button>
              {githubUrl ? (
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Github className="size-3.5" />
                </a>
              ) : null}
            </div>
          </div>

          <div className="px-4 py-3">
            <div className="flex items-start gap-3">
              <Avatar className="size-8 border border-border/50 shrink-0">
                {author?.avatar_url && (
                  <AvatarImage src={author.avatar_url} alt={authorName} />
                )}
                <AvatarFallback className="text-[10px]">
                  {authorName.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-foreground/90">
                    {author?.login ?? commit?.author?.name ?? authorName}
                  </span>
                  {commitDate && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(commitDate, { addSuffix: true, locale: dateLocale })}
                      </span>
                    </>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-mono">{sha.substring(0, 7)}</span>
                  {ownerName && repoName ? (
                    <span className="text-muted-foreground/60">
                      {ownerName}/{repoName}
                    </span>
                  ) : null}
                  <span className="flex items-center gap-1">
                    <span className="text-emerald-600">{totalAdditions}+</span>
                    <span className="text-red-600">{totalDeletions}-</span>
                    <span className="text-muted-foreground/60">
                      {t("filesChanged", { count: files.length })}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {messageParts.body && (
              <div className="mt-3">
                <MarkdownRenderer className="prose prose-sm max-w-none text-sm dark:prose-invert prose-p:my-1.5 prose-headings:my-2 prose-li:my-0.5">
                  {messageParts.body}
                </MarkdownRenderer>
              </div>
            )}
          </div>
        </div>

        <div
          className={cn(
            "sticky top-0 z-10 min-h-[520px] overflow-hidden bg-background px-4 pb-4 pt-2",
            reserveClose && drawerCloseReserveClass,
          )}
          style={{ height: "100%" }}
        >
          <PRFilesTab
            files={files}
            loading={loading}
            owner={ownerName}
            repo={repoName}
            title={messageParts.headline}
            url={githubUrl}
            focusFilePath={resolvedFocusFile}
            onCodeViewTopBoundaryWheel={handleFilesCodeViewTopBoundaryWheel}
          />
        </div>
      </ScrollArea>
    </div>
  );
}
