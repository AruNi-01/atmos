import { format, formatDistanceToNow, fromUnixTime, type Locale } from "date-fns";

/** Wall-clock in the user's local timezone. */
export function formatBlameAbsolute(timestampSec: number): string {
  return format(fromUnixTime(timestampSec), "yyyy-MM-dd HH:mm:ss");
}

/** e.g. `3 days ago (2026-03-21 12:32:12)` */
export function formatBlameWhen(timestampSec: number, locale: Locale): string {
  const date = fromUnixTime(timestampSec);
  const relative = formatDistanceToNow(date, { addSuffix: true, locale });
  return `${relative} (${formatBlameAbsolute(timestampSec)})`;
}
