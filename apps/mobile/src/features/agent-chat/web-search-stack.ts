import { hostFromUrl } from "@atmos/agent-transcript";
import { copy, formatCountChoice } from "./copy";

/** Web `boardui/web-search.tsx` source stack. Marks do not fly between the stack and a row. */
export const WEB_SEARCH_STACK_LIMIT = 6;
export const WEB_SEARCH_STEP_MS = 100;
export const WEB_SEARCH_CHEVRON_MS = 300;
export const WEB_SEARCH_ROW_FADE_MS = 160;
export const WEB_SEARCH_ROW_FADE_DELAY_MS = 50;

export function webSearchHost(url: string): string {
  return hostFromUrl(url) ?? "";
}

/** Same order as web `faviconCandidates`: site icon, Google, DuckDuckGo. `www` stays on the host. */
export function webSearchFaviconCandidates(url: string): string[] {
  const host = webSearchHost(url);
  if (!host) return [];
  return [
    `https://${host}/favicon.ico`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`,
    `https://icons.duckduckgo.com/ip3/${host}.ico`,
  ];
}

/** 11px meta on the tool row. Hidden when the search returned nothing. */
export function webSearchResultMeta(count: number): string | null {
  if (count <= 0) return null;
  return formatCountChoice(copy.webSearchResultCount, count);
}

export function webSearchOverflow(total: number): number {
  return Math.max(0, total - WEB_SEARCH_STACK_LIMIT);
}

/** The last source appears first, matching `shown > total - 1 - index`. */
export function webSearchRowVisible(index: number, shown: number, total: number): boolean {
  return shown > total - 1 - index;
}

export function nextWebSearchShown(open: boolean, shown: number, total: number): number {
  return open ? Math.min(total, shown + 1) : Math.max(0, shown - 1);
}

/** Collapsed stack width: each remaining mark takes 14px, plus 6px of circle. */
export function webSearchStackWidth(stillStacked: number): number {
  if (stillStacked <= 0) return 0;
  return stillStacked * 14 + 6;
}
