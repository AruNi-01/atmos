"use client";

import React, { useEffect, useRef } from "react";
import { ScrollArea } from "@workspace/ui";
import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer";
import { useWikiContext } from "@/hooks/use-wiki-store";
import { parseFrontmatter } from "./wiki-utils";

interface WikiContentProps {
  contextId: string;
}

export const WikiContent: React.FC<WikiContentProps> = ({ contextId }) => {
  const { activeContent, activePage, contentLoading } = useWikiContext(contextId);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "instant" });
  }, [activePage]);

  if (contentLoading && !activeContent) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading page...
      </div>
    );
  }

  if (!activeContent) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Select a page from the sidebar
      </div>
    );
  }

  const { frontmatter, body } = parseFrontmatter(activeContent);
  const title = (frontmatter.title as string) ?? activePage ?? "Untitled";
  const sources = (frontmatter.sources as string[]) ?? [];

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <div className="shrink-0 px-4 py-2 border-b border-border bg-muted/20">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {sources.map((src) => (
              <span
                key={src}
                className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono"
              >
                {src}
              </span>
            ))}
          </div>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div ref={topRef} />
        <div id="wiki-content-root" className="px-6 py-6">
          <MarkdownRenderer>{body}</MarkdownRenderer>
        </div>
      </ScrollArea>
    </div>
  );
};
