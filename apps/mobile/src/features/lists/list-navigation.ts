export type ListNavSample = {
  target: string;
  ms: number;
  detail?: string;
};

type PendingMark = {
  target: string;
  detail?: string;
  startedAt: number;
};

let pending: PendingMark | null = null;
let lastSample: ListNavSample | null = null;
let sink: ((line: string) => void) | null = null;

function isDevLogEnabled() {
  const globalDev = (globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__;
  if (typeof globalDev === "boolean") return globalDev;
  return typeof __DEV__ !== "undefined" && __DEV__;
}

function now() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

/** Call immediately before `router.push`. */
export function markListNavigation(target: string, detail?: string) {
  pending = { target, detail, startedAt: now() };
}

/**
 * Accept the mark for this destination. A different target leaves the mark in
 * place so a stale screen cannot consume it. Returns null when there is no
 * matching mark (deep link).
 */
export function reportListFirstFrame(target: string): number | null {
  if (!pending || pending.target !== target) return null;
  const ms = Math.max(0, now() - pending.startedAt);
  const detail = pending.detail;
  pending = null;
  const sample: ListNavSample = { target, ms, detail };
  lastSample = sample;
  const line = formatListNavLine(sample);
  if (sink) sink(line);
  else if (isDevLogEnabled()) console.info(line);
  return ms;
}

export function formatListNavLine(sample: ListNavSample): string {
  const ms = Number.isFinite(sample.ms) ? sample.ms.toFixed(1) : "0.0";
  const detail = sample.detail?.replace(/[\r\n]+/g, " ").trim();
  const suffix = detail ? ` detail=${detail}` : "";
  return `[list-nav] click-to-first-frame target=${sample.target} ms=${ms}${suffix}`;
}

export function setListNavSink(next: ((line: string) => void) | null) {
  sink = next;
}

export function lastListNavSample(): ListNavSample | null {
  return lastSample;
}

export function resetListNavForTests() {
  pending = null;
  lastSample = null;
  sink = null;
}
