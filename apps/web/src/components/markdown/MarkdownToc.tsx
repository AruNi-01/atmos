"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { cn } from "@workspace/ui";
import BananaSlug from "github-slugger";

export interface TocHeading {
  level: 2 | 3 | 4;
  text: string;
  id: string;
}

export function extractTocHeadings(markdown: string): TocHeading[] {
  const headings: TocHeading[] = [];
  const slugger = new BananaSlug();
  const regex = /^(#{2,4})\s+(.+)$/gm;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const level = match[1].length as 2 | 3 | 4;
    const text = match[2].trim();
    const id = slugger.slug(text);
    headings.push({ level, text, id });
  }
  return headings;
}

interface TocNode {
  heading: TocHeading;
  children: TocNode[];
}

function buildTocTree(headings: TocHeading[]): TocNode[] {
  const root: TocNode[] = [];
  const stack: TocNode[] = [];

  for (const h of headings) {
    const node: TocNode = { heading: h, children: [] };

    while (stack.length > 0 && stack[stack.length - 1].heading.level >= h.level) {
      stack.pop();
    }

    if (stack.length > 0) {
      stack[stack.length - 1].children.push(node);
    } else {
      root.push(node);
    }

    stack.push(node);
  }

  return root;
}

interface MarkdownTocProps {
  markdown: string;
  scrollContainerId: string;
}

export const MarkdownToc: React.FC<MarkdownTocProps> = ({
  markdown,
  scrollContainerId,
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const headings = useMemo(() => extractTocHeadings(markdown), [markdown]);
  const tree = useMemo(() => buildTocTree(headings), [headings]);

  useEffect(() => {
    if (headings.length === 0) {
      setActiveId(null);
      return;
    }

    const root = document.getElementById(scrollContainerId);
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
  }, [headings, scrollContainerId]);

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
      className="absolute right-2 top-16 z-30 flex items-start cursor-pointer"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Collapsed: tick-mark indicator */}
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
          <TocNodeList
            nodes={tree}
            activeId={activeId}
            scrollContainerId={scrollContainerId}
            depth={0}
          />
        </div>
      </div>
    </div>
  );
};

const TocNodeList: React.FC<{
  nodes: TocNode[];
  activeId: string | null;
  scrollContainerId: string;
  depth: number;
}> = ({ nodes, activeId, scrollContainerId, depth }) => {
  if (nodes.length === 0) return null;

  const content = nodes.map((node) => (
    <div key={node.heading.id}>
      <TocLink
        heading={node.heading}
        isActive={activeId === node.heading.id}
        scrollContainerId={scrollContainerId}
        depth={depth}
      />
      {node.children.length > 0 && (
        <div className="relative ml-[17px]">
          <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />
          <TocNodeList
            nodes={node.children}
            activeId={activeId}
            scrollContainerId={scrollContainerId}
            depth={depth + 1}
          />
        </div>
      )}
    </div>
  ));

  return <>{content}</>;
};

const TocLink: React.FC<{
  heading: TocHeading;
  isActive: boolean;
  scrollContainerId: string;
  depth: number;
}> = ({ heading, isActive, scrollContainerId, depth }) => {
  const textRef = useRef<HTMLSpanElement>(null);
  const animRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startScroll = useCallback(() => {
    const el = textRef.current;
    if (!el) return;

    const overflow = el.scrollWidth - el.clientWidth;
    if (overflow <= 0) return;

    el.scrollLeft = 0;
    timeoutRef.current = setTimeout(() => {
      const duration = overflow * 40;
      const startTime = performance.now();

      const step = (now: number) => {
        const progress = Math.min((now - startTime) / duration, 1);
        el.scrollLeft = overflow * progress;
        if (progress < 1) {
          animRef.current = requestAnimationFrame(step);
        }
      };
      animRef.current = requestAnimationFrame(step);
    }, 400);
  }, []);

  const stopScroll = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    const el = textRef.current;
    if (el) el.scrollLeft = 0;
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const root = document.getElementById(scrollContainerId);
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
      onMouseEnter={startScroll}
      onMouseLeave={stopScroll}
      className={cn(
        "group flex items-center py-1.5 pr-2 text-[12.5px] leading-snug rounded-md transition-colors cursor-pointer",
        isActive
          ? "text-foreground font-medium"
          : "text-muted-foreground/70 hover:text-foreground"
      )}
      style={{ paddingLeft: `${depth > 0 ? 8 : 8}px` }}
    >
      <span
        className={cn(
          "shrink-0 w-[2px] h-3.5 rounded-full mr-2 transition-colors",
          isActive
            ? "bg-primary"
            : "bg-transparent group-hover:bg-muted-foreground/20"
        )}
      />
      <span
        ref={textRef}
        className="overflow-hidden whitespace-nowrap"
      >
        {heading.text}
      </span>
    </a>
  );
};
