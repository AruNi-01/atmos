"use client";

import { useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  Button as AriaButton,
  Dialog,
  DialogTrigger,
  I18nProvider,
  Popover,
  RangeCalendar,
} from "react-aria-components";
import {
  CalendarDate,
  endOfMonth,
  endOfYear,
  getLocalTimeZone,
  isSameDay,
  startOfMonth,
  startOfYear,
  today,
} from "@internationalized/date";
import { CalendarDays } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "../../../lib/utils";
import {
  DateChipInput,
  MonthPanel,
  formatTriggerDate,
  popoverClassName,
  triggerButtonClassName,
} from "./shared";
import { useDismissOnOutsidePress, useTriggerToggle } from "./use-dismiss-on-outside-press";

/** Adapted from Board UI DateRangePicker. Visual tokens mapped to Atmos; motion and layout match the source. */

export type DateRangeValue = {
  start: Date;
  end: Date;
};

export const DATE_RANGE_PRESET_IDS = [
  "today",
  "yesterday",
  "lastWeek",
  "thisMonth",
  "lastMonth",
  "thisYear",
  "lastYear",
  "allTime",
] as const;

export type DateRangePresetId = (typeof DATE_RANGE_PRESET_IDS)[number];

export type DateRangePickerLabels = {
  placeholder: string;
  cancel: string;
  apply: string;
  startDate: string;
  endDate: string;
  daysSelected: (count: number) => string;
  presets: Record<DateRangePresetId, string>;
};

const DEFAULT_LABELS: DateRangePickerLabels = {
  placeholder: "Select date range",
  cancel: "Cancel",
  apply: "Apply",
  startDate: "Start date",
  endDate: "End date",
  daysSelected: (count) => `${count} day${count === 1 ? "" : "s"} selected`,
  presets: {
    today: "Today",
    yesterday: "Yesterday",
    lastWeek: "Last week",
    thisMonth: "This month",
    lastMonth: "Last month",
    thisYear: "This year",
    lastYear: "Last year",
    allTime: "All time",
  },
};

type CalendarRange = {
  start: CalendarDate;
  end: CalendarDate;
};

export interface DateRangePickerProps {
  value?: DateRangeValue | null;
  defaultValue?: DateRangeValue | null;
  onChange?: (value: DateRangeValue | null) => void;
  isDisabled?: boolean;
  className?: string;
  "aria-label"?: string;
  placeholder?: string;
  locale?: string;
  labels?: Partial<DateRangePickerLabels> & {
    presets?: Partial<DateRangePickerLabels["presets"]>;
  };
  triggerRef?: RefObject<HTMLElement | null>;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

function dateToCalendarDate(date: Date): CalendarDate {
  return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function calendarDateToDate(date: CalendarDate): Date {
  return date.toDate(getLocalTimeZone());
}

function toCalendarRange(value: DateRangeValue | null | undefined): CalendarRange | null {
  if (!value) return null;
  const start = dateToCalendarDate(value.start);
  const end = dateToCalendarDate(value.end);
  return start.compare(end) <= 0 ? { start, end } : { start: end, end: start };
}

function fromCalendarRange(value: CalendarRange): DateRangeValue {
  return {
    start: calendarDateToDate(value.start),
    end: calendarDateToDate(value.end),
  };
}

function daysInRange(value: CalendarRange) {
  const tz = getLocalTimeZone();
  const ms = value.end.toDate(tz).getTime() - value.start.toDate(tz).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

function mergeLabels(
  labels?: DateRangePickerProps["labels"],
  placeholder?: string,
): DateRangePickerLabels {
  return {
    ...DEFAULT_LABELS,
    ...labels,
    placeholder: placeholder ?? labels?.placeholder ?? DEFAULT_LABELS.placeholder,
    presets: { ...DEFAULT_LABELS.presets, ...labels?.presets },
    daysSelected: labels?.daysSelected ?? DEFAULT_LABELS.daysSelected,
  };
}

function useQuickSelectPresets() {
  return useMemo(() => {
    const now = today(getLocalTimeZone());
    const lastMonth = now.subtract({ months: 1 });
    const lastYear = now.subtract({ years: 1 });
    return [
      { id: "today" as const, range: { start: now, end: now } },
      {
        id: "yesterday" as const,
        range: { start: now.subtract({ days: 1 }), end: now.subtract({ days: 1 }) },
      },
      {
        id: "lastWeek" as const,
        range: { start: now.subtract({ days: 7 }), end: now.subtract({ days: 1 }) },
      },
      { id: "thisMonth" as const, range: { start: startOfMonth(now), end: endOfMonth(now) } },
      {
        id: "lastMonth" as const,
        range: { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) },
      },
      { id: "thisYear" as const, range: { start: startOfYear(now), end: endOfYear(now) } },
      {
        id: "lastYear" as const,
        range: { start: startOfYear(lastYear), end: endOfYear(lastYear) },
      },
      { id: "allTime" as const, range: { start: now.subtract({ years: 10 }), end: now } },
    ];
  }, []);
}

function isPresetActive(value: CalendarRange | null, range: CalendarRange) {
  return !!value && isSameDay(value.start, range.start) && isSameDay(value.end, range.end);
}

/** Board UI Button medium (p-2, inner label px-1, press scale) with h-10 so the
 *  py-2 date chips can animate in without changing popover height. Colors mapped
 *  to Atmos tokens. */
function FooterButton({
  variant,
  disabled,
  onClick,
  children,
}: {
  variant: "primary" | "secondary";
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-0.5 overflow-hidden whitespace-nowrap rounded-[10px] p-2 text-sm select-none outline-none",
        "transition-[transform,background-color,border-color,box-shadow] duration-150 ease-out",
        "active:scale-[0.97]",
        "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-64 disabled:shadow-none",
        variant === "primary"
          ? "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90"
          : "border border-input bg-background text-foreground shadow-xs hover:border-input hover:bg-accent",
      )}
    >
      <span className="inline-flex shrink-0 items-center justify-center px-1">{children}</span>
    </button>
  );
}

function QuickSelect({
  value,
  labels,
  onSelect,
}: {
  value: CalendarRange | null;
  labels: DateRangePickerLabels;
  onSelect: (range: CalendarRange) => void;
}) {
  const presets = useQuickSelectPresets();

  return (
    <div className="flex w-[118px] shrink-0 flex-col gap-1.5">
      {presets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => onSelect(preset.range)}
          className={cn(
            "w-full cursor-pointer rounded-[10px] px-2 py-1.5 text-left text-sm text-foreground transition-colors duration-150 ease-out",
            isPresetActive(value, preset.range) ? "bg-muted" : "hover:bg-accent",
          )}
        >
          {labels.presets[preset.id]}
        </button>
      ))}
    </div>
  );
}

function Footer({
  value,
  labels,
  locale,
  onChange,
  onCancel,
  onApply,
}: {
  value: CalendarRange | null;
  labels: DateRangePickerLabels;
  locale?: string;
  onChange: (value: CalendarRange) => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  return (
    <div className="flex items-center justify-between pt-3 pr-4">
      <div className="flex items-center gap-2.5">
        <AnimatePresence>
          {value && (
            <motion.div
              key="range-summary"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25, ease: [0.34, 1.2, 0.64, 1] }}
              className="flex items-center gap-2.5"
            >
              <div className="flex items-center gap-[5px]">
                <DateChipInput
                  date={value.start}
                  label={labels.startDate}
                  locale={locale}
                  onCommit={(start) =>
                    onChange({ start, end: start.compare(value.end) > 0 ? start : value.end })
                  }
                />
                <span className="text-sm text-muted-foreground">-</span>
                <DateChipInput
                  date={value.end}
                  label={labels.endDate}
                  locale={locale}
                  onCommit={(end) =>
                    onChange({ start: end.compare(value.start) < 0 ? end : value.start, end })
                  }
                />
              </div>
              <span className="rounded-xl bg-muted px-2 py-2 text-sm text-muted-foreground">
                {labels.daysSelected(daysInRange(value))}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-2.5">
        <FooterButton variant="secondary" onClick={onCancel}>
          {labels.cancel}
        </FooterButton>
        <FooterButton variant="primary" onClick={onApply} disabled={!value}>
          {labels.apply}
        </FooterButton>
      </div>
    </div>
  );
}

function DateRangeCalendar({
  value,
  onChange,
  locale,
  labels,
  ariaLabel,
  onCancel,
  onApply,
}: {
  value: CalendarRange | null;
  onChange: (value: CalendarRange | null) => void;
  locale?: string;
  labels: DateRangePickerLabels;
  ariaLabel: string;
  onCancel: () => void;
  onApply: () => void;
}) {
  return (
    <I18nProvider locale={locale}>
      <RangeCalendar
        aria-label={ariaLabel}
        visibleDuration={{ months: 2 }}
        value={value}
        onChange={(range) => {
          if (!range?.start || !range.end) {
            onChange(null);
            return;
          }
          onChange({
            start: new CalendarDate(range.start.year, range.start.month, range.start.day),
            end: new CalendarDate(range.end.year, range.end.month, range.end.day),
          });
        }}
      >
        <div className="flex gap-3">
          <div className="pt-4 pl-4">
            <QuickSelect value={value} labels={labels} onSelect={onChange} />
          </div>
          <div className="flex flex-col pt-2 pr-2 pb-3">
            <div className="flex gap-2">
              <MonthPanel offset={0} showPrev locale={locale} />
              <MonthPanel offset={1} showNext locale={locale} />
            </div>
            <Footer
              value={value}
              labels={labels}
              locale={locale}
              onChange={onChange}
              onCancel={onCancel}
              onApply={onApply}
            />
          </div>
        </div>
      </RangeCalendar>
    </I18nProvider>
  );
}

/** @deprecated Prefer DateRangePicker; kept for callers that embed the calendar without a trigger. */
export function DateRangePickerPanel({
  value,
  onApply,
  onCancel,
  locale,
  labels,
}: {
  value: DateRangeValue | null;
  onApply: (value: DateRangeValue | null) => void;
  onCancel: () => void;
  locale?: string;
  labels: DateRangePickerLabels;
  className?: string;
}) {
  const committedRange = toCalendarRange(value);
  const [pendingValue, setPendingValue] = useState<CalendarRange | null>(committedRange);

  return (
    <DateRangeCalendar
      value={pendingValue}
      onChange={setPendingValue}
      locale={locale}
      labels={labels}
      ariaLabel={labels.placeholder}
      onCancel={() => {
        setPendingValue(committedRange);
        onCancel();
      }}
      onApply={() => onApply(pendingValue ? fromCalendarRange(pendingValue) : null)}
    />
  );
}

export function DateRangePicker({
  value,
  defaultValue = null,
  onChange,
  isDisabled,
  className,
  "aria-label": ariaLabel = "Date range",
  placeholder,
  locale,
  labels: labelsProp,
  triggerRef: externalTriggerRef,
  isOpen: controlledIsOpen,
  onOpenChange: controlledOnOpenChange,
}: DateRangePickerProps) {
  const labels = mergeLabels(labelsProp, placeholder);
  const ownTriggerRef = useRef<HTMLButtonElement>(null);
  const triggerRef = externalTriggerRef ?? ownTriggerRef;
  const isExternal = externalTriggerRef !== undefined;
  const popoverRef = useRef<HTMLElement>(null);

  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isExternal ? (controlledIsOpen ?? false) : internalOpen;
  const setIsOpen = isExternal ? (controlledOnOpenChange ?? (() => {})) : setInternalOpen;

  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<DateRangeValue | null>(defaultValue);
  const committedValue = isControlled ? (value ?? null) : internalValue;
  const committedRange = toCalendarRange(committedValue);
  const [pendingValue, setPendingValue] = useState<CalendarRange | null>(committedRange);

  const commit = (next: CalendarRange | null) => {
    const mapped = next ? fromCalendarRange(next) : null;
    if (!isControlled) setInternalValue(mapped);
    onChange?.(mapped);
  };

  const allowOpenChange = useTriggerToggle(isOpen, triggerRef);
  useDismissOnOutsidePress(isOpen, () => setIsOpen(false), [triggerRef, popoverRef]);

  const openChange = (open: boolean) => {
    if (!allowOpenChange(open)) return;
    if (open) setPendingValue(committedRange);
    setIsOpen(open);
  };

  const calendar = (close: () => void) => (
    <DateRangeCalendar
      value={pendingValue}
      onChange={setPendingValue}
      locale={locale}
      labels={labels}
      ariaLabel={ariaLabel}
      onCancel={() => {
        setPendingValue(committedRange);
        close();
        setIsOpen(false);
      }}
      onApply={() => {
        commit(pendingValue);
        close();
        setIsOpen(false);
      }}
    />
  );

  if (isExternal) {
    return (
      <Popover
        ref={popoverRef}
        triggerRef={triggerRef}
        isOpen={isOpen}
        onOpenChange={openChange}
        offset={4}
        placement="bottom end"
        isNonModal
        className={cn(popoverClassName, "z-[80]")}
      >
        <Dialog aria-label={ariaLabel} className="outline-none">
          {({ close }) => calendar(close)}
        </Dialog>
      </Popover>
    );
  }

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={openChange}>
      <AriaButton
        ref={ownTriggerRef}
        isDisabled={isDisabled}
        aria-label={ariaLabel}
        className={cn(triggerButtonClassName, className)}
      >
        <CalendarDays className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex items-center justify-center whitespace-nowrap px-1 text-sm text-foreground">
          {committedRange
            ? `${formatTriggerDate(committedRange.start, locale)} - ${formatTriggerDate(committedRange.end, locale)}`
            : labels.placeholder}
        </span>
      </AriaButton>
      <Popover
        ref={popoverRef}
        offset={4}
        placement="bottom end"
        isNonModal
        className={cn(popoverClassName, "z-[80]")}
      >
        <Dialog aria-label={ariaLabel} className="outline-none">
          {({ close }) => calendar(close)}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
