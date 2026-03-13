"use client";

import React, { useEffect, useMemo, useState } from "react";
import { PatchDiff, MultiFileDiff } from "@pierre/diffs/react";
import type { FileContents } from "@pierre/diffs";
import { useTheme } from "next-themes";
import {
  Skill,
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@workspace/ui";
import type { ToolCallBlock } from "@/lib/agent/thread";
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
} from "./chat-helpers";
import { TerminalBlock } from "./TerminalBlock";

export function ToolOrSkillBlock(props: ToolCallBlock) {
  const {
    tool,
    description,
    status,
    raw_input,
    raw_output,
    detail,
  } = props;

  const { resolvedTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  const diffTheme = resolvedTheme === "dark" ? "pierre-dark" : "pierre-light";
  const diffOptions = useMemo(() => ({
    theme: diffTheme,
    diffStyle: "unified" as const,
    overflow: "wrap" as const,
    disableLineNumbers: false,
    disableFileHeader: false,
  }), [diffTheme]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

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

  const diffPatch: string | null = (() => {
    if (!isError && typeof raw_output === "string" && isDiffString(raw_output)) {
      return raw_output;
    }
    return null;
  })();

  const diffFiles: { oldFile: FileContents; newFile: FileContents } | null = (() => {
    if (!isError && !diffPatch && isDiffObject(raw_output)) {
      const name = raw_output.name ?? "file";
      return {
        oldFile: { name, contents: raw_output.old_content },
        newFile: { name, contents: raw_output.new_content },
      };
    }
    return null;
  })();

  const output =
    raw_output !== undefined && raw_output !== null
      ? typeof raw_output === "string"
        ? raw_output
        : JSON.stringify(raw_output, null, 2)
      : !isError
        ? description || "Processing..."
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
      return "Execution failed";
    })()
    : null;

  const Wrapper = asSkill ? Skill : Tool;

  return (
    <Wrapper defaultOpen={false} className="w-full">
      <ToolHeader
        variant={asSkill ? "skill" : "tool"}
        state={state}
        title={asSkill ? `Skill: ${skillName}` : toolDisplayName}
        icon={asSkill ? undefined : getToolIcon(tool)}
      />
      <ToolContent>
        <ToolInput
          input={raw_input}
          label={asSkill ? "Args" : "Parameters"}
        />
        {diffPatch ? (
          <div className="mt-1 max-h-[360px] overflow-auto rounded-md border border-border/50">
            {isMounted ? (
              <PatchDiff patch={diffPatch} options={diffOptions} />
            ) : (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Loading diff...
              </div>
            )}
          </div>
        ) : diffFiles ? (
          <div className="mt-1 max-h-[360px] overflow-auto rounded-md border border-border/50">
            {isMounted ? (
              <MultiFileDiff
                oldFile={diffFiles.oldFile}
                newFile={diffFiles.newFile}
                options={diffOptions}
              />
            ) : (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Loading diff...
              </div>
            )}
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
