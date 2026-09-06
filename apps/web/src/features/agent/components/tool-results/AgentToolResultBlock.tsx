"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { getToolKindIcon } from "@/features/agent/lib/chat-helpers";
import {
  hostFromUrl,
  presentAgentTool,
  resolveAgentToolCardHeading,
  type ToolLineRange,
  type ToolPresentation,
} from "@/features/agent/lib/tool-results/parse-tool-result";
import type { AgentToolKind } from "@atmos/api-types/ws/dto/agent-chat";
import { changedLineRangesForPresentation } from "@/features/agent/lib/tool-results/diff-stats";
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
import { AgentToolImageGen } from "./AgentToolImageGen";
import { AgentToolPlanDocument } from "./AgentToolPlanDocument";
import { AgentToolPathPreviewBody } from "./AgentToolPathPreviewBody";

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

function toolKindLabel(
  kind: AgentToolKind,
  t: (key: string) => string,
): string {
  switch (kind) {
    case "read":
      return t("read");
    case "edit":
      return t("edit");
    case "delete":
      return t("delete");
    case "move":
      return t("move");
    case "search":
    case "web_search":
      return t("search");
    case "execute":
      return t("execute");
    case "fetch":
      return t("fetch");
    default:
      return t("generic");
  }
}

function toolBodyForKind(kind: ToolPresentation["kind"]): AgentToolBody {
  switch (kind) {
    case "markdown":
    case "json":
    case "diff_stats":
      return "plain";
    default:
      return "panel";
  }
}

function pathFromPart(part: AgentToolCallPart): string | null {
  const params = part.params;
  if (!params) return null;
  switch (params.type) {
    case "read":
    case "edit":
    case "delete":
      return params.path;
    case "move":
      return params.to;
    default:
      return null;
  }
}

function skillNameFromPart(part: AgentToolCallPart): string | null {
  if (part.kind !== "skill") return null;
  if (part.params?.type === "skill" && part.params.skill) return part.params.skill;
  return part.title || part.name || null;
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
  lineRange = null,
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
  lineRange?: ToolLineRange | null;
  surface?: AgentToolSurface;
}) {
  const t = useTranslations("Agent.components.toolResults");
  const displayTitle = useDisplayToolTitle();
  const additions = hint === "new" ? countLines(code) : 0;
  const deletions = hint === "deleted" ? countLines(code) : 0;
  const actionTitle = hint === "new" ? t("created") : displayTitle(title, path);
  const fileChip = path ? (
    <AgentToolFileChip
      path={path}
      selectRanges={
        hint === "new" && additions > 0
          ? [{ startLine: 1, endLine: additions }]
          : lineRange
            ? [{ startLine: lineRange.start, endLine: lineRange.end }]
            : undefined
      }
    />
  ) : null;

  // Read / code preview: MarkdownCodeBlock language head (MARKDOWN + copy/expand).
  // Do NOT wrap in DiscussionDiffBlock — that path/diff chrome is Write/Edit only.
  return (
    <AgentToolCard
      variant="tool"
      surface={surface}
      body="plain"
      tone={asSkill ? "skill" : status?.toLowerCase() === "failed" ? "error" : "default"}
      icon={asSkill ? <Sparkles className="size-4" /> : fallbackIcon}
      title={actionTitle}
      titleTooltip={path ? `${actionTitle}\n${path}` : actionTitle}
      accessory={fileChip}
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
          ["--shiki-line-offset" as string]: Math.max(
            0,
            (lineRange?.start ?? startLine ?? 1) - 1,
          ),
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
  const toolT = useTranslations("agent.chatHelpers.tool");
  const displayTitle = useDisplayToolTitle();
  if (part.kind === "image_gen") {
    return <AgentToolImageGen part={part} surface={surface} />;
  }
  if (part.kind === "plan_document") {
    return <AgentToolPlanDocument part={part} surface={surface} />;
  }
  const parsed = presentAgentTool(part);
  const asSkill = part.kind === "skill";
  const skillName = skillNameFromPart(part);
  const path = parsed.path ?? pathFromPart(part);
  const diffStats = parsed.presentation.kind === "diff_stats"
    ? parsed.presentation
    : part.result?.type === "diff_stats"
      ? part.result
      : null;
  const fileChip = path
    && (part.kind === "read" || part.kind === "edit" || part.kind === "delete" || parsed.presentation.kind === "code")
    ? (
      <AgentToolFileChip
        path={path}
        selectRanges={
          part.kind === "edit"
            ? changedLineRangesForPresentation(parsed.presentation, path)
            : undefined
        }
      />
    )
    : null;
  const heading = (part.title || part.name).trim();
  const kindLabel = toolKindLabel(part.kind, toolT);
  const displayPath = path ? displayTitle(path, path) : "";
  const resolvedHeading = asSkill && skillName
    ? t("skillTitle", { name: skillName })
    : resolveAgentToolCardHeading({
      heading,
      path,
      kindLabel,
      omitPathInTitle: Boolean(fileChip),
      pathAliases: displayPath && displayPath !== path ? [displayPath] : undefined,
      formatWithPath: (tool, filePath) => toolT("labelWithPath", {
        tool,
        path: displayTitle(filePath, filePath),
      }),
    });
  const title = titleWithRange(displayTitle(resolvedHeading, path), parsed.lineRange);
  const icon = asSkill ? <Sparkles className="size-4" /> : getToolKindIcon(part.kind);
  const { presentation, inputRows, showInput } = parsed;
  const status = part.status ?? undefined;
  const failed = status?.toLowerCase() === "failed" || presentation.kind === "error";

  if (presentation.kind === "diff") {
    return (
      <div className="space-y-2">
        {presentation.files.map((file, index) => (
          <AgentToolDiffResult
            key={`${file.path}-${index}`}
            path={file.path}
            title={displayTitle(
              presentation.files.length === 1 ? title : kindLabel,
              file.path,
            )}
            oldContent={file.oldContent}
            newContent={file.newContent}
            lineRange={parsed.lineRange}
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
        lineRange={parsed.lineRange}
        status={status}
        surface={surface}
      />
    );
  }

  if (presentation.kind === "diff_stats") {
    return (
      <AgentToolCard
        variant="tool"
        surface={surface}
        body="plain"
        tone={failed ? "error" : "default"}
        icon={icon}
        title={title}
        titleTooltip={path ? `${title}\n${path}` : title}
        accessory={fileChip}
        status={status}
        meta={
          <AgentToolDiffStats
            additions={presentation.additions}
            deletions={presentation.deletions}
          />
        }
      >
        <p className="px-1 py-1 text-xs text-muted-foreground">
          {t("lineChanges")}
          <span className="ml-2 inline-flex align-middle">
            <AgentToolDiffStats
              additions={presentation.additions}
              deletions={presentation.deletions}
            />
          </span>
        </p>
      </AgentToolCard>
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
        lineRange={parsed.lineRange}
        surface={surface}
      />
    );
  }

  if (presentation.kind === "web_search" || part.kind === "web_search") {
    const query = presentation.kind === "web_search"
      ? presentation.query.trim()
      : (part.params?.type === "web_search" ? part.params.query : "");
    const links = presentation.kind === "web_search" ? presentation.links : [];
    const searchTitle = query ? t("searchingFor", { query }) : t("webSearch");
    return (
      <AgentToolCard
        variant="tool"
        surface={surface}
        body="plain"
        tone={failed ? "error" : "default"}
        icon={getToolKindIcon("web_search")}
        title={searchTitle}
        titleTooltip={query || searchTitle}
        status={status}
        meta={
          links.length > 0 ? (
            <span className="text-[11px] text-muted-foreground">
              {t("resultCount", { count: links.length })}
            </span>
          ) : null
        }
      >
        <AgentToolWebSearchBody
          links={links}
          sourcesLabel={t("sources")}
          layoutKey={part.tool_call_id || part.name}
        />
      </AgentToolCard>
    );
  }

  if (presentation.kind === "web_fetch" || part.kind === "fetch") {
    const url = presentation.kind === "web_fetch"
      ? presentation.url
      : (part.params?.type === "fetch" ? part.params.url : "");
    const markdown = presentation.kind === "web_fetch" ? presentation.markdown : undefined;
    const text = presentation.kind === "web_fetch" ? presentation.text : undefined;
    const host = hostFromUrl(url) ?? url;
    return (
      <AgentToolCard
        variant="tool"
        surface={surface}
        body={failed || !markdown ? "panel" : "plain"}
        tone={failed ? "error" : "default"}
        icon={<SiteFavicon url={url} />}
        title={t("fetchUrl", { host })}
        titleTooltip={url}
        status={status}
      >
        {failed && text ? <AgentToolErrorBody text={text} /> : null}
        {!failed ? (
          <AgentToolWebFetchBody
            url={url}
            markdown={markdown}
            text={text}
          />
        ) : null}
        {failed && !text ? <AgentToolEmptyBody status={status} /> : null}
      </AgentToolCard>
    );
  }

  const statsMeta = diffStats
    ? <AgentToolDiffStats additions={diffStats.additions} deletions={diffStats.deletions} />
    : null;

  return (
    <AgentToolCard
      variant="tool"
      surface={surface}
      body={toolBodyForKind(presentation.kind)}
      tone={asSkill ? "skill" : failed ? "error" : "default"}
      icon={icon}
      title={title}
      titleTooltip={path ? `${title}\n${path}` : title}
      accessory={fileChip}
      status={status}
      meta={statsMeta}
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
      {presentation.kind === "empty" && path && part.kind === "read" ? (
        <AgentToolPathPreviewBody path={path} status={status} />
      ) : null}
      {presentation.kind === "empty" && !(path && part.kind === "read") ? (
        <AgentToolEmptyBody status={status} />
      ) : null}
    </AgentToolCard>
  );
}
