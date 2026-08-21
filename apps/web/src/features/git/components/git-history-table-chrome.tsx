"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib/utils";
import { HISTORY_HEADER_HEIGHT } from "@/features/git/lib/git-history-graph";
import {
  HISTORY_RESIZE_COLUMNS,
  historyTableWidth,
  type HistoryColumnId,
  type HistoryColumnWidths,
} from "@/features/git/lib/git-history-columns";

export function GitHistoryTableHeader({
  columns,
  gridTemplate,
}: {
  columns: HistoryColumnWidths;
  gridTemplate: string;
}) {
  const t = useTranslations("git.history");
  return (
    <div
      className="sticky top-0 z-20 grid items-center border-b border-border/50 bg-background text-[10.5px] font-medium text-muted-foreground"
      style={{
        height: HISTORY_HEADER_HEIGHT,
        width: historyTableWidth(columns),
        gridTemplateColumns: gridTemplate,
      }}
    >
      {HISTORY_RESIZE_COLUMNS.map((id) => (
        <div key={id} className="min-w-0 px-1.5">
          <span className="block truncate">{t(`columns.${id}`)}</span>
        </div>
      ))}
      <div className="min-w-0 px-1.5">
        <span className="block truncate">{t("columns.commit")}</span>
      </div>
    </div>
  );
}

export function ColumnResizeHandle({
  column,
  width,
  left,
  height,
  label,
  onResize,
}: {
  column: HistoryColumnId;
  width: number;
  left: number;
  height: number;
  label: string;
  onResize: (id: HistoryColumnId, nextWidth: number) => void;
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [active, setActive] = useState(false);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      style={{ left, height: Math.max(height, HISTORY_HEADER_HEIGHT) }}
      className={cn(
        "absolute top-0 w-2.5 -translate-x-1/2 cursor-col-resize touch-none select-none",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:transition-colors",
        active
          ? "after:bg-foreground/45"
          : "after:bg-transparent hover:after:bg-foreground/35",
      )}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        drag.current = { x: event.clientX, width };
        setActive(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        onResize(column, drag.current.width + event.clientX - drag.current.x);
      }}
      onPointerUp={(event) => {
        drag.current = null;
        setActive(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={() => {
        drag.current = null;
        setActive(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onResize(column, width - 16);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          onResize(column, width + 16);
        }
      }}
    />
  );
}

