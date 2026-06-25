import { format, formatDistanceToNow, parseISO } from 'date-fns';

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
  return date ? formatDistanceToNow(date, { addSuffix: true }) : null;
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
