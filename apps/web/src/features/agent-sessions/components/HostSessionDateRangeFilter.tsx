"use client";

import { useLocale, useTranslations } from "next-intl";
import { format } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import {
  DateRangePickerPanel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  type DateRangePickerLabels,
} from "@workspace/ui";
import { CalendarDays } from "lucide-react";
import {
  matchHostSessionQuickRange,
  parseLocalDateKey,
  toLocalDateKey,
  type HostSessionFilters,
} from "@/features/agent-sessions/lib/host-session-filters";

function dateLocale(locale: string) {
  return locale.toLowerCase().startsWith("zh") ? zhCN : enUS;
}

function formatRangeLabel(from: string, to: string, locale: string): string {
  const start = parseLocalDateKey(from);
  const end = parseLocalDateKey(to);
  if (!start || !end) return "";
  const pattern = locale.toLowerCase().startsWith("zh") ? "yyyy/M/d" : "MMM d";
  const loc = dateLocale(locale);
  const left = format(start, pattern, { locale: loc });
  const right = format(end, pattern, { locale: loc });
  return from === to ? left : `${left} – ${right}`;
}

function useDateRangeLabels(): DateRangePickerLabels {
  const t = useTranslations("agentSessions.filter");
  return {
    placeholder: t("placeholder"),
    cancel: t("cancel"),
    apply: t("apply"),
    startDate: t("startDate"),
    endDate: t("endDate"),
    daysSelected: (count) => t("daysSelected", { count }),
    presets: {
      today: t("quick.today"),
      yesterday: t("quick.yesterday"),
      lastWeek: t("quick.lastWeek"),
      thisMonth: t("quick.thisMonth"),
      lastMonth: t("quick.lastMonth"),
      thisYear: t("quick.thisYear"),
      lastYear: t("quick.lastYear"),
      allTime: t("allTime"),
    },
  };
}

export function HostSessionDateMenuItem({
  filters,
  onFiltersChange,
  onClose,
}: {
  filters: HostSessionFilters;
  onFiltersChange: (filters: HostSessionFilters) => void;
  onClose: () => void;
}) {
  const t = useTranslations("agentSessions.filter");
  const locale = useLocale();
  const labels = useDateRangeLabels();
  const selectedQuick = matchHostSessionQuickRange(filters);
  const summary = selectedQuick
    ? t(`quick.${selectedQuick}`)
    : filters.dateFrom && filters.dateTo
      ? formatRangeLabel(filters.dateFrom, filters.dateTo, locale)
      : null;
  const value =
    filters.dateFrom && filters.dateTo
      ? (() => {
          const start = parseLocalDateKey(filters.dateFrom);
          const end = parseLocalDateKey(filters.dateTo);
          return start && end ? { start, end } : null;
        })()
      : null;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <CalendarDays className="size-4" />
        <span className="min-w-0 flex-1 truncate">{t("date")}</span>
        {summary ? (
          <span className="max-w-[7rem] truncate text-[11px] text-muted-foreground">{summary}</span>
        ) : null}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        sideOffset={8}
        className="w-auto overflow-visible rounded-3xl p-0"
      >
        <DateRangePickerPanel
          value={value}
          locale={locale}
          labels={labels}
          onApply={(range) => {
            if (!range) {
              onFiltersChange({
                ...filters,
                dateFrom: null,
                dateTo: null,
              });
            } else {
              onFiltersChange({
                ...filters,
                dateFrom: toLocalDateKey(range.start),
                dateTo: toLocalDateKey(range.end),
              });
            }
            onClose();
          }}
          onCancel={onClose}
        />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
