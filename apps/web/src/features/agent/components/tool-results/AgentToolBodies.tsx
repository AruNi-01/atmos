"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, CheckCircle2, ChevronRight, Circle, CircleDashed } from "lucide-react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import {
  AvatarStack,
  Collapsible,
  CollapsibleTrigger,
} from "@workspace/ui";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";
import { CopyButton } from "@/shared/components/code-block/copy-button";
import { cn } from "@/shared/lib/utils";
import {
  hostFromUrl,
  relativeDisplayPath,
  type SearchHit,
  type TodoItem,
  type ToolInputRow,
  type TreeEntry,
  type WebResultLink,
} from "@/features/agent/lib/tool-results/parse-tool-result";
import { useDisplayToolPath } from "../agent-chat-cwd-context";
import { AgentTreeBranch } from "../AgentTreeBranch";
import { AgentToolFileGlyph, SiteFavicon } from "./AgentToolCard";
import { AgentToolCodePreview } from "./AgentToolCodePreview";

export function AgentToolInputRows({ rows }: { rows: ToolInputRow[] }) {
  const t = useTranslations("Agent.components.toolResults");
  const displayPath = useDisplayToolPath();
  if (rows.length === 0) return null;
  return (
    <div className="px-3 py-2">
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
        {t("parameters")}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {rows.map((row) => {
          const shown = displayPath(row.value);
          return (
            <React.Fragment key={row.key}>
              <dt className="font-mono text-muted-foreground">{row.key}</dt>
              <dd className="min-w-0 truncate font-mono text-foreground/80" title={row.value}>
                {shown}
              </dd>
            </React.Fragment>
          );
        })}
      </dl>
    </div>
  );
}

export function AgentToolWebSearchBody({
  links,
  sourcesLabel,
  layoutKey,
}: {
  links: WebResultLink[];
  sourcesLabel: string;
  layoutKey: string;
}) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  if (links.length === 0) return null;

  const stacked = links.slice(0, 5);
  const extra = links.length - stacked.length;

  return (
    <LayoutGroup id={layoutKey}>
      <Collapsible open={open} onOpenChange={setOpen} className="min-w-0">
        <AgentTreeBranch isFirst isLast>
          <div className="flex min-w-0 items-center gap-2" data-tree-header>
            <CollapsibleTrigger className="group inline-flex min-w-0 max-w-full items-center gap-1.5 py-0.5 text-left text-[13px] leading-5 text-muted-foreground hover:text-foreground">
              <span className="min-w-0 truncate">{sourcesLabel}</span>
              {!open ? (
                <span className="flex shrink-0 items-center gap-1">
                  <AvatarStack
                    size="xs"
                    variant="spring-tilt"
                    users={stacked.map((link) => ({
                      id: `${layoutKey}:${link.url}`,
                      name: hostFromUrl(link.url) ?? link.title,
                      content: <SiteFavicon url={link.url} className="size-4" />,
                    }))}
                  />
                  {extra > 0 ? (
                    <span className="text-[11px] text-muted-foreground">+{extra}</span>
                  ) : null}
                </span>
              ) : null}
              <ChevronRight
                className={cn(
                  "size-3.5 shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  open && "rotate-90",
                )}
              />
            </CollapsibleTrigger>
          </div>
          {open ? (
            <div className="pt-0.5">
              {links.map((link, index) => {
                const host = hostFromUrl(link.url) ?? link.url;
                const stackedIcon = index < stacked.length;
                return (
                  <AgentTreeBranch
                    key={link.url}
                    isFirst={index === 0}
                    isLast={index === links.length - 1}
                  >
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-tree-header
                      className="flex min-w-0 items-center gap-2 rounded-md py-1 pr-1.5 text-left leading-5 hover:bg-muted/50"
                      title={link.url}
                    >
                      <motion.div
                        layoutId={stackedIcon && !reduced ? `${layoutKey}:${link.url}` : undefined}
                        className="size-4 shrink-0"
                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <SiteFavicon url={link.url} className="size-4" />
                      </motion.div>
                      <motion.span
                        initial={reduced ? false : { opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: stackedIcon ? 0.12 : 0.04 * Math.min(index, 6) }}
                        className="min-w-0 flex-1 truncate text-[13px] text-foreground"
                      >
                        {link.title}
                      </motion.span>
                      <motion.span
                        initial={reduced ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2, delay: stackedIcon ? 0.16 : 0.04 * Math.min(index, 6) }}
                        className="max-w-[40%] shrink-0 truncate text-[12px] text-muted-foreground"
                      >
                        {host}
                      </motion.span>
                    </a>
                  </AgentTreeBranch>
                );
              })}
            </div>
          ) : null}
        </AgentTreeBranch>
      </Collapsible>
    </LayoutGroup>
  );
}

export function AgentToolWebFetchBody({
  url,
  markdown,
  text,
}: {
  url: string;
  markdown?: string;
  text?: string;
}) {
  if (!markdown && !text) return null;
  return (
    <div>
      {markdown ? (
        <div className="max-h-96 overflow-auto px-3 py-2">
          <MarkdownRenderer className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-2 [&_pre]:max-w-full [&_.not-prose]:my-2">
            {markdown}
          </MarkdownRenderer>
        </div>
      ) : (
        <AgentToolTextBody text={text ?? ""} />
      )}
      <p className="truncate px-3 pb-2 text-[11px] text-muted-foreground" title={url}>
        {url}
      </p>
    </div>
  );
}

export function AgentToolSearchBody({ hits }: { hits: SearchHit[] }) {
  const displayPath = useDisplayToolPath();
  const grouped = new Map<string, SearchHit[]>();
  for (const hit of hits) {
    const list = grouped.get(hit.path) ?? [];
    list.push(hit);
    grouped.set(hit.path, list);
  }
  const paths = [...grouped.keys()];
  const displayedPaths = paths.map((item) => displayPath(item));
  return (
    <ul className="max-h-72 overflow-auto py-1">
      {[...grouped.entries()].map(([path, pathHits]) => (
        <li key={path} className="px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-2 text-[12px]">
            <AgentToolFileGlyph path={path} />
            <span className="min-w-0 truncate font-mono text-foreground/80" title={path}>
              {relativeDisplayPath(displayPath(path), displayedPaths)}
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
  const displayPath = useDisplayToolPath();
  return (
    <ul className="max-h-96 overflow-auto py-1">
      {entries.map((entry, index) => {
        const shown = displayPath(entry.name);
        return (
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
                  {shown}
                </span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function AgentToolFilesBody({ paths }: { paths: string[] }) {
  const displayPath = useDisplayToolPath();
  const displayedPaths = paths.map((item) => displayPath(item));
  return (
    <ul className="max-h-72 overflow-auto py-1">
      {paths.map((path, index) => (
        <li key={`${path}-${index}`} className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
          <AgentToolFileGlyph path={path} />
          <span className="min-w-0 truncate font-mono text-foreground/80" title={path}>
            {relativeDisplayPath(displayPath(path), displayedPaths)}
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
    return <AgentToolCodePreview code={text} language="plaintext" className="bg-transparent" />;
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
  const displayPath = useDisplayToolPath();
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-[12px]">
      <span className="min-w-0 truncate font-mono text-foreground/80" title={from}>
        {displayPath(from)}
      </span>
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("to")} />
      <span className="min-w-0 truncate font-mono text-foreground/80" title={to}>
        {displayPath(to)}
      </span>
    </div>
  );
}

export function AgentToolDeleteBody({ path }: { path: string }) {
  const t = useTranslations("Agent.components.toolResults");
  const displayPath = useDisplayToolPath();
  return (
    <p className="px-3 py-2 text-sm text-muted-foreground">
      {t("deletedFileLabel", { path: displayPath(path) })}
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
