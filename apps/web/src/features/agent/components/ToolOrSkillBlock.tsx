"use client";

import React, { useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { PatchDiff, MultiFileDiff } from "@pierre/diffs/react";
import { parseDiffFromFile, type FileContents } from "@pierre/diffs";
import { useTheme } from "next-themes";
import { ChevronRight } from "lucide-react";
import {
  getFileIconProps,
  Skill,
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@workspace/ui";
import type { ToolCallBlock } from "@/features/agent/lib/agent/thread";
import {
  toolStatusToState,
  isTerminalCommand,
  isSkillInvocation,
  isSkillCommand,
  getSkillName,
  deriveToolDisplayName,
  isDiffString,
  isDiffObject,
  getToolIcon,
} from "../lib/chat-helpers";
import { TerminalBlock } from "./TerminalBlock";
import {
  ATMOS_DIFF_THEME,
  buildSharedDiffViewOptions,
  getAtmosDiffThemeType,
} from "@/features/diff/lib/diff-view-constants";
import { cn } from "@/shared/lib/utils";

type ToolDiffFile = {
  oldFile: FileContents;
  newFile: FileContents;
};

function countDiffLines(file: ToolDiffFile) {
  try {
    const diff = parseDiffFromFile(file.oldFile, file.newFile);
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

function AgentToolDiffFile({
  file,
  isMounted,
  options,
  loadingLabel,
}: {
  file: ToolDiffFile;
  isMounted: boolean;
  options: ReturnType<typeof buildSharedDiffViewOptions> & { disableFileHeader: boolean };
  loadingLabel: string;
}) {
  const t = useTranslations("diff.codeViewUi");
  const [collapsed, setCollapsed] = useState(true);
  const filePath = file.newFile.name || file.oldFile.name;
  const fileName = filePath.split("/").pop() || filePath;
  const stats = useMemo(() => countDiffLines(file), [file]);
  const iconProps = getFileIconProps({
    name: fileName,
    isDir: false,
    className: "size-4 shrink-0",
  });

  return (
    <div className="overflow-hidden rounded-md border border-border/70 bg-background/70">
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-label={collapsed ? t("expandDiff") : t("collapseDiff")}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/35"
        onClick={() => setCollapsed((value) => !value)}
      >
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            !collapsed && "rotate-90",
          )}
        />
        {/* eslint-disable-next-line @next/next/no-img-element -- file icons are local UI asset descriptors from getFileIconProps */}
        <img {...iconProps} alt="" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" title={filePath}>
          {filePath}
        </span>
        {(stats.deletions > 0 || stats.additions > 0) ? (
          <span className="shrink-0 font-mono text-xs">
            {stats.deletions > 0 ? <span className="text-red-500">-{stats.deletions}</span> : null}
            {stats.deletions > 0 && stats.additions > 0 ? <span className="mx-1 text-muted-foreground">/</span> : null}
            {stats.additions > 0 ? <span className="text-green-500">+{stats.additions}</span> : null}
          </span>
        ) : null}
      </button>
      {!collapsed ? (
        <div className="max-h-[360px] overflow-auto border-t border-border/60">
          {isMounted ? (
            <MultiFileDiff
              oldFile={{ ...file.oldFile, cacheKey: `${file.oldFile.name}:old` }}
              newFile={{ ...file.newFile, cacheKey: `${file.newFile.name}:new` }}
              options={options}
            />
          ) : (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {loadingLabel}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function AgentToolDiffBlock({
  files,
  isMounted,
  options,
  loadingLabel,
}: {
  files: ToolDiffFile[];
  isMounted: boolean;
  options: ReturnType<typeof buildSharedDiffViewOptions> & { disableFileHeader: boolean };
  loadingLabel: string;
}) {
  return (
    <div className="mt-2 space-y-2">
      {files.map((file, index) => (
        <AgentToolDiffFile
          key={`${file.newFile.name}-${index}`}
          file={file}
          isMounted={isMounted}
          options={options}
          loadingLabel={loadingLabel}
        />
      ))}
    </div>
  );
}

export function ToolOrSkillBlock(props: ToolCallBlock) {
  const t = useTranslations("Agent.components.toolOrSkill");
  const {
    tool,
    description,
    status,
    raw_input,
    content,
    raw_output,
    detail,
  } = props;

  const { resolvedTheme } = useTheme();
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const diffThemeType = getAtmosDiffThemeType(resolvedTheme);
  const diffOptions = useMemo(() => ({
    ...buildSharedDiffViewOptions({
      theme: ATMOS_DIFF_THEME,
      themeType: diffThemeType,
      diffStyle: "unified",
      wordWrap: true,
      lineNumbers: true,
    }),
    disableFileHeader: false,
  }), [diffThemeType]);
  const embeddedDiffOptions = useMemo(() => ({
    ...diffOptions,
    disableFileHeader: true,
  }), [diffOptions]);

  if (isTerminalCommand(tool)) {
    return <TerminalBlock {...props} />;
  }

  const state = toolStatusToState(status);
  const isError = state === "output-error";
  const asSkill = isSkillInvocation(raw_input) || isSkillCommand(raw_input);

  const toolDisplayName = deriveToolDisplayName(tool, description, raw_input);

  const skillName = asSkill && raw_input && typeof raw_input === "object"
    ? getSkillName(raw_input as Record<string, unknown>)
    : toolDisplayName;

  const contentDiffFiles: { oldFile: FileContents; newFile: FileContents }[] = (() => {
    if (isError) return [];
    return (content ?? []).flatMap((item) => {
      if (item.type !== "diff") return [];
      const name = item.path?.trim() || t("file");
      return [{
        oldFile: { name, contents: item.old_content ?? "" },
        newFile: { name, contents: item.new_content },
      }];
    });
  })();

  if (contentDiffFiles.length > 0) {
    return (
      <AgentToolDiffBlock
        files={contentDiffFiles}
        isMounted={isMounted}
        options={embeddedDiffOptions}
        loadingLabel={t("loadingDiff")}
      />
    );
  }

  const diffPatch: string | null = (() => {
    if (
      contentDiffFiles.length === 0 &&
      !isError &&
      typeof raw_output === "string" &&
      isDiffString(raw_output)
    ) {
      return raw_output;
    }
    return null;
  })();

  const diffFiles: { oldFile: FileContents; newFile: FileContents }[] = (() => {
    if (!isError && !diffPatch && isDiffObject(raw_output)) {
      const name = raw_output.name ?? t("file");
      return [{
        oldFile: { name, contents: raw_output.old_content },
        newFile: { name, contents: raw_output.new_content },
      }];
    }
    return [];
  })();

  const output =
    raw_output !== undefined && raw_output !== null
      ? typeof raw_output === "string"
        ? raw_output
        : JSON.stringify(raw_output, null, 2)
      : !isError
        ? description || t("processing")
        : undefined;

  const errorText = isError
    ? (() => {
      if (typeof raw_output === "string" && raw_output.trim()) return raw_output;
      if (raw_output && typeof raw_output === "object") {
        const obj = raw_output as Record<string, unknown>;
        const msg = obj.message ?? obj.error ?? obj.reason;
        if (typeof msg === "string" && msg.trim()) return msg;
        return JSON.stringify(raw_output, null, 2);
      }
      if (detail && typeof detail === "object") {
        const obj = detail as Record<string, unknown>;
        const msg = obj.message ?? obj.error ?? obj.reason;
        if (typeof msg === "string" && msg.trim()) return msg;
      }
      if (typeof detail === "string" && detail.trim()) return detail;
      if (description && description.trim() && description.trim().toLowerCase() !== "tool") return description;
      return t("executionFailed");
    })()
    : null;

  const Wrapper = asSkill ? Skill : Tool;

  return (
    <Wrapper defaultOpen={false} className="w-full">
      <ToolHeader
        variant={asSkill ? "skill" : "tool"}
        state={state}
        title={asSkill ? t("skillTitle", { name: skillName }) : toolDisplayName}
        icon={asSkill ? undefined : getToolIcon(tool)}
      />
      <ToolContent>
        <ToolInput
          input={raw_input}
          label={asSkill ? t("args") : t("parameters")}
        />
        {diffPatch ? (
          <div className="mt-1 max-h-[360px] overflow-auto rounded-md border border-border/50">
            {isMounted ? (
              <PatchDiff patch={diffPatch} options={diffOptions} />
            ) : (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                {t("loadingDiff")}
              </div>
            )}
          </div>
        ) : diffFiles.length > 0 ? (
          <div className="mt-1 space-y-2">
            {diffFiles.map((fileDiff, index) => (
              <div
                key={`${fileDiff.newFile.name}-${index}`}
                className="max-h-[360px] overflow-auto rounded-md border border-border/50"
              >
                {isMounted ? (
                  <MultiFileDiff
                    oldFile={{ ...fileDiff.oldFile, cacheKey: `${fileDiff.oldFile.name}:old` }}
                    newFile={{ ...fileDiff.newFile, cacheKey: `${fileDiff.newFile.name}:new` }}
                    options={diffOptions}
                  />
                ) : (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    {t("loadingDiff")}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <ToolOutput
            output={output}
            errorText={errorText}
          />
        )}
      </ToolContent>
    </Wrapper>
  );
}
