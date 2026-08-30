"use client";

import React from "react";
import { cn } from "@/shared/lib/utils";
import { MarkdownCodeBlock } from "@/shared/components/markdown/MarkdownRenderer";
import {
  useAgentChatResolvedPathKind,
  useOpenAgentChatWorkspacePath,
} from "@/features/agent/hooks/use-open-agent-chat-path";
import type { AgentChatWorkspaceFileRef } from "@/features/agent/lib/agent-chat-file-links";

const clickablePathClassName =
  "cursor-pointer underline-offset-4 decoration-dashed decoration-foreground/45 hover:underline";

export function AgentChatMarkdownFileChip({
  raw,
  path,
  line,
  className,
}: {
  raw: string;
  path: string;
  line?: number;
  className?: string;
}) {
  const kind = useAgentChatResolvedPathKind(path);
  const openWorkspacePath = useOpenAgentChatWorkspacePath();
  if (kind !== "file" && kind !== "directory") {
    return <MarkdownCodeBlock className={className}>{raw}</MarkdownCodeBlock>;
  }
  return (
    <code
      role="link"
      tabIndex={0}
      className={cn(
        className,
        "rounded bg-zinc-100 px-1.5 py-0.5 text-[13px] text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
        clickablePathClassName,
      )}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void openWorkspacePath(path, {
          line,
          isDir: kind === "directory",
        });
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        void openWorkspacePath(path, {
          line,
          isDir: kind === "directory",
        });
      }}
    >
      {raw}
    </code>
  );
}

export function AgentChatMarkdownFileLink({
  file,
  href,
  children,
  className,
  ...rest
}: {
  file: AgentChatWorkspaceFileRef;
  href?: string;
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<"a">, "href">) {
  const kind = useAgentChatResolvedPathKind(file.path);
  const openWorkspacePath = useOpenAgentChatWorkspacePath();
  if (kind !== "file" && kind !== "directory") {
    return <span>{children}</span>;
  }
  return (
    <a
      {...rest}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void openWorkspacePath(file.path, {
          line: file.line,
          isDir: kind === "directory",
        });
      }}
      className={cn(className, clickablePathClassName)}
    >
      {children}
    </a>
  );
}
