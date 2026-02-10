"use client";

import React, { useEffect, useState } from "react";
import { ScrollArea } from "@workspace/ui";
import { useWikiContext } from "@/hooks/use-wiki-store";
import { extractHeadings, type Heading } from "./wiki-utils";

interface WikiTocProps {
  contextId: string;
}

export const WikiToc: React.FC<WikiTocProps> = ({ contextId }) => {
  const { activeContent } = useWikiContext(contextId);
  const [activeId, setActiveId] = useState<string | null>(null);

  const headings = activeContent ? extractHeadings(activeContent) : [];

  useEffect(() => {
    if (headings.length === 0) {
      setActiveId(null);
      return;
    }

    const root = document.getElementById("wiki-content-root");
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id || null);
            break;
          }
        }
      },
      { root: null, rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );

    headings.forEach((h) => {
      const el = root.querySelector(`#${CSS.escape(h.id)}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) {
    return (
      <div className="flex flex-col h-full bg-background border-l border-border">
        <div className="px-3 py-2 border-b border-border shrink-0">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            On this page
          </span>
        </div>
        <div className="p-3 text-xs text-muted-foreground">No headings</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      <div className="px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          On this page
        </span>
      </div>
      <ScrollArea className="flex-1">
        <nav className="py-2 px-3 space-y-0.5">
          {headings.map((h) => (
            <TocLink key={h.id} heading={h} isActive={activeId === h.id} />
          ))}
        </nav>
      </ScrollArea>
    </div>
  );
};

const TocLink: React.FC<{ heading: Heading; isActive: boolean }> = ({
  heading,
  isActive,
}) => {
  const paddingLeft = (heading.level - 2) * 10;

  return (
    <a
      href={`#${heading.id}`}
      className={`block py-1 text-xs rounded-sm transition-colors truncate ${
        isActive
          ? "text-foreground font-medium"
          : "text-muted-foreground hover:text-foreground"
      }`}
      style={{ paddingLeft: `${paddingLeft}px` }}
    >
      {heading.text}
    </a>
  );
};
