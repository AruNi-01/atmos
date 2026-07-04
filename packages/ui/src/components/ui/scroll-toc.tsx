"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "../../lib/utils";
import "./scroll-toc.css";

export interface ScrollTocItem {
  id: string;
  label: React.ReactNode;
  index?: React.ReactNode;
}

export interface ScrollTocProps extends React.ComponentPropsWithoutRef<"div"> {
  items: ScrollTocItem[];
  activeId?: string | null;
  onItemClick?: (item: ScrollTocItem, index: number) => void;
  height?: string | number;
  width?: string | number;
}

function smoothScrollTo(container: HTMLElement, targetTop: number, duration = 600) {
  const start = container.scrollTop;
  const distance = targetTop - start;
  if (Math.abs(distance) < 1) return;
  let startTime: number | null = null;

  const ease = (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const step = (timestamp: number) => {
    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);
    container.scrollTop = start + distance * ease(progress);
    if (progress < 1) requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}

function ScrollToc({
  items,
  activeId,
  onItemClick,
  height = 400,
  width = 300,
  className,
  style,
  ...props
}: ScrollTocProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [scrollingLabelId, setScrollingLabelId] = useState<string | null>(null);
  const labelOverflows = useRef<Map<string, { overflow: number; duration: number }>>(new Map());

  const handleLabelEnter = useCallback((id: string, labelEl: HTMLSpanElement) => {
    if (labelEl.scrollWidth <= labelEl.clientWidth) return;
    const hoverShift = 25;
    const overflow = labelEl.scrollWidth - labelEl.clientWidth + hoverShift + 4;
    const duration = Math.max(3, overflow / 15);
    labelOverflows.current.set(id, { overflow, duration });
    setScrollingLabelId(id);
  }, []);

  const handleLabelLeave = useCallback(() => {
    setScrollingLabelId(null);
  }, []);

  const scrollToActive = useCallback((id: string) => {
    const container = scrollerRef.current;
    if (!container) return;
    const el = itemRefs.current.get(id);
    if (!el) return;

    const containerH = container.clientHeight;
    const elTop = el.offsetTop;
    const elH = el.offsetHeight;
    const targetScroll = elTop - containerH / 2 + elH / 2;
    smoothScrollTo(container, targetScroll);
  }, []);

  useEffect(() => {
    if (activeId) scrollToActive(activeId);
  }, [activeId, scrollToActive]);

  return (
    <div
      className={cn("scroll-toc-wrapper-mask", className)}
      style={style}
      {...props}
    >
      <div
        ref={scrollerRef}
        className="scroll-toc-scroller-mask scroll-toc-scroller"
        style={{
          height: typeof height === "number" ? `${height}px` : height,
          width: typeof width === "number" ? `${width}px` : width,
        }}
      >
        {items.map((item, idx) => (
          <div
            className="scroll-toc-child"
            key={item.id}
            data-active={activeId === item.id || undefined}
            ref={(el) => {
              if (el) itemRefs.current.set(item.id, el);
              else itemRefs.current.delete(item.id);
            }}
            onClick={() => onItemClick?.(item, idx)}
          >
            <div
              className={cn(
                "scroll-toc-label",
                scrollingLabelId === item.id && "scroll-toc-label-scrolling"
              )}
              style={
                scrollingLabelId === item.id && labelOverflows.current.has(item.id)
                  ? {
                      "--scroll-toc-label-overflow": `-${labelOverflows.current.get(item.id)!.overflow}px`,
                      "--scroll-toc-label-duration": `${labelOverflows.current.get(item.id)!.duration}s`,
                    } as React.CSSProperties
                  : undefined
              }
              onMouseEnter={(e) => handleLabelEnter(item.id, e.currentTarget)}
              onMouseLeave={handleLabelLeave}
            >
              <span className="scroll-toc-label-inner">
                <span className="scroll-toc-item-index">{item.index ?? idx + 1}</span>
                {item.label}
              </span>
            </div>
            <span className="scroll-toc-top-marker" />
            <span className="scroll-toc-bottom-marker" />
            <div className="scroll-toc-primary-marker" />
          </div>
        ))}
      </div>
    </div>
  );
}

export { ScrollToc };
