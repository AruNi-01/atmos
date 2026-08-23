"use client";

import { createTranslator } from "next-intl";
import { v4 as uuidv4 } from "uuid";
import type { TerminalLayoutDirection, TerminalLayoutNode } from "@/features/terminal/types/index";
import { nextOscTitleAfterIncoming, resolveIncomingOscTitle } from "@atmos/shared/terminal";

import type { TmuxWindow } from "@/api/rest-api";
import type { TerminalPaneAgent, TerminalPaneProps } from "@/features/terminal/types/index";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import {
  FIXED_TERMINAL_TAB_VALUE,
  TERMINAL_LAYOUT_SCHEMA,
  type PersistedTerminalPane,
  type PersistedTerminalTabDocument,
  type PersistedTerminalWorkspaceLayoutDocument,
} from "@/features/terminal/lib/terminal-layout-document";
import {
  DEFAULT_CENTER_SPACE_ID,
  hostIdFromCenterKey,
  parseCenterSpaceKey,
} from "@/app-shell/center-space/center-space";
import {
  normalizeStoredDynamicTitle,
  readCachedDynamicTitle,
  readCachedOscTitle,
  writeCachedOscTitle,
} from "@/features/terminal/lib/terminal-dynamic-title-cache";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";

export const TERMINAL_TAB_VALUE_PREFIX = "terminal-tab:";

/**
 * Normalize untrusted OSC 0/2 text before storing on a pane (shared by grid / wiki / CR).
 * Returns `undefined` for empty/noise. Callers that must **not** wipe a previous
 * agent topic on shell path noise should use {@link resolveIncomingOscTitle}
 * and ignore the `ignore` action instead of writing `undefined`.
 */
export function normalizeStoredOscTitle(oscTitle: string | undefined): string | undefined {
  const resolved = resolveIncomingOscTitle(oscTitle);
  if (resolved.action === "set") return resolved.value;
  // clear + ignore both map to undefined for the simple helper; store writers
  // that need ignore-vs-clear semantics call resolveIncomingOscTitle /
  // nextOscTitleAfterIncoming directly.
  return undefined;
}

/**
 * Apply an incoming OSC update: set, clear, or leave previous value untouched.
 * Stale shell preexec command lines are cleared when idle path noise arrives
 * (see {@link nextOscTitleAfterIncoming}).
 */
export function nextOscTitleFromIncoming(
  previous: string | undefined,
  raw: string | undefined,
): string | undefined {
  return nextOscTitleAfterIncoming(previous, raw);
}

export { normalizeStoredDynamicTitle } from "@/features/terminal/lib/terminal-dynamic-title-cache";

type TerminalMessagesLocale = "en" | "zh";

let cachedLocale: TerminalMessagesLocale | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedTranslator: any = null;

function terminalT(key: string, values?: Record<string, string | number>): string {
  const locale: TerminalMessagesLocale = currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedTranslator || cachedLocale !== locale) {
    cachedLocale = locale;
    cachedTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "Terminal.chrome",
    });
  }

  return cachedTranslator(key as never, values as never);
}

export interface TerminalCenterTab {
  id: string;
  title: string;
  closable: boolean;
  /**
   * User custom tab name. Display-only override with top priority.
   * Empty/undefined means no override (fall back to `title`). Persisted.
   * `title` remains the auto name used for uniqueness/dedup.
   */
  customTitle?: string;
}

type TerminalLookupState = {
  workspaceTerminalTabs: Record<string, TerminalCenterTab[]>;
  workspacePanes: Record<string, Record<string, TerminalPaneProps>>;
  persistedTerminalLayouts: Record<string, PersistedTerminalWorkspaceLayoutDocument | null>;
  workspaceContexts: Record<string, boolean>;
};

type TerminalRuntimeEvictState = TerminalLookupState & {
  workspaceActiveTerminalTabIds: Record<string, string>;
  workspaceActivePaneIds: Record<string, string | null>;
  workspaceLayouts: Record<string, TerminalLayoutNode<string> | null>;
  workspaceMaximizedIds: Record<string, string | null>;
  loadedWorkspaces: Set<string>;
  hydratedTerminalScopes: Set<string>;
  initializingWorkspaces: Set<string>;
  initializingTerminalScopes: Set<string>;
  saveTimeouts: Record<string, NodeJS.Timeout>;
  isHydrated: boolean;
  tmuxWindowsCache: Record<string, TmuxWindow[]>;
  workspaceContexts: Record<string, boolean>;
  projectWikiPanes: Record<string, Record<string, TerminalPaneProps>>;
  projectWikiLayouts: Record<string, TerminalLayoutNode<string> | null>;
  projectWikiMaximizedIds: Record<string, string | null>;
  projectWikiLoadedWorkspaces: Set<string>;
  projectWikiInitializingWorkspaces: Set<string>;
  codeReviewPanes: Record<string, Record<string, TerminalPaneProps>>;
  codeReviewLayouts: Record<string, TerminalLayoutNode<string> | null>;
  codeReviewMaximizedIds: Record<string, string | null>;
  codeReviewLoadedWorkspaces: Set<string>;
  codeReviewInitializingWorkspaces: Set<string>;
};

type TerminalPersistenceState = TerminalLookupState & {
  workspaceActiveTerminalTabIds: Record<string, string>;
  workspaceLayouts: Record<string, TerminalLayoutNode<string> | null>;
  workspaceMaximizedIds: Record<string, string | null>;
};

/** Generate next available window name (1, 2, 3, ...) for numeric names */
export function getNextWindowName(existingPanes: Record<string, TerminalPaneProps>): string {
  const values = Object.values(existingPanes);
  const usedNames = new Set([
    ...values.map((pane) => pane.tmuxWindowName),
    ...values.map((pane) => pane.label),
  ].filter(Boolean));

  let num = 1;
  while (usedNames.has(String(num))) {
    num++;
  }
  return String(num);
}

/** Fixed tmux window name for Project Wiki - never gets -1/-2 suffix. Export for reuse. */
export const PROJECT_WIKI_WINDOW_NAME = "Generate Project Wiki";

/** Fixed tmux window name for Code Review - never gets -1/-2 suffix. Export for reuse. */
export const CODE_REVIEW_WINDOW_NAME = "Code Review";

/** Generate unique window name with suffix for agent windows (e.g., "Claude Code", "Claude Code-2") */
export function getUniqueAgentName(
  baseName: string,
  existingPanes: Record<string, TerminalPaneProps>,
): string {
  // Project Wiki and Code Review use fixed names - always return as-is for attach/reuse
  if (baseName === PROJECT_WIKI_WINDOW_NAME || baseName === CODE_REVIEW_WINDOW_NAME) {
    return baseName;
  }

  const values = Object.values(existingPanes);
  const usedNames = new Set([
    ...values.map((pane) => pane.tmuxWindowName),
    ...values.map((pane) => pane.label),
  ].filter(Boolean));

  if (!usedNames.has(baseName)) {
    return baseName;
  }

  let num = 2;
  while (usedNames.has(`${baseName}-${num}`)) {
    num++;
  }
  return `${baseName}-${num}`;
}

export function createFixedTerminalTab(): TerminalCenterTab {
  const title = terminalT("tab.fixedTitle");
  return {
    id: FIXED_TERMINAL_TAB_VALUE,
    // Fall back when translator returns the raw key (partial i18n / test order).
    title: title === "tab.fixedTitle" ? "Term" : title,
    closable: true,
  };
}

/**
 * Extra center spaces share the host workspace tmux session (same cwd / git).
 * Window names must still be unique: backend create is attach-if-exists, so a
 * second space that opens window "1" would show the first space's terminal.
 * Prefix is tmux-safe (no `:`) and easy to skip when hydrating the default space.
 */
const EXTRA_SPACE_TMUX_WINDOW_MARK = "cs__";

export function extraCenterSpaceTmuxWindowPrefix(
  paintContextId: string,
): string | null {
  const { spaceId } = parseCenterSpaceKey(paintContextId);
  if (spaceId === DEFAULT_CENTER_SPACE_ID) return null;
  return `${EXTRA_SPACE_TMUX_WINDOW_MARK}${spaceId}__`;
}

export function isExtraCenterSpaceTmuxWindowName(name: string): boolean {
  return name.startsWith(EXTRA_SPACE_TMUX_WINDOW_MARK);
}

/** Default space windows are unprefixed; extra spaces use `cs__{spaceId}__{local}`. */
export function spaceIdFromTmuxWindowName(
  name: string | null | undefined,
): string {
  if (!name || !name.startsWith(EXTRA_SPACE_TMUX_WINDOW_MARK)) {
    return DEFAULT_CENTER_SPACE_ID;
  }
  const rest = name.slice(EXTRA_SPACE_TMUX_WINDOW_MARK.length);
  const end = rest.indexOf("__");
  if (end <= 0) return DEFAULT_CENTER_SPACE_ID;
  return rest.slice(0, end);
}

/** Agent hook / attention key. Always the host workspace id, never a paint id. */
export function stableAgentPaneId(
  paintOrHostId: string,
  tmuxWindowName: string,
): string {
  return `${hostIdFromCenterKey(paintOrHostId)}:${tmuxWindowName}`;
}

export function namespacedTmuxWindowName(
  paintContextId: string,
  localName: string,
): string {
  if (
    !localName ||
    localName === PROJECT_WIKI_WINDOW_NAME ||
    localName === CODE_REVIEW_WINDOW_NAME
  ) {
    return localName;
  }
  const prefix = extraCenterSpaceTmuxWindowPrefix(paintContextId);
  if (!prefix) return localName;
  if (localName.startsWith(prefix)) return localName;
  return `${prefix}${localName}`;
}

export function createTerminalPane(
  workspaceId: string,
  label: string,
  options: {
    id?: string;
    tmuxWindowName?: string;
    isNewPane: boolean;
    agent?: TerminalPaneAgent;
  },
): TerminalPaneProps {
  const localName = options.tmuxWindowName ?? label;
  return {
    id: options.id ?? uuidv4(),
    label,
    sessionId: uuidv4(),
    workspaceId: hostIdFromCenterKey(workspaceId),
    tmuxWindowName: namespacedTmuxWindowName(workspaceId, localName),
    isNewPane: options.isNewPane,
    agent: options.agent,
  };
}

export function samePaneAgent(
  left: TerminalPaneAgent | undefined,
  right: TerminalPaneAgent,
): boolean {
  return (
    left?.id === right.id &&
    left?.label === right.label &&
    left?.command === right.command &&
    left?.iconType === right.iconType &&
    left?.pipeCommand === right.pipeCommand
  );
}

export function getScopeKey(
  workspaceId: string,
  terminalTabId: string = FIXED_TERMINAL_TAB_VALUE,
): string {
  return terminalTabId === FIXED_TERMINAL_TAB_VALUE
    ? workspaceId
    : `${workspaceId}::${terminalTabId}`;
}

export function getTerminalWorkspaceScopeKey(
  workspaceId: string,
  isProjectContext: boolean = false,
): string {
  return `${isProjectContext ? "project" : "workspace"}:${workspaceId}`;
}

export function isTerminalWorkspaceScopeKeyForWorkspace(key: string, workspaceId: string): boolean {
  return (
    key === workspaceId ||
    key === getTerminalWorkspaceScopeKey(workspaceId, false) ||
    key === getTerminalWorkspaceScopeKey(workspaceId, true)
  );
}

function getPersistedTerminalLayoutForWorkspace(
  state: Pick<TerminalLookupState, "persistedTerminalLayouts" | "workspaceContexts">,
  workspaceId: string,
  isProjectContext = state.workspaceContexts[workspaceId] ?? false,
): PersistedTerminalWorkspaceLayoutDocument | null {
  const workspaceScopeKey = getTerminalWorkspaceScopeKey(workspaceId, isProjectContext);
  return state.persistedTerminalLayouts[workspaceScopeKey] ?? null;
}

export function getWorkspaceTerminalTabs(
  state: Pick<TerminalLookupState, "workspaceTerminalTabs">,
  workspaceId: string,
): TerminalCenterTab[] {
  if (Object.prototype.hasOwnProperty.call(state.workspaceTerminalTabs, workspaceId)) {
    return state.workspaceTerminalTabs[workspaceId] ?? [];
  }
  if (parseCenterSpaceKey(workspaceId).spaceId !== DEFAULT_CENTER_SPACE_ID) {
    return [];
  }
  return [createFixedTerminalTab()];
}

/**
 * Locate a pane in the main workspace terminal grid by its tmux window name (any tab).
 *
 * Checks hydrated panes first; falls back to the persisted layout so deep
 * links (e.g. the footer agent-status jump) can resolve the owning tab even
 * before the workspace's non-active tabs have been mounted/hydrated.
 */
export function findWorkspacePaneIdsByTmuxWindowName(
  state: TerminalLookupState,
  workspaceId: string,
  tmuxWindowName: string,
  isProjectContext?: boolean,
): { paneId: string; terminalTabId: string } | null {
  const tabs = getWorkspaceTerminalTabs(state, workspaceId);
  for (const tab of tabs) {
    const scopeKey = getScopeKey(workspaceId, tab.id);
    const panes = state.workspacePanes[scopeKey];
    if (!panes) continue;
    for (const [paneId, pane] of Object.entries(panes)) {
      if (pane.tmuxWindowName === tmuxWindowName) {
        return { paneId, terminalTabId: tab.id };
      }
    }
  }

  const persistedTabs = getPersistedTerminalLayoutForWorkspace(state, workspaceId, isProjectContext)?.tabs;
  if (persistedTabs) {
    for (const tab of persistedTabs) {
      for (const [paneId, pane] of Object.entries(tab.panes ?? {})) {
        const legacyTitle = (pane as unknown as { title?: string }).title;
        const windowName = pane.tmuxWindowName || pane.label || legacyTitle;
        if (windowName === tmuxWindowName) {
          return { paneId, terminalTabId: tab.id };
        }
      }
    }
  }

  return null;
}

/** Read transient title + agent for a pane in the main grid (by pane id). */
export function getWorkspacePaneFieldsByPaneId(
  state: Pick<TerminalLookupState, "workspacePanes">,
  workspaceId: string,
  paneId: string,
  terminalTabId: string = FIXED_TERMINAL_TAB_VALUE,
): { dynamicTitle?: string; oscTitle?: string; agent?: TerminalPaneAgent } {
  const scopeKey = getScopeKey(workspaceId, terminalTabId);
  const pane = state.workspacePanes[scopeKey]?.[paneId];
  if (!pane) return {};
  return { dynamicTitle: pane.dynamicTitle, oscTitle: pane.oscTitle, agent: pane.agent };
}

/** Read transient title + agent for a tmux-attached pane (same fields the grid pane uses). */
export function getWorkspacePaneLiveFieldsByTmuxWindow(
  state: TerminalLookupState,
  workspaceId: string,
  tmuxWindowName: string,
): { dynamicTitle?: string; oscTitle?: string; agent?: TerminalPaneAgent } {
  const hit = findWorkspacePaneIdsByTmuxWindowName(state, workspaceId, tmuxWindowName);
  if (!hit) return {};
  const scopeKey = getScopeKey(workspaceId, hit.terminalTabId);
  const pane = state.workspacePanes[scopeKey]?.[hit.paneId];
  if (!pane) return {};
  return { dynamicTitle: pane.dynamicTitle, oscTitle: pane.oscTitle, agent: pane.agent };
}

export function getAllDefaultPanesForWorkspace(
  state: TerminalLookupState,
  workspaceId: string,
): Record<string, TerminalPaneProps> {
  const tabs = getWorkspaceTerminalTabs(state, workspaceId);
  const persistedTabs = getPersistedTerminalLayoutForWorkspace(state, workspaceId)?.tabs ?? [];
  return tabs.reduce<Record<string, TerminalPaneProps>>((acc, tab) => {
    const scopeKey = getScopeKey(workspaceId, tab.id);
    const hydratedPanes = state.workspacePanes[scopeKey];

    if (hydratedPanes && Object.keys(hydratedPanes).length > 0) {
      Object.assign(acc, hydratedPanes);
      return acc;
    }

    const persistedTab = persistedTabs.find((persisted) => persisted.id === tab.id);
    if (!persistedTab?.panes) {
      return acc;
    }

    for (const [id, pane] of Object.entries(persistedTab.panes)) {
      acc[id] = {
        ...pane,
        workspaceId,
        sessionId: "",
      } as TerminalPaneProps;
    }

    return acc;
  }, {});
}

export const CUSTOM_NAME_MAX_LENGTH = 40;

/**
 * Normalize a user custom name: trim, collapse internal whitespace, cap length.
 * Returns undefined when the result is empty (i.e. the override is cleared).
 */
export function normalizeCustomName(value: string): string | undefined {
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, CUSTOM_NAME_MAX_LENGTH).trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

export function getNextTerminalTabTitle(existingTabs: TerminalCenterTab[]): string {
  const usedTitles = new Set(existingTabs.map((tab) => tab.title));
  const nextTitle = (index: number) => terminalT("tab.indexedTitle", { index });
  let index = 1;
  while (usedTitles.has(nextTitle(index))) {
    index++;
  }
  return nextTitle(index);
}

export function getUniqueTerminalTabTitle(
  existingTabs: TerminalCenterTab[],
  preferredTitle: string,
): string {
  const baseTitle = preferredTitle.trim().replace(/\s+/g, " ").slice(0, 40).trim();
  if (!baseTitle) {
    return getNextTerminalTabTitle(existingTabs);
  }

  const usedTitles = new Set(existingTabs.map((tab) => tab.title));
  if (!usedTitles.has(baseTitle)) {
    return baseTitle;
  }

  let index = 2;
  while (usedTitles.has(`${baseTitle} ${index}`)) {
    index++;
  }
  return `${baseTitle} ${index}`;
}

export function hydratePersistedTab(
  workspaceId: string,
  tab: PersistedTerminalTabDocument,
  existingWindowNames: Set<string>,
  /**
   * Optional in-memory panes for this scope. When present, prefer live
   * `dynamicTitle` over localStorage / leftover layout fields. `sessionId`
   * is always fresh — callers that need reattach must reconnect.
   */
  livePanes?: Record<string, TerminalPaneProps> | null,
): {
  panes: Record<string, TerminalPaneProps>;
  layout: TerminalLayoutNode<string> | null;
  maximizedTerminalId: string | null;
} | null {
  if (!tab.layout || !tab.panes || Object.keys(tab.panes).length === 0) {
    return null;
  }

  const validatedPanes: Record<string, TerminalPaneProps> = {};
  for (const [id, pane] of Object.entries(tab.panes)) {
    // `title` is the legacy field name (before the label/tmuxWindowName split).
    // Fall back to it so old persisted layouts still resolve the correct window name.
    const legacyTitle = (pane as unknown as { title?: string }).title;
    const windowName = pane.tmuxWindowName || pane.label || legacyTitle || getNextWindowName(validatedPanes);
    const windowExists = existingWindowNames.has(windowName);
    const live = livePanes?.[id];
    // Match live pane by id first, then by tmux window name (ids can churn).
    const liveByWindow =
      live ??
      (livePanes
        ? Object.values(livePanes).find(
            (candidate) =>
              (candidate.tmuxWindowName || candidate.label) === windowName,
          )
        : undefined);

    const oscTitle =
      liveByWindow?.oscTitle ??
      pane.oscTitle ??
      readCachedOscTitle(workspaceId, windowName);
    // Copy leftover layout OSC into localStorage so later layout saves
    // (which no longer include oscTitle) do not drop the topic.
    if (oscTitle) writeCachedOscTitle(workspaceId, windowName, oscTitle);

    validatedPanes[id] = {
      ...pane,
      workspaceId,
      // Ensure label is always set — old data only has `title`, not `label`.
      label: pane.label || legacyTitle || windowName,
      tmuxWindowName: windowName,
      // Always mint a new frontend session id (WS attach identity).
      sessionId: uuidv4(),
      // Reconnect strategy:
      // - Live in-memory pane → attach
      // - Window confirmed present in tmux list → attach
      // - Window confirmed absent from a non-empty list → create (same name);
      //   backend create is idempotent and will attach if the window reappears
      // - Empty list (startup race) → prefer attach by name so we don't mint a
      //   second window that orphans a still-running TUI agent
      isNewPane: liveByWindow
        ? false
        : windowExists
          ? false
          : existingWindowNames.size > 0
            ? true
            : windowName
              ? false
              : true,
      // Titles: live pane, then leftover layout fields, then localStorage.
      // Not written to the terminal-layout API (title changes are too chatty).
      dynamicTitle: normalizeStoredDynamicTitle(
        liveByWindow?.dynamicTitle ??
          (pane as { dynamicTitle?: string }).dynamicTitle ??
          readCachedDynamicTitle(workspaceId, windowName),
      ),
      oscTitle,
      // Prefer live agent, then persisted agent.
      agent: liveByWindow?.agent ?? pane.agent,
      customLabel: liveByWindow?.customLabel ?? pane.customLabel,
      keepAgentName: liveByWindow?.keepAgentName ?? pane.keepAgentName,
      keepCwd: liveByWindow?.keepCwd ?? pane.keepCwd,
    };
  }

  return {
    panes: validatedPanes,
    layout: tab.layout,
    maximizedTerminalId: tab.maximizedTerminalId || null,
  };
}

export function createInitialLayout(
  workspaceId: string,
  existingPanes: Record<string, TerminalPaneProps> = {},
): {
  panes: Record<string, TerminalPaneProps>;
  layout: TerminalLayoutNode<string>;
} {
  const initialId = uuidv4();
  const windowName =
    Object.keys(existingPanes).length > 0 ? getNextWindowName(existingPanes) : "1";
  return {
    panes: {
      [initialId]: createTerminalPane(workspaceId, windowName, {
        id: initialId,
        tmuxWindowName: windowName,
        isNewPane: true,
      }),
    },
    layout: initialId,
  };
}

export function createLayoutFromTmuxWindows(
  workspaceId: string,
  windows: TmuxWindow[],
): {
  panes: Record<string, TerminalPaneProps>;
  layout: TerminalLayoutNode<string>;
} | null {
  if (windows.length === 0) return null;

  const panes: Record<string, TerminalPaneProps> = {};
  const paneIds: string[] = [];

  for (const win of windows) {
    if (isExtraCenterSpaceTmuxWindowName(win.name)) continue;
    const id = uuidv4();
    paneIds.push(id);
    panes[id] = createTerminalPane(workspaceId, win.name, {
      id,
      tmuxWindowName: win.name,
      isNewPane: false,
    });
  }

  const firstPaneId = paneIds[0];
  if (!firstPaneId) return null;

  let layout: TerminalLayoutNode<string> = firstPaneId;
  for (let index = 1; index < paneIds.length; index++) {
    layout = {
      direction: "row",
      first: layout,
      second: paneIds[index],
      splitPercentage: Math.round((100 * index) / (index + 1)),
    };
  }

  return { panes, layout };
}

export function evictTerminalWorkspaceRuntimeState(
  state: TerminalRuntimeEvictState,
  workspaceId: string,
): Omit<TerminalRuntimeEvictState, "persistedTerminalLayouts"> & {
  persistedTerminalLayouts: Record<string, PersistedTerminalWorkspaceLayoutDocument | null>;
} {
  const nextWorkspaceTerminalTabs = { ...state.workspaceTerminalTabs };
  const nextWorkspaceActiveTerminalTabIds = { ...state.workspaceActiveTerminalTabIds };
  const nextWorkspaceActivePaneIds = { ...state.workspaceActivePaneIds };
  const nextWorkspacePanes = { ...state.workspacePanes };
  const nextWorkspaceLayouts = { ...state.workspaceLayouts };
  const nextWorkspaceMaximizedIds = { ...state.workspaceMaximizedIds };
  const nextSaveTimeouts = { ...state.saveTimeouts };
  const nextTmuxWindowsCache = { ...state.tmuxWindowsCache };
  const nextPersistedTerminalLayouts = { ...state.persistedTerminalLayouts };
  const nextWorkspaceContexts = { ...state.workspaceContexts };
  const nextProjectWikiPanes = { ...state.projectWikiPanes };
  const nextProjectWikiLayouts = { ...state.projectWikiLayouts };
  const nextProjectWikiMaximizedIds = { ...state.projectWikiMaximizedIds };
  const nextCodeReviewPanes = { ...state.codeReviewPanes };
  const nextCodeReviewLayouts = { ...state.codeReviewLayouts };
  const nextCodeReviewMaximizedIds = { ...state.codeReviewMaximizedIds };
  const nextLoadedWorkspaces = new Set(state.loadedWorkspaces);
  const nextHydratedTerminalScopes = new Set(state.hydratedTerminalScopes);
  const nextInitializingWorkspaces = new Set(state.initializingWorkspaces);
  const nextInitializingTerminalScopes = new Set(state.initializingTerminalScopes);
  const nextProjectWikiLoadedWorkspaces = new Set(state.projectWikiLoadedWorkspaces);
  const nextProjectWikiInitializingWorkspaces = new Set(state.projectWikiInitializingWorkspaces);
  const nextCodeReviewLoadedWorkspaces = new Set(state.codeReviewLoadedWorkspaces);
  const nextCodeReviewInitializingWorkspaces = new Set(state.codeReviewInitializingWorkspaces);

  delete nextWorkspaceTerminalTabs[workspaceId];
  delete nextWorkspaceActiveTerminalTabIds[workspaceId];
  for (const key of Object.keys(nextSaveTimeouts)) {
    if (isTerminalWorkspaceScopeKeyForWorkspace(key, workspaceId)) {
      delete nextSaveTimeouts[key];
    }
  }
  for (const key of Object.keys(nextTmuxWindowsCache)) {
    if (isTerminalWorkspaceScopeKeyForWorkspace(key, workspaceId)) {
      delete nextTmuxWindowsCache[key];
    }
  }
  for (const key of Object.keys(nextPersistedTerminalLayouts)) {
    if (isTerminalWorkspaceScopeKeyForWorkspace(key, workspaceId)) {
      delete nextPersistedTerminalLayouts[key];
    }
  }
  delete nextWorkspaceContexts[workspaceId];
  delete nextProjectWikiPanes[workspaceId];
  delete nextProjectWikiLayouts[workspaceId];
  delete nextProjectWikiMaximizedIds[workspaceId];
  delete nextCodeReviewPanes[workspaceId];
  delete nextCodeReviewLayouts[workspaceId];
  delete nextCodeReviewMaximizedIds[workspaceId];

  for (const key of Object.keys(nextWorkspacePanes)) {
    if (key === workspaceId || key.startsWith(`${workspaceId}::`)) {
      delete nextWorkspacePanes[key];
    }
  }
  for (const key of Object.keys(nextWorkspaceLayouts)) {
    if (key === workspaceId || key.startsWith(`${workspaceId}::`)) {
      delete nextWorkspaceLayouts[key];
    }
  }
  for (const key of Object.keys(nextWorkspaceMaximizedIds)) {
    if (key === workspaceId || key.startsWith(`${workspaceId}::`)) {
      delete nextWorkspaceMaximizedIds[key];
    }
  }
  for (const key of Object.keys(nextWorkspaceActivePaneIds)) {
    if (key === workspaceId || key.startsWith(`${workspaceId}::`)) {
      delete nextWorkspaceActivePaneIds[key];
    }
  }

  for (const key of Array.from(nextLoadedWorkspaces)) {
    if (isTerminalWorkspaceScopeKeyForWorkspace(key, workspaceId)) {
      nextLoadedWorkspaces.delete(key);
    }
  }
  for (const key of Array.from(nextInitializingWorkspaces)) {
    if (isTerminalWorkspaceScopeKeyForWorkspace(key, workspaceId)) {
      nextInitializingWorkspaces.delete(key);
    }
  }
  nextProjectWikiLoadedWorkspaces.delete(workspaceId);
  nextProjectWikiInitializingWorkspaces.delete(workspaceId);
  nextCodeReviewLoadedWorkspaces.delete(workspaceId);
  nextCodeReviewInitializingWorkspaces.delete(workspaceId);

  for (const key of Array.from(nextHydratedTerminalScopes)) {
    if (key === workspaceId || key.startsWith(`${workspaceId}::`)) {
      nextHydratedTerminalScopes.delete(key);
    }
  }
  for (const key of Array.from(nextInitializingTerminalScopes)) {
    if (key === workspaceId || key.startsWith(`${workspaceId}::`)) {
      nextInitializingTerminalScopes.delete(key);
    }
  }

  return {
    workspaceTerminalTabs: nextWorkspaceTerminalTabs,
    workspaceActiveTerminalTabIds: nextWorkspaceActiveTerminalTabIds,
    workspaceActivePaneIds: nextWorkspaceActivePaneIds,
    workspacePanes: nextWorkspacePanes,
    workspaceLayouts: nextWorkspaceLayouts,
    workspaceMaximizedIds: nextWorkspaceMaximizedIds,
    loadedWorkspaces: nextLoadedWorkspaces,
    hydratedTerminalScopes: nextHydratedTerminalScopes,
    initializingWorkspaces: nextInitializingWorkspaces,
    initializingTerminalScopes: nextInitializingTerminalScopes,
    saveTimeouts: nextSaveTimeouts,
    isHydrated: state.isHydrated,
    tmuxWindowsCache: nextTmuxWindowsCache,
    persistedTerminalLayouts: nextPersistedTerminalLayouts,
    workspaceContexts: nextWorkspaceContexts,
    projectWikiPanes: nextProjectWikiPanes,
    projectWikiLayouts: nextProjectWikiLayouts,
    projectWikiMaximizedIds: nextProjectWikiMaximizedIds,
    projectWikiLoadedWorkspaces: nextProjectWikiLoadedWorkspaces,
    projectWikiInitializingWorkspaces: nextProjectWikiInitializingWorkspaces,
    codeReviewPanes: nextCodeReviewPanes,
    codeReviewLayouts: nextCodeReviewLayouts,
    codeReviewMaximizedIds: nextCodeReviewMaximizedIds,
    codeReviewLoadedWorkspaces: nextCodeReviewLoadedWorkspaces,
    codeReviewInitializingWorkspaces: nextCodeReviewInitializingWorkspaces,
  };
}

/**
 * APP-043 Frozen path: drop live attach/hydration flags only.
 * Preserves tab strip identity, panes/layouts, and persistedTerminalLayouts.
 */
export function detachTerminalWorkspaceFrontendState(
  state: TerminalRuntimeEvictState,
  workspaceId: string,
): Pick<
  TerminalRuntimeEvictState,
  | "loadedWorkspaces"
  | "hydratedTerminalScopes"
  | "initializingWorkspaces"
  | "initializingTerminalScopes"
  | "tmuxWindowsCache"
  | "saveTimeouts"
  | "projectWikiLoadedWorkspaces"
  | "projectWikiInitializingWorkspaces"
  | "codeReviewLoadedWorkspaces"
  | "codeReviewInitializingWorkspaces"
> {
  const nextLoadedWorkspaces = new Set(state.loadedWorkspaces);
  const nextHydratedTerminalScopes = new Set(state.hydratedTerminalScopes);
  const nextInitializingWorkspaces = new Set(state.initializingWorkspaces);
  const nextInitializingTerminalScopes = new Set(state.initializingTerminalScopes);
  const nextTmuxWindowsCache = { ...state.tmuxWindowsCache };
  const nextSaveTimeouts = { ...state.saveTimeouts };
  const nextProjectWikiLoadedWorkspaces = new Set(state.projectWikiLoadedWorkspaces);
  const nextProjectWikiInitializingWorkspaces = new Set(state.projectWikiInitializingWorkspaces);
  const nextCodeReviewLoadedWorkspaces = new Set(state.codeReviewLoadedWorkspaces);
  const nextCodeReviewInitializingWorkspaces = new Set(state.codeReviewInitializingWorkspaces);

  for (const key of Array.from(nextLoadedWorkspaces)) {
    if (isTerminalWorkspaceScopeKeyForWorkspace(key, workspaceId)) {
      nextLoadedWorkspaces.delete(key);
    }
  }
  for (const key of Array.from(nextInitializingWorkspaces)) {
    if (isTerminalWorkspaceScopeKeyForWorkspace(key, workspaceId)) {
      nextInitializingWorkspaces.delete(key);
    }
  }
  for (const key of Array.from(nextHydratedTerminalScopes)) {
    if (key === workspaceId || key.startsWith(`${workspaceId}::`)) {
      nextHydratedTerminalScopes.delete(key);
    }
  }
  for (const key of Array.from(nextInitializingTerminalScopes)) {
    if (key === workspaceId || key.startsWith(`${workspaceId}::`)) {
      nextInitializingTerminalScopes.delete(key);
    }
  }
  for (const key of Object.keys(nextTmuxWindowsCache)) {
    if (isTerminalWorkspaceScopeKeyForWorkspace(key, workspaceId)) {
      delete nextTmuxWindowsCache[key];
    }
  }
  for (const key of Object.keys(nextSaveTimeouts)) {
    if (isTerminalWorkspaceScopeKeyForWorkspace(key, workspaceId)) {
      delete nextSaveTimeouts[key];
    }
  }
  nextProjectWikiLoadedWorkspaces.delete(workspaceId);
  nextProjectWikiInitializingWorkspaces.delete(workspaceId);
  nextCodeReviewLoadedWorkspaces.delete(workspaceId);
  nextCodeReviewInitializingWorkspaces.delete(workspaceId);

  return {
    loadedWorkspaces: nextLoadedWorkspaces,
    hydratedTerminalScopes: nextHydratedTerminalScopes,
    initializingWorkspaces: nextInitializingWorkspaces,
    initializingTerminalScopes: nextInitializingTerminalScopes,
    tmuxWindowsCache: nextTmuxWindowsCache,
    saveTimeouts: nextSaveTimeouts,
    projectWikiLoadedWorkspaces: nextProjectWikiLoadedWorkspaces,
    projectWikiInitializingWorkspaces: nextProjectWikiInitializingWorkspaces,
    codeReviewLoadedWorkspaces: nextCodeReviewLoadedWorkspaces,
    codeReviewInitializingWorkspaces: nextCodeReviewInitializingWorkspaces,
  };
}

export function buildPersistedTerminalWorkspaceLayout(
  state: TerminalPersistenceState,
  workspaceId: string,
): PersistedTerminalWorkspaceLayoutDocument | null {
  const tabs = getWorkspaceTerminalTabs(state, workspaceId);
  const persistedCache = getPersistedTerminalLayoutForWorkspace(state, workspaceId);
  const persistedTabs: PersistedTerminalTabDocument[] = [];

  for (const tab of tabs) {
    const scopeKey = getScopeKey(workspaceId, tab.id);
    const panes = state.workspacePanes[scopeKey];
    const layout = state.workspaceLayouts[scopeKey];
    if (!panes || !layout) {
      const cachedTab = persistedCache?.tabs.find((persistedTab) => persistedTab.id === tab.id);
        if (cachedTab) {
          persistedTabs.push({
            ...cachedTab,
            title: tab.id === FIXED_TERMINAL_TAB_VALUE ? terminalT("tab.fixedTitle") : tab.title,
            closable: true,
            customTitle: tab.customTitle,
          });
        }
      continue;
    }

    const cleanPanes: Record<string, PersistedTerminalPane> = {};
    for (const [id, pane] of Object.entries(panes)) {
      cleanPanes[id] = {
        id: pane.id,
        label: pane.label,
        workspaceId: pane.workspaceId,
        tmuxWindowName: pane.tmuxWindowName,
        agent: pane.agent,
        projectName: pane.projectName,
        workspaceName: pane.workspaceName,
        isNewPane: pane.isNewPane,
        customLabel: pane.customLabel,
        keepAgentName: pane.keepAgentName,
        keepCwd: pane.keepCwd,
      };
    }

    persistedTabs.push({
      id: tab.id,
      title: tab.id === FIXED_TERMINAL_TAB_VALUE ? terminalT("tab.fixedTitle") : tab.title,
      closable: true,
      layout,
      panes: cleanPanes,
      maximizedTerminalId: state.workspaceMaximizedIds[scopeKey] || null,
      customTitle: tab.customTitle,
    });
  }

  if (persistedTabs.length === 0) {
    return Object.prototype.hasOwnProperty.call(state.workspaceTerminalTabs, workspaceId)
      ? {
          schema: TERMINAL_LAYOUT_SCHEMA,
          activeTabId: null,
          tabs: [],
        }
      : null;
  }

  const activeTerminalTabId = state.workspaceActiveTerminalTabIds[workspaceId];
  return {
    schema: TERMINAL_LAYOUT_SCHEMA,
    activeTabId:
      activeTerminalTabId && persistedTabs.some((tab) => tab.id === activeTerminalTabId)
        ? activeTerminalTabId
        : persistedTabs[0]?.id ?? null,
    tabs: persistedTabs,
  };
}

export function removePaneFromLayout(
  node: TerminalLayoutNode<string> | null,
  targetId: string,
): TerminalLayoutNode<string> | null {
  if (!node) return null;
  if (typeof node === "string") {
    return node === targetId ? null : node;
  }

  const first = removePaneFromLayout(node.first, targetId);
  const second = removePaneFromLayout(node.second, targetId);

  if (!first) return second;
  if (!second) return first;

  return { ...node, first, second };
}

export function splitPaneInLayout(
  node: TerminalLayoutNode<string>,
  targetId: string,
  newId: string,
  direction: TerminalLayoutDirection,
): TerminalLayoutNode<string> {
  if (typeof node === "string") {
    if (node === targetId) {
      return {
        direction,
        first: node,
        second: newId,
      };
    }
    return node;
  }

  return {
    ...node,
    first: splitPaneInLayout(node.first, targetId, newId, direction),
    second: splitPaneInLayout(node.second, targetId, newId, direction),
  };
}
