"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import {
  deriveToolDisplayName,
  getSkillName,
  getToolKindIcon,
  isSkillCommand,
  isSkillInvocation,
} from "@/features/agent/lib/chat-helpers";
import {
  hostFromUrl,
  parseToolResult,
  type ToolLineRange,
  type ToolPresentation,
} from "@/features/agent/lib/tool-results/parse-tool-result";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";
import { useDisplayToolTitle } from "../agent-chat-cwd-context";
import {
  AgentToolCard,
  AgentToolDiffStats,
  AgentToolFileChip,
  SiteFavicon,
  type AgentToolBody,
  type AgentToolSurface,
} from "./AgentToolCard";
import { AgentToolDiffResult } from "./AgentToolDiffResult";
import {
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
  AgentToolWebFetchBody,
  AgentToolWebSearchBody,
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
  if (range.start === range.end) return `${title} (${range.start})`;
  return `${title} (${range.start}–${range.end})`;
}

function toolBodyForKind(kind: ToolPresentation["kind"]): AgentToolBody {
  switch (kind) {
    case "markdown":
    case "json":
      return "plain";
    default:
      return "panel";
  }
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
  surface = "card",
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
  surface?: AgentToolSurface;
}) {
  const t = useTranslations("Agent.components.toolResults");
  const displayTitle = useDisplayToolTitle();
  const additions = hint === "new" ? countLines(code) : 0;
  const deletions = hint === "deleted" ? countLines(code) : 0;
  const actionTitle = hint === "new" ? t("created") : displayTitle(title, path);

  return (
    <AgentToolCard
      variant="tool"
      surface={surface}
      body="plain"
      tone={asSkill ? "skill" : status?.toLowerCase() === "failed" ? "error" : "default"}
      icon={asSkill ? <Sparkles className="size-4" /> : fallbackIcon}
      title={actionTitle}
      titleTooltip={path ? `${actionTitle}\n${path}` : actionTitle}
      accessory={path ? <AgentToolFileChip path={path} /> : null}
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

export function AgentToolResultBlock({
  part,
  surface = "card",
}: {
  part: AgentToolCallPart;
  surface?: AgentToolSurface;
}) {
  const t = useTranslations("Agent.components.toolResults");
  const displayTitle = useDisplayToolTitle();
  const parsed = parseToolResult({
    tool: part.name,
    description: part.title ?? undefined,
    status: part.status ?? undefined,
    raw_input: part.input,
    raw_output: part.output,
    content: Array.isArray(part.content) ? part.content as never : undefined,
    detail: part.content,
  });
  const asSkill = part.kind === "skill"
    || isSkillInvocation(part.input)
    || isSkillCommand(part.input);
  const toolDisplayName = displayTitle(deriveToolDisplayName(
    parsed.resolvedTool || part.name,
    part.title || part.name,
    part.input,
    part.output ?? part.content,
  ), parsed.path);
  const skillName = asSkill && part.input && typeof part.input === "object"
    ? getSkillName(part.input as Record<string, unknown>)
    : toolDisplayName;
  const fileChip = parsed.path
    && (part.kind === "read" || part.kind === "edit" || part.kind === "delete" || parsed.presentation.kind === "code")
    ? <AgentToolFileChip path={parsed.path} />
    : null;
  const actionName = fileChip
    ? deriveToolDisplayName(parsed.resolvedTool || part.name, parsed.resolvedTool || part.name)
    : toolDisplayName;
  const title = titleWithRange(
    asSkill ? t("skillTitle", { name: skillName }) : actionName,
    parsed.lineRange,
  );
  const icon = asSkill ? <Sparkles className="size-4" /> : getToolKindIcon(part.kind);
  const { presentation, inputRows, showInput, path } = parsed;
  const status = part.status ?? undefined;

  if (presentation.kind === "diff") {
    return (
      <div className="space-y-2">
        {presentation.files.map((file, index) => (
          <AgentToolDiffResult
            key={`${file.path}-${index}`}
            path={file.path}
            title={displayTitle(
              presentation.files.length === 1 ? title : file.path,
              file.path,
            )}
            oldContent={file.oldContent}
            newContent={file.newContent}
            status={status}
            surface={surface}
          />
        ))}
      </div>
    );
  }

  if (presentation.kind === "patch") {
    return (
      <AgentToolDiffResult
        path={presentation.path || path || t("file")}
        title={displayTitle(title, presentation.path || path)}
        patch={presentation.patch}
        status={status}
        surface={surface}
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
        status={status}
        inputRows={inputRows}
        showInput={showInput}
        asSkill={asSkill}
        title={title}
        fallbackIcon={icon}
        startLine={parsed.lineRange?.start}
        surface={surface}
      />
    );
  }

  if (presentation.kind === "web_search") {
    const query = presentation.query.trim();
    const searchTitle = query ? t("searchingFor", { query }) : t("webSearch");
    return (
      <AgentToolCard
        variant="tool"
        surface={surface}
        body="plain"
        tone={status?.toLowerCase() === "failed" ? "error" : "default"}
        icon={getToolKindIcon("search")}
        title={searchTitle}
        titleTooltip={query || searchTitle}
        status={status}
        meta={
          presentation.links.length > 0 ? (
            <span className="text-[11px] text-muted-foreground">
              {t("resultCount", { count: presentation.links.length })}
            </span>
          ) : null
        }
      >
        <AgentToolWebSearchBody
          links={presentation.links}
          sourcesLabel={t("sources")}
          layoutKey={part.tool_call_id || part.name}
        />
      </AgentToolCard>
    );
  }

  if (presentation.kind === "web_fetch") {
    const host = hostFromUrl(presentation.url) ?? presentation.url;
    const failed = status?.toLowerCase() === "failed";
    return (
      <AgentToolCard
        variant="tool"
        surface={surface}
        body={failed || !presentation.markdown ? "panel" : "plain"}
        tone={failed ? "error" : "default"}
        icon={<SiteFavicon url={presentation.url} />}
        title={t("fetchUrl", { host })}
        titleTooltip={presentation.url}
        status={status}
      >
        {failed && presentation.text ? <AgentToolErrorBody text={presentation.text} /> : null}
        {!failed ? (
          <AgentToolWebFetchBody
            url={presentation.url}
            markdown={presentation.markdown}
            text={presentation.text}
          />
        ) : null}
        {failed && !presentation.text ? <AgentToolEmptyBody status={status} /> : null}
      </AgentToolCard>
    );
  }

  return (
    <AgentToolCard
      variant="tool"
      surface={surface}
      body={toolBodyForKind(presentation.kind)}
      tone={asSkill ? "skill" : presentation.kind === "error" ? "error" : "default"}
      icon={icon}
      title={title}
      titleTooltip={path ? `${title}\n${path}` : title}
      accessory={fileChip}
      status={status}
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
      {presentation.kind === "empty" ? <AgentToolEmptyBody status={status} /> : null}
    </AgentToolCard>
  );
}
