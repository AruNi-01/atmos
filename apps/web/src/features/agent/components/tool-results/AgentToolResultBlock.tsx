"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import type { ToolCallBlock } from "@/features/agent/lib/agent/thread";
import {
  deriveToolDisplayName,
  getSkillName,
  getToolIcon,
  isSkillCommand,
  isSkillInvocation,
} from "@/features/agent/lib/chat-helpers";
import { parseToolResult } from "@/features/agent/lib/tool-results/parse-tool-result";
import { CopyButton } from "@/shared/components/code-block/copy-button";
import {
  AgentToolCard,
  AgentToolDiffStats,
  AgentToolFileGlyph,
} from "./AgentToolCard";
import { AgentToolCodePreview } from "./AgentToolCodePreview";
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
} from "./AgentToolBodies";

function countLines(text: string): number {
  if (!text) return 0;
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
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
  fallbackTitle,
  fallbackIcon,
}: {
  path: string | null;
  language: string;
  code: string;
  hint?: "new" | "deleted";
  status?: string;
  inputRows: { key: string; value: string }[];
  showInput: boolean;
  asSkill: boolean;
  fallbackTitle: string;
  fallbackIcon: React.ReactNode;
}) {
  const t = useTranslations("Agent.components.toolResults");
  const additions = hint === "new" ? countLines(code) : 0;
  const deletions = hint === "deleted" ? countLines(code) : 0;
  const title = path ?? fallbackTitle;
  const icon = path
    ? <AgentToolFileGlyph path={path} />
    : asSkill
      ? <Sparkles className="size-4" />
      : fallbackIcon;

  return (
    <AgentToolCard
      variant={path ? "file" : "tool"}
      tone={asSkill ? "skill" : status?.toLowerCase() === "failed" ? "error" : "default"}
      icon={icon}
      title={title}
      titleTooltip={path ?? undefined}
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
      actions={<CopyButton content={code} />}
    >
      {showInput ? <AgentToolInputRows rows={inputRows} /> : null}
      <AgentToolCodePreview code={code} language={language} />
    </AgentToolCard>
  );
}

export function AgentToolResultBlock(props: ToolCallBlock) {
  const t = useTranslations("Agent.components.toolResults");
  const parsed = parseToolResult(props);
  const asSkill = isSkillInvocation(props.raw_input) || isSkillCommand(props.raw_input);
  const toolDisplayName = deriveToolDisplayName(props.tool, props.description, props.raw_input);
  const skillName = asSkill && props.raw_input && typeof props.raw_input === "object"
    ? getSkillName(props.raw_input as Record<string, unknown>)
    : toolDisplayName;
  const title = asSkill ? t("skillTitle", { name: skillName }) : toolDisplayName;
  const icon = asSkill ? <Sparkles className="size-4" /> : getToolIcon(props.tool);
  const { presentation, inputRows, showInput, path } = parsed;

  if (presentation.kind === "diff") {
    return (
      <div className="space-y-2">
        {presentation.files.map((file, index) => (
          <AgentToolDiffResult
            key={`${file.path}-${index}`}
            path={file.path}
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
        fallbackTitle={title}
        fallbackIcon={icon}
      />
    );
  }

  const copyText = presentation.kind === "json"
    ? presentation.json
    : presentation.kind === "markdown"
      ? presentation.markdown
      : presentation.kind === "text" || presentation.kind === "error"
        ? presentation.text
        : presentation.kind === "search"
          ? presentation.hits
            .map((hit) => (hit.line != null ? `${hit.path}:${hit.line}:${hit.text}` : hit.path))
            .join("\n")
          : presentation.kind === "files"
            ? presentation.paths.join("\n")
            : "";

  return (
    <AgentToolCard
      variant="tool"
      tone={asSkill ? "skill" : presentation.kind === "error" ? "error" : "default"}
      icon={icon}
      title={title}
      titleTooltip={title}
      status={props.status}
      actions={<AgentToolCopyAction text={copyText} />}
    >
      {showInput ? <AgentToolInputRows rows={inputRows} /> : null}
      {presentation.kind === "search" ? <AgentToolSearchBody hits={presentation.hits} /> : null}
      {presentation.kind === "files" ? <AgentToolFilesBody paths={presentation.paths} /> : null}
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
