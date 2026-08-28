"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import type { ToolCallBlock } from "@/features/agent/lib/agent/thread";
import {
  deriveToolDisplayName,
  getSkillName,
  getTerminalCommandString,
  getToolIcon,
  isSkillCommand,
  isSkillInvocation,
  isTerminalCommand,
} from "@/features/agent/lib/chat-helpers";
import {
  parseToolResult,
  type ToolLineRange,
} from "@/features/agent/lib/tool-results/parse-tool-result";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";
import {
  AgentToolCard,
  AgentToolDiffStats,
  AgentToolFileGlyph,
} from "./AgentToolCard";
import { AgentToolDiffResult } from "./AgentToolDiffResult";
import {
  AgentToolCopyAction,
  AgentToolDeleteBody,
  AgentToolEmptyBody,
  AgentToolErrorBody,
  AgentToolFilesBody,
  AgentToolInputRows,
  AgentToolJsonBody,
  AgentToolMarkdownBody,
  AgentToolMoveBody,
  AgentToolSearchBody,
  AgentToolTextBody,
  AgentToolTodosBody,
  AgentToolTreeBody,
} from "./AgentToolBodies";

function countLines(text: string): number {
  if (!text) return 0;
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

function fenceForMarkdown(code: string, language: string): string {
  let ticks = "```";
  while (code.includes(ticks)) ticks += "`";
  return `${ticks}${language}\n${code}\n${ticks}`;
}

function titleWithRange(title: string, range: ToolLineRange | null): string {
  if (!range) return title;
  return `${title} (${range.start}–${range.end})`;
}

function AgentToolCodeResult({
  path,
  language,
  code,
  hint,
  status,
  inputRows,
  showInput,
  asSkill,
  title,
  fallbackIcon,
  startLine,
}: {
  path: string | null;
  language: string;
  code: string;
  hint?: "new" | "deleted";
  status?: string;
  inputRows: { key: string; value: string }[];
  showInput: boolean;
  asSkill: boolean;
  title: string;
  fallbackIcon: React.ReactNode;
  startLine?: number;
}) {
  const t = useTranslations("Agent.components.toolResults");
  const additions = hint === "new" ? countLines(code) : 0;
  const deletions = hint === "deleted" ? countLines(code) : 0;
  const icon = path
    ? <AgentToolFileGlyph path={path} />
    : asSkill
      ? <Sparkles className="size-4" />
      : fallbackIcon;

  return (
    <AgentToolCard
      variant="tool"
      tone={asSkill ? "skill" : status?.toLowerCase() === "failed" ? "error" : "default"}
      icon={icon}
      title={title}
      titleTooltip={path ? `${title}\n${path}` : title}
      status={status}
      meta={
        hint ? (
          <span className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              {hint === "new" ? t("newFile") : t("deletedFile")}
            </span>
            <AgentToolDiffStats additions={additions} deletions={deletions} />
          </span>
        ) : null
      }
    >
      {showInput ? <AgentToolInputRows rows={inputRows} /> : null}
      <div
        className="px-2 pb-2 [&_.my-4]:my-2"
        style={{
          ["--shiki-line-offset" as string]: Math.max(0, (startLine ?? 1) - 1),
        }}
      >
        <MarkdownRenderer>
          {fenceForMarkdown(code, language)}
        </MarkdownRenderer>
      </div>
    </AgentToolCard>
  );
}

export function AgentToolResultBlock(props: ToolCallBlock) {
  const t = useTranslations("Agent.components.toolResults");
  const parsed = parseToolResult(props);
  const asSkill = isSkillInvocation(props.raw_input) || isSkillCommand(props.raw_input);
  const toolDisplayName = deriveToolDisplayName(
    parsed.resolvedTool || props.tool,
    props.description,
    props.raw_input,
    props.raw_output,
  );
  const skillName = asSkill && props.raw_input && typeof props.raw_input === "object"
    ? getSkillName(props.raw_input as Record<string, unknown>)
    : toolDisplayName;
  const title = titleWithRange(
    asSkill ? t("skillTitle", { name: skillName }) : toolDisplayName,
    parsed.lineRange,
  );
  const icon = asSkill ? <Sparkles className="size-4" /> : getToolIcon(parsed.resolvedTool || props.tool);
  const { presentation, inputRows, showInput, path } = parsed;
  const showCopy = isTerminalCommand(parsed.resolvedTool) || isTerminalCommand(props.tool);

  if (presentation.kind === "diff") {
    return (
      <div className="space-y-2">
        {presentation.files.map((file, index) => (
          <AgentToolDiffResult
            key={`${file.path}-${index}`}
            path={file.path}
            title={presentation.files.length === 1 ? title : file.path}
            oldContent={file.oldContent}
            newContent={file.newContent}
            status={props.status}
          />
        ))}
      </div>
    );
  }

  if (presentation.kind === "patch") {
    return (
      <AgentToolDiffResult
        path={presentation.path || path || t("file")}
        title={title}
        patch={presentation.patch}
        status={props.status}
      />
    );
  }

  if (presentation.kind === "code") {
    return (
      <AgentToolCodeResult
        path={presentation.path}
        language={presentation.language}
        code={presentation.code}
        hint={presentation.hint}
        status={props.status}
        inputRows={inputRows}
        showInput={showInput}
        asSkill={asSkill}
        title={title}
        fallbackIcon={icon}
        startLine={parsed.lineRange?.start}
      />
    );
  }

  const copyText = showCopy
    ? (getTerminalCommandString(props.raw_input)
      || (presentation.kind === "text" || presentation.kind === "error" ? presentation.text : "")
      || (presentation.kind === "json" ? presentation.json : ""))
    : "";

  return (
    <AgentToolCard
      variant="tool"
      tone={asSkill ? "skill" : presentation.kind === "error" ? "error" : "default"}
      icon={icon}
      title={title}
      titleTooltip={path ? `${title}\n${path}` : title}
      status={props.status}
      actions={showCopy ? <AgentToolCopyAction text={copyText} /> : undefined}
    >
      {showInput ? <AgentToolInputRows rows={inputRows} /> : null}
      {presentation.kind === "search" ? <AgentToolSearchBody hits={presentation.hits} /> : null}
      {presentation.kind === "files" ? <AgentToolFilesBody paths={presentation.paths} /> : null}
      {presentation.kind === "tree" ? <AgentToolTreeBody entries={presentation.entries} /> : null}
      {presentation.kind === "markdown" ? <AgentToolMarkdownBody markdown={presentation.markdown} /> : null}
      {presentation.kind === "json" ? <AgentToolJsonBody json={presentation.json} /> : null}
      {presentation.kind === "text" ? <AgentToolTextBody text={presentation.text} /> : null}
      {presentation.kind === "todos" ? <AgentToolTodosBody todos={presentation.todos} /> : null}
      {presentation.kind === "move" ? (
        <AgentToolMoveBody from={presentation.from} to={presentation.to} />
      ) : null}
      {presentation.kind === "delete" ? <AgentToolDeleteBody path={presentation.path} /> : null}
      {presentation.kind === "error" ? <AgentToolErrorBody text={presentation.text} /> : null}
      {presentation.kind === "empty" ? <AgentToolEmptyBody status={props.status} /> : null}
    </AgentToolCard>
  );
}
