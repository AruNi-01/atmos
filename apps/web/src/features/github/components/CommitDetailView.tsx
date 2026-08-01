"use client";

import React from "react";
import { useTranslations, useLocale } from "next-intl";
import dynamic from "next/dynamic";
import { Loader2, Github, GitCommit, Copy, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import { Avatar, AvatarImage, AvatarFallback } from "@workspace/ui";
import { useGithubCommitDetail } from "@/features/github/hooks/use-github";
import type { PrFile } from "@/features/github/hooks/use-github";
import { PRFilesTab } from "./PRFilesTab";
import { usePrContextHeader } from "./use-pr-context-header";
import { cn } from "@/shared/lib/utils";

const MarkdownRenderer = dynamic(
  () => import("@/shared/components/markdown/MarkdownRenderer").then((m) => m.MarkdownRenderer),
  { ssr: false },
);

interface CommitDetailViewProps {
  owner: string;
  repo: string;
  sha: string;
  subject: string;
  authorName: string;
  active: boolean;
  onRequestClose: () => void;
}

export function CommitDetailView({
  owner,
  repo,
  sha,
  subject,
  authorName,
  active,
  onRequestClose,
}: CommitDetailViewProps) {
  const t = useTranslations("github.commitDetail");
  const locale = useLocale();
  const dateLocale = locale.startsWith("zh") ? zhCN : enUS;
  const [copied, setCopied] = React.useState(false);

  const {
    handleFilesCodeViewTopBoundaryWheel,
    handleMainScroll,
    handleMainWheelCapture,
    mainScrollRef,
    prContextRef,
    resetPrContext,
  } = usePrContextHeader("files");

  React.useEffect(() => {
    resetPrContext();
  }, [sha, resetPrContext]);

  const { data: detail, loading } = useGithubCommitDetail(
    owner,
    repo,
    active ? sha : undefined,
    active,
  );

  const commit = detail?.commit;
  const author = detail?.author;
  const files: PrFile[] = React.useMemo(
    () => (Array.isArray(detail?.files) ? (detail.files as PrFile[]) : []),
    [detail],
  );

  const commitDate = React.useMemo(() => {
    const dateStr = commit?.author?.date ?? commit?.committer?.date;
    return dateStr ? new Date(dateStr) : null;
  }, [commit]);

  const fullMessage = commit?.message ?? subject;
  const messageParts = React.useMemo(() => {
    const idx = fullMessage.indexOf("\n\n");
    if (idx < 0) return { headline: fullMessage, body: "" };
    return { headline: fullMessage.slice(0, idx), body: fullMessage.slice(idx + 2) };
  }, [fullMessage]);

  const githubUrl = `https://github.com/${owner}/${repo}/commit/${sha}`;
  const totalAdditions = files.reduce((sum, f) => sum + (f.additions ?? 0), 0);
  const totalDeletions = files.reduce((sum, f) => sum + (f.deletions ?? 0), 0);

  const handleCopyHash = () => {
    navigator.clipboard.writeText(sha).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (loading && !detail) {
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
      {/* Fixed header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
        <GitCommit className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-semibold truncate">{messageParts.headline}</span>
        <button
          type="button"
          onClick={handleCopyHash}
          className="flex shrink-0 items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] text-muted-foreground hover:bg-muted transition-colors"
        >
          {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
          {sha.substring(0, 7)}
        </button>
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Github className="size-3.5" />
        </a>
      </div>

      {/* Scrollable content area */}
      <div
        ref={mainScrollRef}
        className="flex-1 min-h-0 overflow-y-auto"
        onScroll={handleMainScroll}
        onWheelCapture={handleMainWheelCapture}
      >
        {/* Collapsible context header — metadata + commit message */}
        <div
          ref={prContextRef}
          className="sticky top-0 z-20 transform-gpu bg-background px-4 py-3 transition-transform duration-200 ease-out will-change-transform"
        >
          <div className="mx-auto max-w-4xl">
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
                  <span className="text-muted-foreground/60">
                    {owner}/{repo}
                  </span>
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

        {/* Diff — fills remaining space */}
        <div
          className={cn("min-h-[520px] overflow-hidden px-4 pb-4 pt-2")}
          style={{ height: "100%" }}
        >
          <PRFilesTab
            files={files}
            loading={loading}
            owner={owner}
            repo={repo}
            title={messageParts.headline}
            url={githubUrl}
            onCodeViewTopBoundaryWheel={handleFilesCodeViewTopBoundaryWheel}
          />
        </div>
      </div>
    </div>
  );
}
