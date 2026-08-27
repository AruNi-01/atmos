"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, CheckCircle2, Circle, CircleDashed } from "lucide-react";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";
import { CopyButton } from "@/shared/components/code-block/copy-button";
import type { SearchHit, TodoItem, ToolInputRow } from "@/features/agent/lib/tool-results/parse-tool-result";
import { AgentToolFileGlyph } from "./AgentToolCard";
import { AgentToolCodePreview } from "./AgentToolCodePreview";

export function AgentToolInputRows({ rows }: { rows: ToolInputRow[] }) {
  const t = useTranslations("Agent.components.toolResults");
  if (rows.length === 0) return null;
  return (
    <div className="border-b border-border/40 px-3 py-2">
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
        {t("parameters")}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {rows.map((row) => (
          <React.Fragment key={row.key}>
            <dt className="font-mono text-muted-foreground">{row.key}</dt>
            <dd className="min-w-0 truncate font-mono text-foreground/80" title={row.value}>
              {row.value}
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
}

export function AgentToolSearchBody({ hits }: { hits: SearchHit[] }) {
  return (
    <ul className="max-h-72 overflow-auto py-1">
      {hits.map((hit, index) => (
        <li
          key={`${hit.path}:${hit.line ?? 0}:${index}`}
          className="flex items-baseline gap-2 px-3 py-1 text-[12px]"
        >
          <AgentToolFileGlyph path={hit.path} className="relative top-0.5" />
          <span className="min-w-0 truncate font-mono text-foreground/80" title={hit.path}>
            {hit.path}
          </span>
          {hit.line != null ? (
            <span className="shrink-0 font-mono text-muted-foreground">{hit.line}</span>
          ) : null}
          {hit.text ? (
            <span className="min-w-0 truncate font-mono text-muted-foreground" title={hit.text}>
              {hit.text}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function AgentToolFilesBody({ paths }: { paths: string[] }) {
  return (
    <ul className="max-h-72 overflow-auto py-1">
      {paths.map((path, index) => (
        <li key={`${path}-${index}`} className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
          <AgentToolFileGlyph path={path} />
          <span className="min-w-0 truncate font-mono text-foreground/80" title={path}>
            {path}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AgentToolMarkdownBody({ markdown }: { markdown: string }) {
  return (
    <div className="max-h-96 overflow-auto px-3 py-2">
      <MarkdownRenderer className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-2 [&_pre]:max-w-full [&_.not-prose]:my-2">
        {markdown}
      </MarkdownRenderer>
    </div>
  );
}

export function AgentToolJsonBody({ json }: { json: string }) {
  return <AgentToolCodePreview code={json} language="json" />;
}

export function AgentToolTextBody({ text }: { text: string }) {
  if (text.includes("\n") || text.length > 160) {
    return <AgentToolCodePreview code={text} language="plaintext" />;
  }
  return (
    <p className="px-3 py-2 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
      {text}
    </p>
  );
}

export function AgentToolErrorBody({ text }: { text: string }) {
  const t = useTranslations("Agent.components.toolResults");
  return (
    <div className="px-3 py-2 text-sm text-destructive">
      {text.trim() ? text : t("executionFailed")}
    </div>
  );
}

export function AgentToolTodosBody({ todos }: { todos: TodoItem[] }) {
  const t = useTranslations("Agent.components.toolResults");
  return (
    <ul className="space-y-1 px-3 py-2">
      {todos.map((todo, index) => {
        const status = todo.status.toLowerCase();
        const Icon = status === "completed"
          ? CheckCircle2
          : status === "in_progress" || status === "in-progress"
            ? CircleDashed
            : Circle;
        const label = status === "completed"
          ? t("todo.completed")
          : status === "in_progress" || status === "in-progress"
            ? t("todo.inProgress")
            : t("todo.pending");
        return (
          <li key={`${todo.content}-${index}`} className="flex items-start gap-2 text-sm">
            <Icon
              className={`mt-0.5 size-3.5 shrink-0 ${
                status === "completed" ? "text-green-500" : "text-muted-foreground"
              }`}
              aria-label={label}
            />
            <span className={status === "completed" ? "text-muted-foreground line-through" : "text-foreground"}>
              {todo.content}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function AgentToolMoveBody({ from, to }: { from: string; to: string }) {
  const t = useTranslations("Agent.components.toolResults");
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-[12px]">
      <span className="min-w-0 truncate font-mono text-foreground/80" title={from}>
        {from}
      </span>
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("to")} />
      <span className="min-w-0 truncate font-mono text-foreground/80" title={to}>
        {to}
      </span>
    </div>
  );
}

export function AgentToolDeleteBody({ path }: { path: string }) {
  const t = useTranslations("Agent.components.toolResults");
  return (
    <p className="px-3 py-2 text-sm text-muted-foreground">
      {t("deletedFileLabel", { path })}
    </p>
  );
}

export function AgentToolEmptyBody({ status }: { status?: string }) {
  const t = useTranslations("Agent.components.toolResults");
  const completed = (status ?? "").toLowerCase() === "completed";
  return (
    <p className="px-3 py-2 text-xs text-muted-foreground">
      {completed ? t("noOutput") : t("processing")}
    </p>
  );
}

export function AgentToolCopyAction({ text }: { text: string }) {
  if (!text) return null;
  return <CopyButton content={text} />;
}
