/**
 * Time utilities for handling UTC to local timezone conversion
 * Uses date-fns v4 + @date-fns/tz for timezone-aware operations
 */
import { TZDate } from "@date-fns/tz";
import { format, type Locale as DateFnsLocale } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";

function dateFnsLocaleFor(locale?: string | null): DateFnsLocale {
  return locale?.startsWith("zh") ? zhCN : enUS;
}

function compactRelativeTime(
  value: number,
  unit: "second" | "minute" | "hour" | "day",
  locale?: string | null,
): string {
  if (!locale?.startsWith("zh")) {
    const suffix = unit === "second" ? "s" : unit === "minute" ? "m" : unit === "hour" ? "h" : "d";
    return `${value}${suffix}`;
  }

  const unitLabel =
    unit === "second" ? "秒" : unit === "minute" ? "分钟" : unit === "hour" ? "小时" : "天";
  return `${value}${unitLabel}`;
}

/**
 * Get user's local IANA timezone (e.g., "Asia/Shanghai", "America/New_York")
 */
export function getLocalTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const UTC_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T/;

function formatUtcMonthDay(instant: string): string | null {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return null;
  const month = UTC_MONTHS[date.getUTCMonth()];
  if (!month) return null;
  return `${month} ${date.getUTCDate()}`;
}

function formatPeriodSide(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.includes("T")) return trimmed;
  return formatUtcMonthDay(trimmed) ?? trimmed;
}

const RANGE_ARROWS = ["→", "—", "–"] as const;

function splitArrowRange(text: string): [string, string] | null {
  for (const separator of RANGE_ARROWS) {
    const index = text.indexOf(separator);
    if (index <= 0) continue;
    const left = text.slice(0, index).trim();
    const right = text.slice(index + separator.length).trim();
    if (!left || !right) continue;
    if (RANGE_ARROWS.some((arrow) => right.includes(arrow))) continue;
    return [left, right];
  }
  return null;
}

/**
 * Rewrite a quota billing window that still contains an ISO instant.
 * Factory month-day spans and Zed date-only ranges are returned unchanged.
 * Ranges use UTC so the label matches the Rust `format_billing_span` output.
 */
export function formatQuotaBillingPeriod(value: string | null | undefined): string | null {
  if (value == null) return null;
  const text = value.trim();
  if (!text) return null;
  if (!text.includes("T")) return text;

  const arrow = splitArrowRange(text);
  if (arrow) {
    return `${formatPeriodSide(arrow[0])} - ${formatPeriodSide(arrow[1])}`;
  }

  const hyphen = text.split(" - ");
  if (
    hyphen.length === 2 &&
    hyphen[0] &&
    hyphen[1] &&
    ISO_INSTANT.test(hyphen[0].trim()) &&
    ISO_INSTANT.test(hyphen[1].trim())
  ) {
    return `${formatPeriodSide(hyphen[0])} - ${formatPeriodSide(hyphen[1])}`;
  }

  return formatPeriodSide(text);
}

/**
 * Parse a UTC date string from backend into a TZDate in the user's local timezone.
 * Backend stores dates in UTC+0 format (e.g., "2026-01-20T10:00:00" or "2026-01-20 10:00:00")
 */
export function parseUTCDate(utcDateString: string, timeZone?: string): TZDate {
  if (!utcDateString) {
    return TZDate.tz(timeZone ?? getLocalTimeZone());
  }

  const hasTimezoneZ = utcDateString.endsWith("Z");
  const hasTimezoneOffset =
    /[+-]\d{2}:\d{2}$/.test(utcDateString) || /[+-]\d{4}$/.test(utcDateString);

  let dateStr = utcDateString;
  if (!hasTimezoneZ && !hasTimezoneOffset) {
    dateStr = utcDateString.replace(" ", "T") + "Z";
  }

  const tz = timeZone ?? getLocalTimeZone();
  return new TZDate(dateStr, tz);
}

/**
 * Format a UTC date string to relative time in local timezone
 * - < 60s: "Xs" or "just now"
 * - < 60m: "Xm"
 * - < 24h: "Xh"
 * - < 7d: "Xd"
 * - >= 7d: date string (e.g., "Jan 15")
 */
export function formatRelativeTime(utcDateString: string, locale?: string | null): string {
  const target = parseUTCDate(utcDateString);
  const now = new Date();
  const diffMs = now.getTime() - target.getTime();

  if (diffMs < 0) {
    return locale?.startsWith("zh") ? "刚刚" : "just now";
  }

  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return diffSeconds <= 5
      ? locale?.startsWith("zh")
        ? "刚刚"
        : "just now"
      : compactRelativeTime(diffSeconds, "second", locale);
  }

  if (diffMinutes < 60) {
    return compactRelativeTime(diffMinutes, "minute", locale);
  }

  if (diffHours < 24) {
    return compactRelativeTime(diffHours, "hour", locale);
  }

  if (diffDays < 7) {
    return compactRelativeTime(diffDays, "day", locale);
  }

  return format(target, "MMM d", { locale: dateFnsLocaleFor(locale) });
}

/**
 * Format a UTC date string to local date string (e.g., "Jan 15, 2026")
 */
export function formatLocalDate(
  utcDateString: string,
  formatStr: string = "MMM d, yyyy",
  locale?: string | null,
): string {
  const date = parseUTCDate(utcDateString);
  return format(date, formatStr, { locale: dateFnsLocaleFor(locale) });
}

/**
 * Format a UTC date string to local datetime string (e.g., "Jan 15, 2026 • 14:30")
 */
export function formatLocalDateTime(
  utcDateString: string,
  formatStr: string = "MMM d, yyyy • HH:mm:ss",
  locale?: string | null,
): string {
  const date = parseUTCDate(utcDateString);
  return format(date, formatStr, { locale: dateFnsLocaleFor(locale) });
}

// Re-export date-fns utilities for convenient use in apps
export {
  format,
  isToday,
  isYesterday,
  isAfter,
  subDays,
  subWeeks,
  subMonths,
  subYears,
  formatDistanceToNow,
} from "date-fns";
export { TZDate } from "@date-fns/tz";
