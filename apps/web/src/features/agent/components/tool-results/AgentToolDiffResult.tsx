"use client";

import React, { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  changedLineRangesFromContents,
  changedLineRangesFromPatch,
  countFileDiffStats,
  countPatchStats,
} from "@/features/agent/lib/tool-results/diff-stats";
import { getToolKindIcon } from "@/features/agent/lib/chat-helpers";
import { displayAgentChatFilePath } from "@/features/agent/lib/agent-chat-file-links";
import {
  stripPathEchoFromToolHeading,
  toolTitleLooksLikePath,
  type ToolLineRange,
} from "@/features/agent/lib/tool-results/parse-tool-result";
import { DiscussionDiffBlock } from "@/features/diff/components/DiscussionDiffBlock";
import { useAgentChatCwd, useAgentChatPathRoots, useDisplayToolTitle } from "../agent-chat-cwd-context";
import { AgentToolCodePreview } from "./AgentToolCodePreview";
import {
  AgentToolCard,
  AgentToolDiffStats,
  AgentToolFileChip,
  type AgentToolSurface,
} from "./AgentToolCard";

export function AgentToolDiffResult({
  path,
  title,
  oldContent,
  newContent,
  patch,
  status,
  defaultOpen = false,
  surface = "card",
  /** Explicit Read-style range only — never invent from diff hunks for Write/Edit. */
  lineRange = null,
}: {
  path: string;
  title?: string;
  oldContent?: string;
  newContent?: string;
  patch?: string;
  status?: string;
  defaultOpen?: boolean;
  surface?: AgentToolSurface;
  lineRange?: ToolLineRange | null;
}) {
  const t = useTranslations("Agent.components.toolResults");
  const displayTitle = useDisplayToolTitle();
  const cwd = useAgentChatCwd();
  const roots = useAgentChatPathRoots();
  const displayPath = displayAgentChatFilePath(path, cwd, roots);

  const stats = useMemo(() => {
    if (patch) return countPatchStats(patch);
    return countFileDiffStats(oldContent ?? "", newContent ?? "", path);
  }, [oldContent, newContent, patch, path]);
  const selectRanges = useMemo(() => {
    if (patch) return changedLineRangesFromPatch(patch);
    return changedLineRangesFromContents(oldContent ?? "", newContent ?? "", path);
  }, [oldContent, newContent, patch, path]);

  const created = !oldContent && Boolean(newContent);
  const rawTitle = displayTitle(title || "", path);
  const strippedTitle = stripPathEchoFromToolHeading(rawTitle, path, [displayPath]);
  const actionTitle = created
    ? t("created")
    : (!strippedTitle || toolTitleLooksLikePath(strippedTitle, path) ? t("file") : strippedTitle);

  const fallback = patch ? (
    <AgentToolCodePreview code={patch} language="plaintext" />
  ) : (
    <div className="px-3 py-2 text-xs text-muted-foreground">
      {t("loadingDiff")}
    </div>
  );

  const discussionLineRange =
    lineRange && lineRange.start > 0 && lineRange.end > 0
      ? { start: lineRange.start, end: lineRange.end }
      : null;

  return (
    <AgentToolCard
      variant="tool"
      surface={surface}
      body="plain"
      icon={getToolKindIcon("edit")}
      title={actionTitle}
      titleTooltip={displayPath}
      accessory={<AgentToolFileChip path={path} selectRanges={selectRanges} />}
      status={status}
      defaultOpen={defaultOpen}
      meta={<AgentToolDiffStats additions={stats.additions} deletions={stats.deletions} />}
    >
      {/*
        PR discussion chrome via DiscussionDiffBlock.
        Chat: always expanded (collapsible=false); no Agent Fix slot;
        Write/Edit omit line labels unless an explicit lineRange was provided.
      */}
      <div data-agent-diff="pr-discussion">
        <DiscussionDiffBlock
          path={path}
          displayPath={displayPath}
          lineRange={discussionLineRange}
          oldContent={oldContent}
          newContent={newContent}
          patch={patch}
          defaultExpanded
          collapsible={false}
          maxHeightClass="max-h-[28rem]"
          fallback={fallback}
        />
      </div>
    </AgentToolCard>
  );
}
