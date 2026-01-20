/**
 * Time utilities for handling UTC to local timezone conversion
 */

/**
 * Parse a UTC date string from backend to local Date object
 * Backend stores dates in UTC+0 format (e.g., "2026-01-20T10:00:00" or "2026-01-20 10:00:00")
 */
export function parseUTCDate(utcDateString: string): Date {
  if (!utcDateString) {
    return new Date();
  }
  
  // Check for timezone suffix: 'Z' or '+HH:MM' or '-HH:MM' at the end
  // Note: the date part has '-' too, so we need to check the end of the string
  const hasTimezoneZ = utcDateString.endsWith('Z');
  const hasTimezoneOffset = /[+-]\d{2}:\d{2}$/.test(utcDateString) || /[+-]\d{4}$/.test(utcDateString);
  
  let dateStr = utcDateString;
  
  // If no timezone info, treat as UTC by appending 'Z'
  if (!hasTimezoneZ && !hasTimezoneOffset) {
    // Replace space with T if needed (SQLite format: "2026-01-20 10:00:00")
    dateStr = utcDateString.replace(' ', 'T') + 'Z';
  }
  
  return new Date(dateStr);
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
  
  // Format as "Jan 15" for dates older than 7 days (in local timezone)
  return target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format a UTC date string to local date string
 */
export function formatLocalDate(utcDateString: string, locale: string = 'en-US'): string {
  const date = parseUTCDate(utcDateString);
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a UTC date string to local datetime string
 */
export function formatLocalDateTime(utcDateString: string, locale: string = 'en-US'): string {
  const date = parseUTCDate(utcDateString);
  return date.toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
