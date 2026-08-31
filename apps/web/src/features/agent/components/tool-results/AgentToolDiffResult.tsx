"use client";

import React, { useMemo, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { MultiFileDiff, PatchDiff } from "@pierre/diffs/react";
import { parsePatchFiles, type FileContents } from "@pierre/diffs";
import {
  changedLineRangesFromContents,
  changedLineRangesFromPatch,
  countFileDiffStats,
  countPatchStats,
} from "@/features/agent/lib/tool-results/diff-stats";
import { diffSideCacheKey } from "@/features/diff/lib/diff-code-view-shared";
import {
  ATMOS_DIFF_THEME,
  buildSharedDiffViewOptions,
  getAtmosDiffThemeType,
} from "@/features/diff/lib/diff-view-constants";
import { getToolKindIcon } from "@/features/agent/lib/chat-helpers";
import { displayAgentChatFilePath } from "@/features/agent/lib/agent-chat-file-links";
import { useOpenAgentChatWorkspacePath } from "@/features/agent/hooks/use-open-agent-chat-path";
import { useAgentChatCwd, useAgentChatPathRoots, useDisplayToolTitle } from "../agent-chat-cwd-context";
import { AgentToolCodePreview } from "./AgentToolCodePreview";
import {
  AgentToolCard,
  AgentToolDiffStats,
  AgentToolFileChangeStats,
  AgentToolFileChip,
  AgentToolFileGlyph,
  type AgentToolSurface,
} from "./AgentToolCard";

function isValidPatch(patch: string): boolean {
  try {
    return parsePatchFiles(patch).length > 0;
  } catch {
    return false;
  }
}

export function AgentToolDiffResult({
  path,
  title,
  oldContent,
  newContent,
  patch,
  status,
  defaultOpen = false,
  surface = "card",
}: {
  path: string;
  title?: string;
  oldContent?: string;
  newContent?: string;
  patch?: string;
  status?: string;
  defaultOpen?: boolean;
  surface?: AgentToolSurface;
}) {
  const t = useTranslations("Agent.components.toolResults");
  const displayTitle = useDisplayToolTitle();
  const cwd = useAgentChatCwd();
  const roots = useAgentChatPathRoots();
  const openWorkspacePath = useOpenAgentChatWorkspacePath();
  const displayPath = displayAgentChatFilePath(path, cwd, roots);
  const { resolvedTheme } = useTheme();
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const oldFile: FileContents = useMemo(() => ({
    name: displayPath,
    contents: oldContent ?? "",
  }), [displayPath, oldContent]);
  const newFile: FileContents = useMemo(() => ({
    name: displayPath,
    contents: newContent ?? "",
  }), [displayPath, newContent]);

  const validPatch = Boolean(patch && isValidPatch(patch));
  const stats = useMemo(() => {
    if (patch) return countPatchStats(patch);
    return countFileDiffStats(oldContent ?? "", newContent ?? "", path);
  }, [oldContent, newContent, patch, path]);
  const selectRanges = useMemo(() => {
    if (patch) return changedLineRangesFromPatch(patch);
    return changedLineRangesFromContents(oldContent ?? "", newContent ?? "", path);
  }, [oldContent, newContent, patch, path]);

  const diffOptions = useMemo(() => ({
    ...buildSharedDiffViewOptions({
      theme: ATMOS_DIFF_THEME,
      themeType: getAtmosDiffThemeType(resolvedTheme),
      diffStyle: "unified",
      wordWrap: true,
      lineNumbers: true,
      enableLineSelection: false,
      enableGutterUtility: false,
    }),
    disableFileHeader: true,
    unsafeCSS: `
      :host {
        --diffs-bg: var(--background);
        --diffs-dark-bg: var(--background);
        --diffs-light-bg: var(--background);
        --diffs-gap-block: 0px;
      }
      [data-change-icon],
      [data-line-utility],
      [data-gutter-utility],
      [data-header-actions] {
        display: none !important;
      }
      /* Pierre's header normally zeroes this 8px pad; we replace that header. */
      [data-code],
      [data-overflow="wrap"] {
        padding-block: 0 !important;
      }
    `,
    stickyHeaders: false,
    // Full old/new file contents let pierre collapse distant unchanged
    // regions and reveal them via "N unmodified lines" expanders.
    expandUnchanged: true,
    collapsedContextThreshold: 3,
    expansionLineCount: 20,
  }), [resolvedTheme]);

  return (
    <AgentToolCard
      variant="tool"
      surface={surface}
      body="panel"
      icon={getToolKindIcon("edit")}
      title={!oldContent && newContent ? t("created") : displayTitle(title || t("file"), path)}
      titleTooltip={displayPath}
      accessory={<AgentToolFileChip path={path} selectRanges={selectRanges} />}
      status={status}
      defaultOpen={defaultOpen}
      meta={<AgentToolDiffStats additions={stats.additions} deletions={stats.deletions} />}
    >
      <div className="overflow-hidden rounded-[inherit]">
        <button
          type="button"
          className="flex w-full min-w-0 items-center gap-2 border-b border-border/50 bg-muted/30 px-3 py-1.5 text-left hover:bg-muted/50"
          title={displayPath}
          onClick={() => {
            void openWorkspacePath(path, { isDir: false, selectRanges });
          }}
        >
          <AgentToolFileGlyph path={path} className="size-4" />
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground/80">
            {displayPath}
          </span>
          <AgentToolFileChangeStats additions={stats.additions} deletions={stats.deletions} />
        </button>
        <div className="max-h-[28rem] overflow-auto">
          {isMounted ? (
            patch ? (
              validPatch ? (
                <PatchDiff patch={patch} options={diffOptions} />
              ) : (
                <AgentToolCodePreview code={patch} language="plaintext" />
              )
            ) : (
              <MultiFileDiff
                oldFile={{ ...oldFile, cacheKey: diffSideCacheKey(path, oldFile.contents) }}
                newFile={{ ...newFile, cacheKey: diffSideCacheKey(path, newFile.contents) }}
                options={diffOptions}
              />
            )
          ) : (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {t("loadingDiff")}
            </div>
          )}
        </div>
      </div>
    </AgentToolCard>
  );
}
