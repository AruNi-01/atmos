"use client";

import React, { useMemo, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { MultiFileDiff, PatchDiff } from "@pierre/diffs/react";
import { parseDiffFromFile, parsePatchFiles, type FileContents } from "@pierre/diffs";
import { diffSideCacheKey } from "@/features/diff/lib/diff-code-view-shared";
import {
  ATMOS_DIFF_THEME,
  buildSharedDiffViewOptions,
  getAtmosDiffThemeType,
} from "@/features/diff/lib/diff-view-constants";
import { useDisplayToolTitle } from "../agent-chat-cwd-context";
import { AgentToolCodePreview } from "./AgentToolCodePreview";
import {
  AgentToolCard,
  AgentToolDiffStats,
  AgentToolFileGlyph,
} from "./AgentToolCard";

function countDiffLines(oldFile: FileContents, newFile: FileContents) {
  try {
    const diff = parseDiffFromFile(oldFile, newFile);
    return diff.hunks.reduce(
      (sum, hunk) => ({
        additions: sum.additions + hunk.additionLines,
        deletions: sum.deletions + hunk.deletionLines,
      }),
      { additions: 0, deletions: 0 },
    );
  } catch {
    return { additions: 0, deletions: 0 };
  }
}

function countPatchStats(patch: string) {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) continue;
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }
  return { additions, deletions };
}

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
}: {
  path: string;
  title?: string;
  oldContent?: string;
  newContent?: string;
  patch?: string;
  status?: string;
  defaultOpen?: boolean;
}) {
  const t = useTranslations("Agent.components.toolResults");
  const displayTitle = useDisplayToolTitle();
  const { resolvedTheme } = useTheme();
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const oldFile: FileContents = useMemo(() => ({
    name: path,
    contents: oldContent ?? "",
  }), [oldContent, path]);
  const newFile: FileContents = useMemo(() => ({
    name: path,
    contents: newContent ?? "",
  }), [newContent, path]);

  const validPatch = Boolean(patch && isValidPatch(patch));
  const stats = useMemo(() => {
    if (patch) return countPatchStats(patch);
    return countDiffLines(oldFile, newFile);
  }, [oldFile, newFile, patch]);

  const diffOptions = useMemo(() => ({
    ...buildSharedDiffViewOptions({
      theme: ATMOS_DIFF_THEME,
      themeType: getAtmosDiffThemeType(resolvedTheme),
      diffStyle: "unified",
      wordWrap: true,
      lineNumbers: true,
    }),
    disableFileHeader: true,
    // Full old/new file contents let pierre collapse distant unchanged
    // regions and reveal them via "N unmodified lines" expanders.
    expandUnchanged: true,
    collapsedContextThreshold: 3,
    expansionLineCount: 20,
  }), [resolvedTheme]);

  return (
    <AgentToolCard
      variant="tool"
      icon={<AgentToolFileGlyph path={path} />}
      title={displayTitle(title || path, path)}
      titleTooltip={path}
      status={status}
      defaultOpen={defaultOpen}
      meta={<AgentToolDiffStats additions={stats.additions} deletions={stats.deletions} />}
    >
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
    </AgentToolCard>
  );
}
