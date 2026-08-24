/**
 * URL `tab` / `terminalTmux` / `sideChat` are host-global query params.
 * Paint contexts (workspace/project × center space) must not inherit them.
 */

import { readCenterStageLastTab } from "@/shared/stores/use-ui-pref-hooks";
import {
  CENTER_SPACE_KEY_MARK,
  DEFAULT_CENTER_SPACE_ID,
  hostIdFromCenterKey,
  parseCenterSpaceKey,
} from "@/app-shell/center-space/center-space";
import { spaceIdFromTmuxWindowName } from "@/features/terminal/store/terminal-store-helpers";

const CONTEXT_ENCODED_TAB_PREFIXES = [
  "github-pr:",
  "github-issue:",
  "github-action:",
  "github-commit:",
  "browser:",
] as const;

function paintIdFromEncodedTab(tab: string): string | null {
  const prefix = CONTEXT_ENCODED_TAB_PREFIXES.find((item) => tab.startsWith(item));
  if (!prefix) return null;
  const separatorIndex = tab.lastIndexOf(":");
  if (separatorIndex <= prefix.length) return null;
  try {
    return decodeURIComponent(tab.slice(prefix.length, separatorIndex)) || null;
  } catch {
    return null;
  }
}

export type CenterSurfaceHrefBits = {
  contextId: string | null;
  tabParam: string | null;
  hasTabParam: boolean;
  terminalTmux: string | null;
  sideChat: string | null;
};

export type CenterPaintTabUrlPatch = {
  tab: string | null;
  wikiPage?: string | null;
  terminalTmux?: string | null;
  sideChat?: string | null;
};

export type CenterPaintTabUrlWriter = (patch: CenterPaintTabUrlPatch) => void;

let urlWriter: CenterPaintTabUrlWriter | null = null;
let paintIdReader: ((hostId: string) => string) | null = null;

/** Bound by the center-space store so nav-prep stays free of that module graph. */
export function bindPaintContextIdReader(
  reader: ((hostId: string) => string) | null,
): void {
  paintIdReader = reader;
}

/** Live paint id for a workspace/project host (extra space ≠ host id). */
export function paintContextIdForHost(hostId: string): string {
  if (!hostId) return hostId;
  if (hostId.includes(CENTER_SPACE_KEY_MARK)) return hostId;
  try {
    return paintIdReader?.(hostId) || hostId;
  } catch {
    return hostId;
  }
}

export function resolveTabForPaintContext(paintId: string): string | undefined {
  if (!paintId) return undefined;
  return readCenterStageLastTab(paintId);
}

/** Github/browser tab values encode the paint context they belong to. */
export function tabValueBelongsToPaintContext(
  tab: string | null | undefined,
  paintId: string | null | undefined,
): boolean {
  if (!tab || !paintId) return false;
  const encodedPaintId = paintIdFromEncodedTab(tab);
  return encodedPaintId === paintId;
}

/**
 * Keep an explicit dest `?tab=` only when it is a real deep link, not leftover
 * chrome copied from the previous host.
 *
 * Keep: agent `terminalTmux` / `sideChat`, dest-owned github/browser tabs,
 * cold loads, same-host edits, or a tab that differs from the current URL.
 * Rewrite: generic tokens that match the previous host's tab.
 */
export function shouldKeepExplicitTabOnHostHop(input: {
  destHostId: string;
  destPaintId: string;
  dest: CenterSurfaceHrefBits;
  current: CenterSurfaceHrefBits | null;
}): boolean {
  const destTmux = input.dest.terminalTmux?.trim() || "";
  const destSide = input.dest.sideChat?.trim() || "";
  if (destTmux || destSide) {
    const leftoverDeepLink =
      Boolean(input.current?.contextId) &&
      input.current?.contextId !== input.destHostId &&
      destTmux === (input.current?.terminalTmux ?? "").trim() &&
      destSide === (input.current?.sideChat ?? "").trim() &&
      input.dest.tabParam === input.current?.tabParam;
    if (!leftoverDeepLink) return true;
  }
  if (!input.dest.hasTabParam || !input.dest.tabParam) return false;

  const tab = input.dest.tabParam;
  if (
    tabValueBelongsToPaintContext(tab, input.destPaintId) ||
    tabValueBelongsToPaintContext(tab, input.destHostId)
  ) {
    return true;
  }

  if (!input.current?.contextId) return true;
  if (input.current.contextId === input.destHostId) return true;
  if (input.current.tabParam === tab) return false;
  return true;
}

function isLeftoverUrlDeepLink(input: {
  paintId: string | null | undefined;
  previousPaintId?: string | null;
  terminalTmux?: string | null;
  sideChat?: string | null;
  previousTerminalTmux?: string | null;
  previousSideChat?: string | null;
  ignoreLeftoverDeepLink?: boolean;
}): boolean {
  const tmux = input.terminalTmux?.trim() || "";
  const side = input.sideChat?.trim() || "";
  if (!tmux && !side) return false;
  if (tmux) {
    const tmuxSpace = spaceIdFromTmuxWindowName(tmux);
    const destSpace = parseCenterSpaceKey(input.paintId ?? "").spaceId;
    if (tmuxSpace !== DEFAULT_CENTER_SPACE_ID) {
      return tmuxSpace !== destSpace;
    }
  }
  if (input.ignoreLeftoverDeepLink) return true;
  const paintChanged =
    Boolean(input.previousPaintId) && input.previousPaintId !== input.paintId;
  if (!paintChanged) return false;
  const prevHost = hostIdFromCenterKey(input.previousPaintId ?? "");
  const destHost = hostIdFromCenterKey(input.paintId ?? "");
  if (prevHost && destHost && prevHost === destHost) return false;
  return (
    (Boolean(tmux) && tmux === (input.previousTerminalTmux ?? "").trim()) ||
    (Boolean(side) && side === (input.previousSideChat ?? "").trim())
  );
}

/**
 * Whether CenterStage may follow `?tab=` / `terminalTmux` / `sideChat` for this
 * paint context. Generic leftover tokens from a previous space/workspace must
 * not open tools or skip last-tab restore on the destination.
 *
 * Agent footer jumps often omit `tab` and only send `terminalTmux`; those still
 * count as a real deep link when they are not leftover chrome.
 */
export function shouldHonorUrlTabForPaintContext(input: {
  tabFromUrl: string | null | undefined;
  paintId: string | null | undefined;
  previousPaintId?: string | null;
  lastTab?: string | null;
  terminalTmux?: string | null;
  sideChat?: string | null;
  previousTerminalTmux?: string | null;
  previousSideChat?: string | null;
  ignoreLeftoverDeepLink?: boolean;
  /** Leftover `?tab=` from the previous paint context, held until URL rewrites. */
  blockedUrlTab?: string | null;
}): boolean {
  if (!input.paintId) return false;

  const tab = input.tabFromUrl;
  const paintChanged =
    Boolean(input.previousPaintId) && input.previousPaintId !== input.paintId;

  const tmux = input.terminalTmux?.trim() || "";
  const side = input.sideChat?.trim() || "";
  if (tmux || side) {
    if (!isLeftoverUrlDeepLink(input)) return true;
    if (!tab) return false;
    return input.lastTab === tab;
  }

  if (!tab) return false;

  if (paintIdFromEncodedTab(tab)) {
    return tabValueBelongsToPaintContext(tab, input.paintId);
  }

  if (input.blockedUrlTab && tab === input.blockedUrlTab) {
    return input.lastTab === tab;
  }

  if (!paintChanged) return true;
  return input.lastTab === tab;
}

export function bindCenterPaintTabUrlWriter(
  writer: CenterPaintTabUrlWriter | null,
): void {
  urlWriter = writer;
}

function replaceWindowCenterPaintTab(patch: CenterPaintTabUrlPatch): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (patch.tab) url.searchParams.set("tab", patch.tab);
  else url.searchParams.delete("tab");
  url.searchParams.delete("wikiPage");
  url.searchParams.delete("terminalTmux");
  url.searchParams.delete("sideChat");
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", next);
}

/** Rewrite the shared center-tab URL so the incoming paint context owns it. */
export function writeCenterPaintTabUrl(tab: string | null | undefined): void {
  const nextTab = tab?.trim() ? tab : null;
  const patch: CenterPaintTabUrlPatch = {
    tab: nextTab,
    wikiPage: null,
    terminalTmux: null,
    sideChat: null,
  };
  if (urlWriter) {
    urlWriter(patch);
    return;
  }
  replaceWindowCenterPaintTab(patch);
}

/** Drop leftover deep-link chrome so the dest paint context uses its own last tab. */
export function clearCenterDeepLinkUrl(): void {
  writeCenterPaintTabUrl(null);
}

export function syncPaintContextTabUrl(_paintId: string): void {
  clearCenterDeepLinkUrl();
}
