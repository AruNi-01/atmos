"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@workspace/ui";
import { useWikiContext } from "@/hooks/use-wiki-store";
import { extractHeadings, type Heading } from "./wiki-utils";

interface WikiTocProps {
  contextId: string;
}

/**
 * Notion-style floating TOC.
 * Collapsed: thin tick-mark bar on the right edge.
 * Hover: compact floating card with heading links, auto-sized with max-height scroll.
 */
export const WikiToc: React.FC<WikiTocProps> = ({ contextId }) => {
  const { activeContent } = useWikiContext(contextId);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const headings = useMemo(
    () => (activeContent ? extractHeadings(activeContent) : []),
    [activeContent]
  );

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

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => setIsHovered(false), 250);
  };

  if (headings.length === 0) return null;

  const activeIndex = headings.findIndex((h) => h.id === activeId);

  return (
    <div
      className="absolute right-2 top-[33%] z-30 flex items-start cursor-pointer"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Collapsed: tick-mark indicator, right-aligned so h3/h4 hierarchy is visible */}
      <div
        className={cn(
          "flex flex-col items-end gap-1.5 py-1 transition-opacity duration-200",
          isHovered ? "opacity-0" : "opacity-100"
        )}
      >
        {headings.map((h, i) => (
          <div
            key={h.id}
            className={cn(
              "rounded-full transition-all duration-150",
              h.level === 2
                ? "w-3 h-[3px]"
                : h.level === 3
                  ? "w-2 h-[2px]"
                  : "w-1 h-[2px]",
              i === activeIndex ? "bg-foreground" : "bg-muted-foreground/25"
            )}
          />
        ))}
      </div>

      {/* Expanded: floating card */}
      <div
        className={cn(
          "absolute right-0 top-0 w-52 rounded-lg border border-border bg-background/95 backdrop-blur-sm shadow-md transition-all duration-200 ease-in-out overflow-hidden",
          isHovered
            ? "opacity-100 translate-x-0 scale-100"
            : "opacity-0 translate-x-2 scale-[0.97] pointer-events-none"
        )}
      >
        <div className="max-h-[min(420px,60vh)] overflow-y-auto overscroll-contain py-2 px-1">
          {headings.map((h) => (
            <TocLink key={h.id} heading={h} isActive={activeId === h.id} />
          ))}
        </div>
      </div>
    </div>
  );
};

const TocLink: React.FC<{ heading: Heading; isActive: boolean }> = ({
  heading,
  isActive,
}) => {
  const paddingLeft = (heading.level - 2) * 12 + 8;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const root = document.getElementById("wiki-content-root");
    const el = root?.querySelector(`#${CSS.escape(heading.id)}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `#${heading.id}`);
    }
  };

  return (
    <a
      href={`#${heading.id}`}
      onClick={handleClick}
      className={cn(
        "group flex items-center gap-0 py-1.5 pr-2 text-[12.5px] leading-snug rounded-md transition-colors cursor-pointer",
        isActive
          ? "text-foreground font-medium"
          : "text-muted-foreground/70 hover:text-foreground"
      )}
      style={{ paddingLeft: `${paddingLeft}px` }}
    >
      {/* Left active indicator */}
      <span
        className={cn(
          "shrink-0 w-[2px] h-3.5 rounded-full mr-2 transition-colors",
          isActive ? "bg-primary" : "bg-transparent group-hover:bg-muted-foreground/20"
        )}
      />
      <span className="truncate">{heading.text}</span>
    </a>
  );
};
