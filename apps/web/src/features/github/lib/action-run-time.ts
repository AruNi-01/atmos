import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import { currentAppLocale } from '@/shared/lib/current-app-locale';

function parseActionDate(value: string | null | undefined) {
  if (!value) return null;
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatActionTimestamp(value: string | null | undefined) {
  const date = parseActionDate(value);
  return date ? format(date, 'PPpp') : null;
}

export function formatActionTimeAgo(value: string | null | undefined) {
  const date = parseActionDate(value);
  const relativeTimeLocale = currentAppLocale('en').startsWith('zh') ? zhCN : enUS;
  return date
    ? formatDistanceToNow(date, { addSuffix: true, locale: relativeTimeLocale })
    : null;
}

export function formatActionDuration(startValue: string | null | undefined, endValue: string | null | undefined) {
  const start = parseActionDate(startValue);
  const end = parseActionDate(endValue);
  if (!start || !end) return null;

  const totalSeconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
