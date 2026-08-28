"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, CheckCircle2, Circle, CircleDashed } from "lucide-react";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";
import { CopyButton } from "@/shared/components/code-block/copy-button";
import {
  relativeDisplayPath,
  type SearchHit,
  type TodoItem,
  type ToolInputRow,
  type TreeEntry,
} from "@/features/agent/lib/tool-results/parse-tool-result";
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
  const grouped = new Map<string, SearchHit[]>();
  for (const hit of hits) {
    const list = grouped.get(hit.path) ?? [];
    list.push(hit);
    grouped.set(hit.path, list);
  }
  const paths = [...grouped.keys()];
  return (
    <ul className="max-h-72 overflow-auto py-1">
      {[...grouped.entries()].map(([path, pathHits]) => (
        <li key={path} className="px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-2 text-[12px]">
            <AgentToolFileGlyph path={path} />
            <span className="min-w-0 truncate font-mono text-foreground/80" title={path}>
              {relativeDisplayPath(path, paths)}
            </span>
          </div>
          <ul className="mt-0.5 space-y-0.5 pl-6">
            {pathHits.map((hit, index) => (
              <li
                key={`${path}:${hit.line ?? 0}:${index}`}
                className="flex min-w-0 items-baseline gap-2 font-mono text-[12px] text-muted-foreground"
              >
                {hit.line != null ? (
                  <span className="w-10 shrink-0 text-right tabular-nums">{hit.line}</span>
                ) : null}
                {hit.text ? (
                  <span className="min-w-0 truncate" title={hit.text}>
                    {hit.text}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export function AgentToolTreeBody({ entries }: { entries: TreeEntry[] }) {
  return (
    <ul className="max-h-96 overflow-auto py-1">
      {entries.map((entry, index) => (
        <li
          key={`${entry.indent}:${entry.name}:${index}`}
          className="flex min-w-0 items-center gap-2 py-0.5 pr-3 text-[12px]"
          style={{ paddingLeft: 12 + entry.indent * 8 }}
        >
          {entry.kind === "note" ? (
            <span className="truncate text-muted-foreground" title={entry.name}>
              {entry.name}
            </span>
          ) : (
            <>
              <AgentToolFileGlyph path={entry.name} isDir={entry.isDir} />
              <span
                className="min-w-0 truncate font-mono text-foreground/80"
                title={entry.name}
              >
                {entry.name}
              </span>
            </>
          )}
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
            {relativeDisplayPath(path, paths)}
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
