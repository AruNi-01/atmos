"use client";

import React, { useState } from "react";
import { ChevronRight, Globe, XCircle } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  TextShimmer,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  getFileIconProps,
} from "@workspace/ui";
import { cn } from "@/shared/lib/utils";
import { hostFromUrl } from "@/features/agent/lib/tool-results/parse-tool-result";
import { activateCenterChromeTab } from "@/app-shell/center-stage-activate";
import { useCenterPaintContextId } from "@/app-shell/center-space/use-center-paint-context-id";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { useAgentChatCwd, useAgentChatPathRoots } from "../agent-chat-cwd-context";
import {
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
  className,
}: {
  path: string;
  line?: number;
  className?: string;
}) {
  const cwd = useAgentChatCwd();
  const roots = useAgentChatPathRoots();
  const paintContextId = useCenterPaintContextId();
  const openFile = useEditorStore((state) => state.openFile);
  const name = fileNameFromPath(path);
  const tooltip = displayAgentChatFilePath(path, cwd, roots);
  const openable = resolveAgentChatOpenableFile(path, cwd, roots);
  const chipClassName = cn(
    "inline-flex max-w-full min-w-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[12px] leading-4 text-foreground",
    openable ? "cursor-pointer hover:bg-muted/80" : "cursor-default",
    className,
  );

  const label = (
    <>
      <AgentToolFileGlyph path={path} className="size-3.5" />
      <span className="min-w-0 truncate">{name}</span>
    </>
  );

  const chip = openable ? (
    <button
      type="button"
      className={chipClassName}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!paintContextId) return;
        const contextId = paintContextId;
        const filePath = openable.path;
        const openLine = line ?? openable.line;
        queueMicrotask(() => {
          void openFile(filePath, contextId, { preview: false, line: openLine });
          activateCenterChromeTab(contextId, filePath, { placement: "focused" });
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

export function AgentToolCard({
  icon,
  title,
  titleTooltip,
  accessory,
  meta,
  actions,
  status,
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
  defaultOpen?: boolean;
  tone?: "default" | "skill" | "error";
  variant?: "tool" | "file";
  surface?: AgentToolSurface;
  body?: AgentToolBody;
  children?: React.ReactNode;
}) {
  const running = (status ?? "").toLowerCase() === "running";
  const failed = (status ?? "").toLowerCase() === "failed" || tone === "error";

  return (
    <Collapsible defaultOpen={defaultOpen} className="not-prose w-full min-w-0">
      <div className="flex min-w-0 items-center gap-1" data-tree-header>
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
              {running && typeof title === "string" ? (
                <TextShimmer as="span" duration={1} className="text-sm">
                  {title}
                </TextShimmer>
              ) : (
                title
              )}
            </span>
            {accessory ? <span className="min-w-0 shrink-0">{accessory}</span> : null}
            {meta ? <span className="shrink-0">{meta}</span> : null}
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
