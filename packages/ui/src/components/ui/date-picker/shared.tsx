"use client";

import { useContext, useEffect, useState } from "react";
import {
  Button as RACButton,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarStateContext,
  RangeCalendarStateContext,
} from "react-aria-components";
import type { CalendarCellRenderProps } from "react-aria-components";
import { CalendarDate, getLocalTimeZone } from "@internationalized/date";
import { cn } from "../../../lib/utils";

export function ChevronLeft16({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path
        d="M9 4L5.70711 7.29289C5.31658 7.68342 5.31658 8.31658 5.70711 8.70711L9 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ChevronRight16({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path
        d="M7 4L10.2929 7.29289C10.6834 7.68342 10.6834 8.31658 10.2929 8.70711L7 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function formatTriggerDate(date: CalendarDate, locale?: string) {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" }).format(
    date.toDate(getLocalTimeZone()),
  );
}

export function formatChipDate(date: CalendarDate, locale?: string) {
  if (locale?.toLowerCase().startsWith("zh")) {
    return `${date.year}/${String(date.month).padStart(2, "0")}/${String(date.day).padStart(2, "0")}`;
  }
  return `${String(date.day).padStart(2, "0")}/${String(date.month).padStart(2, "0")}/${date.year}`;
}

export function parseChipDate(text: string): CalendarDate | null {
  const trimmed = text.trim();
  const ymd = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(trimmed);
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  let year: number;
  let month: number;
  let day: number;
  if (ymd) {
    year = Number(ymd[1]);
    month = Number(ymd[2]);
    day = Number(ymd[3]);
  } else if (dmy) {
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
  } else {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new CalendarDate(year, month, day);
}

export function DayCell(props: CalendarCellRenderProps & { isRange: boolean }) {
  const {
    date,
    formattedDate,
    isSelected,
    isSelectionStart,
    isSelectionEnd,
    isHovered,
    isFocusVisible,
    isDisabled,
    isOutsideMonth,
    isRange,
  } = props;

  if (isOutsideMonth) {
    return <div className="size-8" />;
  }

  const dayOfWeek = date.toDate(getLocalTimeZone()).getDay();
  const isSingleDay = isRange ? isSelectionStart && isSelectionEnd : isSelected;
  const isEdge = isRange ? isSelectionStart || isSelectionEnd : isSelected;
  const extendLeft = isRange && isSelected && !isSelectionStart && dayOfWeek !== 0;
  const extendRight = isRange && isSelected && !isSelectionEnd && dayOfWeek !== 6;

  return (
    <div className="relative size-8">
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 bg-primary/15 transition-[opacity,border-radius] duration-100 ease-out",
          isSelectionStart ? "left-1/2" : extendLeft ? "-left-1.5" : "left-0",
          isSelectionEnd ? "right-1/2" : extendRight ? "-right-1.5" : "right-0",
          !isSelectionStart && dayOfWeek === 0 && "rounded-l-lg",
          !isSelectionEnd && dayOfWeek === 6 && "rounded-r-lg",
          isSelected && !isSingleDay ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        className={cn(
          "relative flex size-8 items-center justify-center rounded-lg outline-none",
          !isSelected && isHovered && "bg-accent",
          "transition-colors duration-100 ease-out",
          isFocusVisible && "ring-2 ring-inset ring-ring",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 bg-primary transition-[opacity,border-radius] duration-100 ease-out",
            isSingleDay && "rounded-lg",
            isSelectionStart && !isSingleDay && "rounded-l-lg",
            isSelectionEnd && !isSingleDay && "rounded-r-lg",
            isEdge ? "opacity-100" : "opacity-0",
          )}
        />
        <span
          className={cn(
            "relative text-sm",
            isEdge ? "text-primary-foreground" : "text-foreground",
            isDisabled && "text-muted-foreground",
          )}
        >
          {formattedDate}
        </span>
      </div>
    </div>
  );
}

export function MonthPanel({
  offset,
  showPrev,
  showNext,
  locale,
  bare = false,
  hideHeader = false,
}: {
  offset: number;
  showPrev?: boolean;
  showNext?: boolean;
  locale?: string;
  bare?: boolean;
  hideHeader?: boolean;
}) {
  const rangeState = useContext(RangeCalendarStateContext);
  const singleState = useContext(CalendarStateContext);
  const state = rangeState ?? singleState;
  const isRange = rangeState != null;
  const panelDate = state ? state.visibleRange.start.add({ months: offset }) : null;
  const title = panelDate
    ? new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
        panelDate.toDate(getLocalTimeZone()),
      )
    : "";

  return (
    <div
      className={
        bare
          ? "w-[296px] shrink-0"
          : "w-[326px] shrink-0 rounded-2xl bg-background p-[15px] shadow-xs"
      }
    >
      <div className="flex flex-col gap-5">
        {!hideHeader && (
          <div className="flex items-center justify-between">
            {showPrev ? (
              <RACButton
                slot="previous"
                className="flex size-4 cursor-pointer items-center justify-center rounded-[3px] text-muted-foreground outline-none transition-colors duration-150 ease-out hover:bg-accent"
              >
                <ChevronLeft16 />
              </RACButton>
            ) : (
              <span className="size-4" aria-hidden />
            )}
            <span className="flex-1 text-center text-sm text-foreground">{title}</span>
            {showNext ? (
              <RACButton
                slot="next"
                className="flex size-4 cursor-pointer items-center justify-center rounded-[3px] text-muted-foreground outline-none transition-colors duration-150 ease-out hover:bg-accent"
              >
                <ChevronRight16 />
              </RACButton>
            ) : (
              <span className="size-4" aria-hidden />
            )}
          </div>
        )}
        <CalendarGrid
          offset={{ months: offset }}
          weekdayStyle="short"
          className="-m-3 self-start border-separate outline-none"
          style={{ borderSpacing: "12px 12px" }}
        >
          <CalendarGridHeader>
            {(day) => (
              <CalendarHeaderCell className="size-6 pb-0 text-center text-sm text-muted-foreground">
                {/[A-Za-z]/.test(day) ? day.slice(0, 2) : day.replace(/星期|周/g, "").slice(-1)}
              </CalendarHeaderCell>
            )}
          </CalendarGridHeader>
          <CalendarGridBody>
            {(date) => (
              <CalendarCell date={date} className="p-0 outline-none">
                {(cellProps) => <DayCell {...cellProps} isRange={isRange} />}
              </CalendarCell>
            )}
          </CalendarGridBody>
        </CalendarGrid>
      </div>
    </div>
  );
}

export function DateChipInput({
  date,
  label,
  locale,
  onCommit,
}: {
  date: CalendarDate;
  label: string;
  locale?: string;
  onCommit: (date: CalendarDate) => void;
}) {
  const formatted = formatChipDate(date, locale);
  const [text, setText] = useState(formatted);

  useEffect(() => {
    setText(formatted);
  }, [formatted]);

  const commit = () => {
    const parsed = parseChipDate(text);
    if (parsed) {
      onCommit(parsed);
    } else {
      setText(formatted);
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") setText(formatted);
      }}
      aria-label={label}
      className="w-[104px] rounded-[10px] border border-input bg-background px-2 py-2 text-sm text-foreground shadow-xs outline-none transition-colors duration-100 ease-out focus-visible:border-ring"
    />
  );
}

export const triggerButtonClassName = cn(
  "inline-flex h-11 shrink-0 cursor-pointer items-center gap-0.5 rounded-xl border border-border/50 bg-muted/20 p-2 shadow-sm outline-none",
  "transition-[background-color,border-color,box-shadow] duration-150 ease-out",
  "hover:bg-background hover:border-border",
  "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring",
  "disabled:cursor-not-allowed disabled:opacity-64 disabled:shadow-none",
);

export const popoverClassName = cn(
  "origin-top rounded-3xl bg-popover text-popover-foreground shadow-lg",
  "transition duration-150 ease-out",
  "data-[entering]:opacity-0 data-[entering]:scale-95 data-[entering]:blur-[2px]",
  "data-[exiting]:opacity-0 data-[exiting]:scale-95 data-[exiting]:blur-[2px]",
);
