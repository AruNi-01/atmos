"use client";

import React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/shared/lib/utils";

type GithubListPaginationProps = {
  page: number;
  hasMore: boolean;
  onPageChange: (page: number) => void;
  /** Accessible / tooltip label for previous control */
  previousLabel?: string;
  /** Accessible / tooltip label for next control */
  nextLabel?: string;
  className?: string;
};

/** Min width (px) to show neighbor page numbers + optional ellipsis. */
const FULL_LAYOUT_MIN_WIDTH = 168;

/**
 * GitHub sidebar list pagination.
 * - Enough width: prev + neighbor pages + current + next (+ ellipsis when hasMore)
 * - Narrow width: prev + current page only + next (no horizontal overflow)
 * - Prev/next are borderless icon buttons
 */
export function GithubListPagination({
  page,
  hasMore,
  onPageChange,
  previousLabel = "Previous",
  nextLabel = "Next",
  className,
}: GithubListPaginationProps) {
  const rootRef = React.useRef<HTMLElement>(null);
  const [compact, setCompact] = React.useState(false);

  React.useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const update = (width: number) => {
      setCompact(width > 0 && width < FULL_LAYOUT_MIN_WIDTH);
    };

    update(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.clientWidth;
      update(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (page === 1 && !hasMore) return null;

  const canPrev = page > 1;
  const canNext = hasMore;

  // Full layout: previous page, current, next page when available.
  const pages = compact
    ? [page]
    : [page - 1, page, ...(hasMore ? [page + 1] : [])].filter((value) => value >= 1);

  const showEllipsis = !compact && hasMore;

  return (
    <nav
      ref={rootRef}
      role="navigation"
      aria-label="pagination"
      className={cn(
        "mt-3 flex w-full min-w-0 max-w-full items-center justify-center overflow-hidden pb-2",
        className,
      )}
    >
      <div className="flex min-w-0 max-w-full items-center gap-0.5">
        <button
          type="button"
          aria-label={previousLabel}
          disabled={!canPrev}
          onClick={() => onPageChange(page - 1)}
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-md border-0 bg-transparent transition-colors",
            canPrev
              ? "cursor-pointer text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              : "cursor-not-allowed text-muted-foreground/30",
          )}
        >
          <ChevronLeft className="size-3.5" />
        </button>

        {pages.map((value) => {
          const isActive = page === value;
          return (
            <button
              key={value}
              type="button"
              aria-label={`Page ${value}`}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onPageChange(value)}
              className={cn(
                "inline-flex size-7 shrink-0 items-center justify-center rounded-md font-mono text-[11px] tabular-nums transition-colors",
                isActive
                  ? "bg-sidebar-accent font-semibold text-foreground"
                  : "cursor-pointer text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              {value}
            </button>
          );
        })}

        {showEllipsis ? (
          <span
            aria-hidden
            className="inline-flex size-7 shrink-0 items-center justify-center text-muted-foreground/60"
          >
            <MoreHorizontal className="size-3.5" />
          </span>
        ) : null}

        <button
          type="button"
          aria-label={nextLabel}
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-md border-0 bg-transparent transition-colors",
            canNext
              ? "cursor-pointer text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              : "cursor-not-allowed text-muted-foreground/30",
          )}
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </nav>
  );
}
