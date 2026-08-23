"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@workspace/ui";

export const WORKSPACE_LIST_PAGE_SIZE = 10;

export function useWorkspaceListVisibleCount(
  total: number,
  resetKey?: string | null,
) {
  const [visibleCount, setVisibleCount] = useState(WORKSPACE_LIST_PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(WORKSPACE_LIST_PAGE_SIZE);
  }, [resetKey]);

  const canShowMore = visibleCount < total;
  const canShowLess = visibleCount > WORKSPACE_LIST_PAGE_SIZE;

  const showMore = useCallback(() => {
    setVisibleCount((current) =>
      Math.min(current + WORKSPACE_LIST_PAGE_SIZE, total),
    );
  }, [total]);

  const showLess = useCallback(() => {
    setVisibleCount((current) =>
      Math.max(current - WORKSPACE_LIST_PAGE_SIZE, WORKSPACE_LIST_PAGE_SIZE),
    );
  }, []);

  return {
    visibleCount,
    canShowMore,
    canShowLess,
    showMore,
    showLess,
  };
}

export function WorkspaceListShowMoreLess({
  canShowMore,
  canShowLess,
  onShowMore,
  onShowLess,
  className,
}: {
  canShowMore: boolean;
  canShowLess: boolean;
  onShowMore: () => void;
  onShowLess: () => void;
  className?: string;
}) {
  const t = useTranslations("AppShell.chrome.leftSidebarControls");

  if (!canShowMore && !canShowLess) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-1 py-1 text-[11px] text-muted-foreground",
        className,
      )}
    >
      {canShowMore ? (
        <button
          type="button"
          onClick={onShowMore}
          className="cursor-pointer hover:text-sidebar-foreground"
        >
          {t("showMore")}
        </button>
      ) : null}
      {canShowMore && canShowLess ? (
        <span className="text-muted-foreground/50" aria-hidden>
          |
        </span>
      ) : null}
      {canShowLess ? (
        <button
          type="button"
          onClick={onShowLess}
          className="cursor-pointer hover:text-sidebar-foreground"
        >
          {t("showLess")}
        </button>
      ) : null}
    </div>
  );
}
