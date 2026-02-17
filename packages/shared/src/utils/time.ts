/**
 * Time utilities for handling UTC to local timezone conversion
 * Uses date-fns v4 + @date-fns/tz for timezone-aware operations
 */
import { TZDate } from '@date-fns/tz';
import {
  format,
  isToday,
  isYesterday,
  isAfter,
  subDays,
  subWeeks,
  subMonths,
  subYears,
  formatDistanceToNow,
} from 'date-fns';

/**
 * Get user's local IANA timezone (e.g., "Asia/Shanghai", "America/New_York")
 */
export function getLocalTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Parse a UTC date string from backend into a TZDate in the user's local timezone.
 * Backend stores dates in UTC+0 format (e.g., "2026-01-20T10:00:00" or "2026-01-20 10:00:00")
 */
export function parseUTCDate(utcDateString: string, timeZone?: string): TZDate {
  if (!utcDateString) {
    return TZDate.tz(timeZone ?? getLocalTimeZone());
  }

  const hasTimezoneZ = utcDateString.endsWith('Z');
  const hasTimezoneOffset = /[+-]\d{2}:\d{2}$/.test(utcDateString) || /[+-]\d{4}$/.test(utcDateString);

  let dateStr = utcDateString;
  if (!hasTimezoneZ && !hasTimezoneOffset) {
    dateStr = utcDateString.replace(' ', 'T') + 'Z';
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
export function formatRelativeTime(utcDateString: string): string {
  const target = parseUTCDate(utcDateString);
  const now = new Date();
  const diffMs = now.getTime() - target.getTime();

  if (diffMs < 0) {
    return 'just now';
  }

  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return diffSeconds <= 5 ? 'just now' : `${diffSeconds}s`;
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  if (diffDays < 7) {
    return `${diffDays}d`;
  }

  return format(target, 'MMM d');
}

/**
 * Format a UTC date string to local date string (e.g., "Jan 15, 2026")
 */
export function formatLocalDate(utcDateString: string, formatStr: string = 'MMM d, yyyy'): string {
  const date = parseUTCDate(utcDateString);
  return format(date, formatStr);
}

/**
 * Format a UTC date string to local datetime string (e.g., "Jan 15, 2026 • 14:30")
 */
export function formatLocalDateTime(utcDateString: string, formatStr: string = 'MMM d, yyyy • HH:mm:ss'): string {
  const date = parseUTCDate(utcDateString);
  return format(date, formatStr);
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
} from 'date-fns';
export { TZDate } from '@date-fns/tz';
