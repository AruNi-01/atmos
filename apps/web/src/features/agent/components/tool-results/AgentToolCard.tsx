"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronRight, Globe, XCircle } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  TextEffect,
  TextShimmer,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  getFileIconProps,
} from "@workspace/ui";
import { useReducedMotion } from "motion/react";
import { cn } from "@/shared/lib/utils";
import {
  TREE_CONTENT_DELAY_MS,
  TREE_EASE,
  shouldPlayTreeTitleEnter,
  treeTitleRevealMs,
} from "@/features/agent/lib/agent-tree-branch";
import type { DiffLineRange } from "@/features/agent/lib/tool-results/diff-stats";
import { hostFromUrl } from "@/features/agent/lib/tool-results/parse-tool-result";
import { useAgentChatCwd, useAgentChatPathRoots } from "../agent-chat-cwd-context";
import { useAgentTreeReveal } from "../agent-tree-reveal-context";
import {
  useAgentChatResolvedPathKind,
  useOpenAgentChatWorkspacePath,
} from "@/features/agent/hooks/use-open-agent-chat-path";
import {
  agentChatPathLooksLikeDirectory,
  displayAgentChatFilePath,
  resolveAgentChatOpenableFile,
} from "@/features/agent/lib/agent-chat-file-links";

export function siteFaviconUrl(url: string): string | null {
  const host = hostFromUrl(url);
  if (!host) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}

function faviconCandidates(url: string): string[] {
  const host = hostFromUrl(url);
  if (!host) return [];
  const google = siteFaviconUrl(url);
  return [
    `https://${host}/favicon.ico`,
    google,
    `https://icons.duckduckgo.com/ip3/${host}.ico`,
  ].filter((item): item is string => Boolean(item));
}

export function SiteFavicon({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  return <SiteFaviconInner key={url} url={url} className={className} />;
}

function SiteFaviconInner({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const candidates = faviconCandidates(url);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const src = candidates[index] ?? null;

  return (
    <span className={cn("relative flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[3px]", className)}>
      <Globe
        className={cn(
          "size-full text-muted-foreground",
          loaded && "hidden",
        )}
      />
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- Third-party favicons are tiny remote images.
        <img
          key={src}
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          className={cn(
            "absolute inset-0 size-full object-contain",
            !loaded && "opacity-0",
          )}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setIndex((current) => current + 1);
          }}
        />
      ) : null}
    </span>
  );
}

export function AgentToolFileGlyph({
  path,
  className,
  isDir = false,
}: {
  path: string;
  className?: string;
  isDir?: boolean;
}) {
  const name = path.split(/[\\/]/).pop() || path;
  const iconProps = getFileIconProps({
    name,
    isDir,
    className: cn("size-4 shrink-0", className),
  });
  return (
    // eslint-disable-next-line @next/next/no-img-element -- file icons are local UI asset descriptors from getFileIconProps
    <img {...iconProps} alt="" aria-hidden="true" />
  );
}

export function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

export function AgentToolFileChip({
  path,
  line,
  isDir: hintedIsDir,
  selectRanges,
  className,
}: {
  path: string;
  line?: number;
  isDir?: boolean;
  selectRanges?: DiffLineRange[];
  className?: string;
}) {
  const cwd = useAgentChatCwd();
  const roots = useAgentChatPathRoots();
  const openWorkspacePath = useOpenAgentChatWorkspacePath();
  const name = fileNameFromPath(path);
  const tooltip = displayAgentChatFilePath(path, cwd, roots);
  const openable = resolveAgentChatOpenableFile(path, cwd, roots);
  const resolvedKind = useAgentChatResolvedPathKind(hintedIsDir == null ? openable?.path : undefined);
  const isDir = hintedIsDir ?? (
    resolvedKind === "directory"
    || (resolvedKind === "pending" && agentChatPathLooksLikeDirectory(path))
  );
  const exists = hintedIsDir === true
    || resolvedKind === "file"
    || resolvedKind === "directory"
    || (resolvedKind === "pending" && !agentChatPathLooksLikeDirectory(path));
  const clickable = Boolean(openable) && exists;
  const chipClassName = cn(
    "inline-flex max-w-full min-w-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[12px] leading-4 text-foreground",
    clickable ? "cursor-pointer hover:bg-muted/80" : "cursor-default",
    className,
  );

  const label = (
    <>
      <AgentToolFileGlyph path={path} isDir={isDir} className="size-3.5" />
      <span className="min-w-0 truncate">{name}</span>
    </>
  );

  const chip = clickable ? (
    <button
      type="button"
      className={chipClassName}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void openWorkspacePath(path, {
          line,
          isDir: hintedIsDir ?? (
            resolvedKind === "directory" ? true : resolvedKind === "file" ? false : undefined
          ),
          selectRanges,
        });
      }}
    >
      {label}
    </button>
  ) : (
    <span className={chipClassName}>
      {label}
    </span>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent side="top" className="z-50 max-w-sm break-all font-mono text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export type AgentToolSurface = "card" | "plain";

export type AgentToolBody = "panel" | "plain";

function AgentTreeTitle({ text }: { text: string }) {
  const reduced = Boolean(useReducedMotion());
  const [snapshot, setSnapshot] = useState(text);
  const [done, setDone] = useState(reduced);

  useEffect(() => {
    if (!snapshot && text) setSnapshot(text);
  }, [snapshot, text]);

  useEffect(() => {
    if (done || reduced || !snapshot) return;
    const timer = window.setTimeout(() => setDone(true), treeTitleRevealMs(snapshot.length));
    return () => window.clearTimeout(timer);
  }, [done, reduced, snapshot]);

  if (reduced || done || !snapshot) return <>{text}</>;
  return (
    <TextEffect
      as="span"
      per="char"
      preset="fade"
      delay={TREE_CONTENT_DELAY_MS / 1000}
      speedReveal={2}
    >
      {snapshot}
    </TextEffect>
  );
}

function AgentTreeFade({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const skip = !enabled || Boolean(reduced);
  const [open, setOpen] = useState(skip);

  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => setOpen(true), TREE_CONTENT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (skip) return <>{children}</>;
  return (
    <span
      style={{
        opacity: open ? 1 : 0,
        transition: `opacity 280ms ${TREE_EASE}`,
      }}
    >
      {children}
    </span>
  );
}

export function AgentToolCard({
  icon,
  title,
  titleTooltip,
  accessory,
  meta,
  actions,
  status,
  shimmer,
  defaultOpen = false,
  tone = "default",
  variant = "tool",
  body = "plain",
  children,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  titleTooltip?: string;
  accessory?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  status?: string;
  shimmer?: boolean;
  defaultOpen?: boolean;
  tone?: "default" | "skill" | "error";
  variant?: "tool" | "file";
  surface?: AgentToolSurface;
  body?: AgentToolBody;
  children?: React.ReactNode;
}) {
  const running = (status ?? "").toLowerCase() === "running";
  const showShimmer = shimmer ?? running;
  const failed = (status ?? "").toLowerCase() === "failed" || tone === "error";
  const treeReveal = useAgentTreeReveal();
  // Running rows already show the label via shimmer; completing must not replay the enter.
  const seenTitle = useRef(!treeReveal || showShimmer);
  if (!treeReveal || showShimmer) seenTitle.current = true;
  const reveal = typeof title === "string"
    && shouldPlayTreeTitleEnter(treeReveal, showShimmer, seenTitle.current);

  return (
    // Keep `not-prose` on the chrome only — Tailwind Typography cannot nest
    // `.prose` inside `.not-prose`, so markdown bodies (plan.md preview, etc.)
    // must live outside that sandbox.
    <Collapsible defaultOpen={defaultOpen} className="w-full min-w-0">
      <div className="not-prose flex min-w-0 items-center gap-1" data-tree-header>
        <CollapsibleTrigger asChild>
          <div className="group inline-flex min-w-0 max-w-full cursor-pointer items-center gap-2 py-0.5 text-left text-sm leading-5 text-muted-foreground hover:text-foreground">
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center text-muted-foreground [&>svg]:size-3.5",
                variant === "file" && "[&>img]:size-3.5",
              )}
            >
              {icon}
            </span>
            <span
              className={cn(
                "min-w-0 truncate",
                variant === "file" && "font-mono text-[12px]",
                failed && "text-destructive",
              )}
              title={titleTooltip}
            >
              {reveal && typeof title === "string" ? (
                <AgentTreeTitle text={title} />
              ) : showShimmer && typeof title === "string" ? (
                <TextShimmer as="span" duration={1} className="text-sm">
                  {title}
                </TextShimmer>
              ) : (
                title
              )}
            </span>
            {accessory ? (
              <AgentTreeFade enabled={treeReveal}>
                <span className="min-w-0 shrink-0">{accessory}</span>
              </AgentTreeFade>
            ) : null}
            {meta ? (
              <AgentTreeFade enabled={treeReveal}>
                <span className="shrink-0">{meta}</span>
              </AgentTreeFade>
            ) : null}
            {failed ? <XCircle className="size-3.5 shrink-0 text-destructive" /> : null}
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-data-[state=open]:rotate-90" />
          </div>
        </CollapsibleTrigger>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <CollapsibleContent className="data-[state=open]:overflow-visible">
        {children ? (
          body === "panel" ? (
            <div data-tool-body="panel" className="mt-1 overflow-hidden rounded-md bg-muted/50">
              {children}
            </div>
          ) : (
            <div className="pt-1">{children}</div>
          )
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AgentToolDiffStats({
  additions,
  deletions,
}: {
  additions: number;
  deletions: number;
}) {
  if (additions <= 0 && deletions <= 0) return null;
  return (
    <span className="shrink-0 font-mono text-xs">
      {deletions > 0 ? <span className="text-red-500">-{deletions}</span> : null}
      {deletions > 0 && additions > 0 ? <span className="mx-1 text-muted-foreground">/</span> : null}
      {additions > 0 ? <span className="text-green-500">+{additions}</span> : null}
    </span>
  );
}

export function AgentToolFileChangeStats({
  additions,
  deletions,
}: {
  additions: number;
  deletions: number;
}) {
  if (additions <= 0 && deletions <= 0) return null;
  return (
    <span className="shrink-0 font-mono text-xs">
      {additions > 0 ? <span className="text-green-500">+{additions}</span> : null}
      {additions > 0 && deletions > 0 ? " " : null}
      {deletions > 0 ? <span className="text-red-500">-{deletions}</span> : null}
    </span>
  );
}
