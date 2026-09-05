'use client';

import { useCallback, useEffect, useMemo } from 'react';
import type { CanvasTldrawSession } from '@/shared/types/canvas';
import { useAtmosComputerStore } from '@/features/connection/lib/atmos-computer-store';
import {
  instanceIdFromRelaySelection,
  type ConnectionInstanceId,
} from '@/features/connection/lib/connection-instance';
import { getActiveInstanceId, useConnectionStore } from '@/features/connection/store/connection-store';
import { useUiPrefStore, type UiPrefSlice } from '@/shared/stores/use-ui-pref-store';

function useActiveInstanceId() {
  return useConnectionStore(s => s.activeInstanceId);
}

function useInstanceSlice<T>(slice: UiPrefSlice, fallback: T): [T, (value: T | ((prev: T) => T)) => void] {
  const instanceId = useActiveInstanceId();
  const readSlice = useUiPrefStore(s => s.readSlice);
  const patchSlice = useUiPrefStore(s => s.patchSlice);

  useEffect(() => {
    readSlice(instanceId, slice, fallback);
  }, [instanceId, slice, fallback, readSlice]);

  const value = useUiPrefStore(
    s => (s.byInstance[instanceId]?.[slice] as T | undefined) ?? fallback,
  );

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      patchSlice(instanceId, slice, next, fallback);
    },
    [instanceId, slice, patchSlice, fallback],
  );

  return [value, setValue];
}

// --- Agent ---

export interface AgentUiPrefs {
  defaultRegistryId: string | null;
  lastSessionByContext: Record<string, AgentLastSession | string>;
}

const DEFAULT_AGENT_PREFS: AgentUiPrefs = {
  defaultRegistryId: null,
  lastSessionByContext: {},
};

export interface AgentLastSession {
  registryId: string;
  chatId?: string | null;
  /** @deprecated pre-APP-067 ACP identity; ignored when restoring history */
  acpSessionId?: string;
  cwd: string | null;
  workspaceId: string | null;
  projectId: string | null;
  updatedAt: number;
  modelId?: string | null;
  thinkingId?: string | null;
}

export function useAgentUiPrefs(): [
  AgentUiPrefs,
  (patch: Partial<AgentUiPrefs> | ((prev: AgentUiPrefs) => AgentUiPrefs)) => void,
] {
  const [prefs, setPrefs] = useInstanceSlice<AgentUiPrefs>('agent', DEFAULT_AGENT_PREFS);
  const patch = useCallback(
    (updater: Partial<AgentUiPrefs> | ((prev: AgentUiPrefs) => AgentUiPrefs)) => {
      setPrefs(prev =>
        typeof updater === 'function' ? updater(prev) : { ...prev, ...updater },
      );
    },
    [setPrefs],
  );
  return [prefs, patch];
}

export function readDefaultAgentRegistryId(): string | null {
  const instanceId = useConnectionStore.getState().activeInstanceId;
  return useUiPrefStore.getState().readSlice(instanceId, 'agent', DEFAULT_AGENT_PREFS)
    .defaultRegistryId;
}

export function writeDefaultAgentRegistryId(registryId: string): void {
  const instanceId = useConnectionStore.getState().activeInstanceId;
  useUiPrefStore.getState().patchSlice(
    instanceId,
    'agent',
    prev => ({ ...prev, defaultRegistryId: registryId || null }),
    DEFAULT_AGENT_PREFS,
  );
}

export function readAgentLastSession(contextKey: string): AgentLastSession | null {
  const instanceId = useConnectionStore.getState().activeInstanceId;
  const value = useUiPrefStore.getState().readSlice(instanceId, 'agent', DEFAULT_AGENT_PREFS)
    .lastSessionByContext[contextKey];
  if (!value || typeof value === 'string') return null;
  if (!value.registryId) return null;
  return {
    ...value,
    chatId: value.chatId?.trim() || null,
  };
}

export function writeAgentLastSession(contextKey: string, session: AgentLastSession): void {
  const instanceId = useConnectionStore.getState().activeInstanceId;
  useUiPrefStore.getState().patchSlice(
    instanceId,
    'agent',
    prev => ({
      ...prev,
      lastSessionByContext: { ...prev.lastSessionByContext, [contextKey]: session },
    }),
    DEFAULT_AGENT_PREFS,
  );
}

export function clearAgentLastSession(contextKey: string): void {
  const instanceId = useConnectionStore.getState().activeInstanceId;
  useUiPrefStore.getState().patchSlice(
    instanceId,
    'agent',
    prev => {
      const next = { ...prev.lastSessionByContext };
      for (const key of Object.keys(next)) {
        if (lastSessionKeyMatchesContext(key, contextKey)) {
          delete next[key];
        }
      }
      return { ...prev, lastSessionByContext: next };
    },
    DEFAULT_AGENT_PREFS,
  );
}

function lastSessionKeyMatchesContext(key: string, contextKey: string): boolean {
  if (!contextKey) return false;
  if (key === contextKey || key.startsWith(`${contextKey}:`)) return true;
  return (
    key.startsWith(`workspace:${contextKey}`) ||
    key.startsWith(`project:${contextKey}`)
  );
}

// --- Review / Code review ---

export function useReviewDefaultAgentId(): [string | null, (id: string) => void] {
  const [prefs, setPrefs] = useInstanceSlice<{ defaultAgentId: string | null }>('review', {
    defaultAgentId: null,
  });
  return [
    prefs.defaultAgentId,
    id => setPrefs({ defaultAgentId: id }),
  ];
}

export function useCodeReviewDefaults(): [
  { defaultSkillId: string | null; defaultAgentId: string | null },
  (patch: { defaultSkillId?: string | null; defaultAgentId?: string | null }) => void,
] {
  const fallback = { defaultSkillId: null as string | null, defaultAgentId: null as string | null };
  const [prefs, setPrefs] = useInstanceSlice('codeReview', fallback);
  return [prefs, patch => setPrefs(prev => ({ ...prev, ...patch }))];
}

// --- Agent Fix ---

export interface AgentFixUiPrefs {
  lastAgentId: string | null;
}

const DEFAULT_AGENT_FIX_PREFS: AgentFixUiPrefs = {
  lastAgentId: null,
};

export function useAgentFixLastAgentId(): [string | null, (id: string) => void] {
  const [prefs, setPrefs] = useInstanceSlice<AgentFixUiPrefs>('agentFix', DEFAULT_AGENT_FIX_PREFS);
  return [
    prefs.lastAgentId,
    id => setPrefs({ lastAgentId: id || null }),
  ];
}

// --- Sidebar view modes ---

export interface SidebarUiPrefs {
  changesFileViewMode: 'list' | 'tree';
  reviewFileViewMode: 'list' | 'tree';
}

const DEFAULT_SIDEBAR_PREFS: SidebarUiPrefs = {
  changesFileViewMode: 'list',
  reviewFileViewMode: 'list',
};

export function useSidebarUiPrefs(): [
  SidebarUiPrefs,
  (patch: Partial<SidebarUiPrefs>) => void,
] {
  const [prefs, setPrefs] = useInstanceSlice('sidebar', DEFAULT_SIDEBAR_PREFS);
  return [prefs, patch => setPrefs(prev => ({ ...prev, ...patch }))];
}

// --- Quota usage (provider order in popover) ---

const DEFAULT_QUOTA_PREFS: { providerOrder: string[] } = {
  providerOrder: [],
};

export function useQuotaProviderOrder(): [
  string[],
  (order: string[] | ((prev: string[]) => string[])) => void,
] {
  const [prefs, setPrefs] = useInstanceSlice<{ providerOrder: string[] }>(
    "quota",
    DEFAULT_QUOTA_PREFS,
  );
  const setProviderOrder = useCallback(
    (order: string[] | ((prev: string[]) => string[])) => {
      setPrefs(prev => ({
        providerOrder: typeof order === 'function' ? order(prev.providerOrder) : order,
      }));
    },
    [setPrefs],
  );

  return [prefs.providerOrder, setProviderOrder];
}

// --- Center stage ---

export interface CenterStageUiPrefs {
  lastTabByContext: Record<string, string>;
  wikiPageByContext: Record<string, string>;
  tabGroupOrderByContext: Record<string, Record<string, string[]>>;
  /** Per-workspace center strip tab id order (drag-and-drop). */
  tabStripOrderByContext: Record<string, string[]>;
  /** @deprecated Kept for reading old prefs only; pin feature removed. */
  pinnedTabsByContext?: Record<string, Record<string, number>>;
  filesExplorerCollapsed?: boolean;
  filesExplorerWidth?: number;
  changesExplorerCollapsed?: boolean;
  changesExplorerWidth?: number;
}

const CENTER_EXPLORER_DEFAULT_WIDTH = 260;
const CENTER_EXPLORER_MIN_WIDTH = 180;
const CENTER_EXPLORER_MAX_WIDTH = 480;

function clampStoredExplorerWidth(width: number): number {
  if (!Number.isFinite(width)) return CENTER_EXPLORER_DEFAULT_WIDTH;
  return Math.min(
    CENTER_EXPLORER_MAX_WIDTH,
    Math.max(CENTER_EXPLORER_MIN_WIDTH, Math.round(width)),
  );
}

const DEFAULT_CENTER_STAGE: CenterStageUiPrefs = {
  lastTabByContext: {},
  wikiPageByContext: {},
  tabGroupOrderByContext: {},
  tabStripOrderByContext: {},
  filesExplorerCollapsed: false,
  filesExplorerWidth: CENTER_EXPLORER_DEFAULT_WIDTH,
  changesExplorerCollapsed: false,
  changesExplorerWidth: CENTER_EXPLORER_DEFAULT_WIDTH,
};

export type CenterExplorerKindPref = 'files' | 'changes';

export type CenterExplorerLayoutPrefs = {
  filesCollapsed: boolean;
  filesWidth: number;
  changesCollapsed: boolean;
  changesWidth: number;
};

function explorerLayoutFromSlice(slice: CenterStageUiPrefs): CenterExplorerLayoutPrefs {
  return {
    filesCollapsed: slice.filesExplorerCollapsed === true,
    filesWidth: clampStoredExplorerWidth(
      slice.filesExplorerWidth ?? CENTER_EXPLORER_DEFAULT_WIDTH,
    ),
    changesCollapsed: slice.changesExplorerCollapsed === true,
    changesWidth: clampStoredExplorerWidth(
      slice.changesExplorerWidth ?? CENTER_EXPLORER_DEFAULT_WIDTH,
    ),
  };
}

export function useCenterExplorerLayout(): [
  CenterExplorerLayoutPrefs,
  {
    setCollapsed: (kind: CenterExplorerKindPref, collapsed: boolean) => void;
    toggleCollapsed: (kind: CenterExplorerKindPref) => void;
    setWidth: (kind: CenterExplorerKindPref, width: number) => void;
  },
] {
  const prefs = useCenterStageUiPrefs();
  const layout = explorerLayoutFromSlice(prefs);

  const setCollapsed = useCallback((kind: CenterExplorerKindPref, collapsed: boolean) => {
    const instanceId = useConnectionStore.getState().activeInstanceId;
    useUiPrefStore.getState().patchSlice(
      instanceId,
      'centerStage',
      (prev) =>
        kind === 'files'
          ? { ...prev, filesExplorerCollapsed: collapsed }
          : { ...prev, changesExplorerCollapsed: collapsed },
      DEFAULT_CENTER_STAGE,
    );
  }, []);

  const toggleCollapsed = useCallback((kind: CenterExplorerKindPref) => {
    const instanceId = useConnectionStore.getState().activeInstanceId;
    useUiPrefStore.getState().patchSlice(
      instanceId,
      'centerStage',
      (prev) => {
        const current = explorerLayoutFromSlice(prev);
        return kind === 'files'
          ? { ...prev, filesExplorerCollapsed: !current.filesCollapsed }
          : { ...prev, changesExplorerCollapsed: !current.changesCollapsed };
      },
      DEFAULT_CENTER_STAGE,
    );
  }, []);

  const setWidth = useCallback((kind: CenterExplorerKindPref, width: number) => {
    const next = clampStoredExplorerWidth(width);
    const instanceId = useConnectionStore.getState().activeInstanceId;
    useUiPrefStore.getState().patchSlice(
      instanceId,
      'centerStage',
      (prev) =>
        kind === 'files'
          ? { ...prev, filesExplorerWidth: next }
          : { ...prev, changesExplorerWidth: next },
      DEFAULT_CENTER_STAGE,
    );
  }, []);

  return [layout, { setCollapsed, toggleCollapsed, setWidth }];
}

export function setCenterExplorerCollapsed(
  kind: CenterExplorerKindPref,
  collapsed: boolean,
): void {
  const instanceId = useConnectionStore.getState().activeInstanceId;
  useUiPrefStore.getState().patchSlice(
    instanceId,
    'centerStage',
    (prev) =>
      kind === 'files'
        ? { ...prev, filesExplorerCollapsed: collapsed }
        : { ...prev, changesExplorerCollapsed: collapsed },
    DEFAULT_CENTER_STAGE,
  );
}

export function useCenterStageUiPrefs(): CenterStageUiPrefs {
  const instanceId = useActiveInstanceId();
  const readSlice = useUiPrefStore(s => s.readSlice);
  useEffect(() => {
    readSlice(instanceId, 'centerStage', DEFAULT_CENTER_STAGE);
  }, [instanceId, readSlice]);
  return useUiPrefStore(
    s =>
      (s.byInstance[instanceId]?.centerStage as CenterStageUiPrefs | undefined) ??
      DEFAULT_CENTER_STAGE,
  );
}

export function setCenterStageLastTab(contextId: string, tab: string): void {
  const instanceId = useConnectionStore.getState().activeInstanceId;
  useUiPrefStore.getState().patchSlice(
    instanceId,
    'centerStage',
    prev => ({
      ...prev,
      lastTabByContext: { ...(prev.lastTabByContext ?? {}), [contextId]: tab },
    }),
    DEFAULT_CENTER_STAGE,
  );
}

export function readCenterStageLastTab(contextId: string): string | undefined {
  const instanceId = useConnectionStore.getState().activeInstanceId;
  return useUiPrefStore.getState().readSlice(instanceId, 'centerStage', DEFAULT_CENTER_STAGE)
    .lastTabByContext?.[contextId];
}

export function useCenterStageLastTab(contextId: string | null): string | undefined {
  const instanceId = useActiveInstanceId();
  const readSlice = useUiPrefStore(s => s.readSlice);
  useEffect(() => {
    readSlice(instanceId, 'centerStage', DEFAULT_CENTER_STAGE);
  }, [instanceId, readSlice]);
  return useUiPrefStore(s => {
    if (!contextId) return undefined;
    const slice = s.byInstance[instanceId]?.centerStage as CenterStageUiPrefs | undefined;
    return slice?.lastTabByContext?.[contextId];
  });
}

export function setCenterStageWikiPage(contextId: string, page: string | null): void {
  const instanceId = useConnectionStore.getState().activeInstanceId;
  useUiPrefStore.getState().patchSlice(
    instanceId,
    'centerStage',
    prev => {
      const wikiPageByContext = { ...(prev.wikiPageByContext ?? {}) };
      if (!page) delete wikiPageByContext[contextId];
      else wikiPageByContext[contextId] = page;
      return { ...prev, wikiPageByContext };
    },
    DEFAULT_CENTER_STAGE,
  );
}

export function useCenterStageWikiPage(contextId: string | null): string | undefined {
  const instanceId = useActiveInstanceId();
  return useUiPrefStore(s => {
    if (!contextId) return undefined;
    const slice = s.byInstance[instanceId]?.centerStage as CenterStageUiPrefs | undefined;
    return slice?.wikiPageByContext?.[contextId];
  });
}

export function readCenterStageTabGroupOrder(): CenterStageUiPrefs['tabGroupOrderByContext'] {
  const instanceId = useConnectionStore.getState().activeInstanceId;
  return useUiPrefStore.getState().readSlice(instanceId, 'centerStage', DEFAULT_CENTER_STAGE)
    .tabGroupOrderByContext;
}

export function writeCenterStageTabGroupOrder(
  order: CenterStageUiPrefs['tabGroupOrderByContext'],
): void {
  const instanceId = useConnectionStore.getState().activeInstanceId;
  useUiPrefStore.getState().patchSlice(
    instanceId,
    'centerStage',
    prev => ({ ...prev, tabGroupOrderByContext: order }),
    DEFAULT_CENTER_STAGE,
  );
}

export function readCenterStageTabStripOrder(contextId: string): string[] {
  const instanceId = useConnectionStore.getState().activeInstanceId;
  const order = useUiPrefStore.getState().readSlice(
    instanceId,
    'centerStage',
    DEFAULT_CENTER_STAGE,
  ).tabStripOrderByContext?.[contextId];
  return Array.isArray(order) ? order.filter((id): id is string => typeof id === 'string') : [];
}

/** Drop per-space chrome and Run tabs when a center space is deleted. */
export function forgetPaintContextUiPrefs(paintContextId: string): void {
  if (!paintContextId) return;
  const instanceId = getActiveInstanceId();
  const store = useUiPrefStore.getState();
  store.patchSlice(
    instanceId,
    'run',
    prev => {
      const byContext = {
        ...((prev as { byContext?: Record<string, unknown> }).byContext ?? {}),
      };
      if (!(paintContextId in byContext)) return prev as { byContext: Record<string, unknown> };
      delete byContext[paintContextId];
      return { byContext };
    },
    { byContext: {} },
  );
  store.patchSlice(
    instanceId,
    'centerStage',
    prev => {
      const lastTabByContext = { ...(prev.lastTabByContext ?? {}) };
      const wikiPageByContext = { ...(prev.wikiPageByContext ?? {}) };
      const tabGroupOrderByContext = { ...(prev.tabGroupOrderByContext ?? {}) };
      const tabStripOrderByContext = { ...(prev.tabStripOrderByContext ?? {}) };
      const pinnedTabsByContext = { ...(prev.pinnedTabsByContext ?? {}) };
      delete lastTabByContext[paintContextId];
      delete wikiPageByContext[paintContextId];
      delete tabGroupOrderByContext[paintContextId];
      delete tabStripOrderByContext[paintContextId];
      delete pinnedTabsByContext[paintContextId];
      return {
        ...prev,
        lastTabByContext,
        wikiPageByContext,
        tabGroupOrderByContext,
        tabStripOrderByContext,
        pinnedTabsByContext,
      };
    },
    DEFAULT_CENTER_STAGE,
  );
}

export function writeCenterStageTabStripOrder(
  contextId: string,
  order: string[],
): void {
  const instanceId = useConnectionStore.getState().activeInstanceId;
  useUiPrefStore.getState().patchSlice(
    instanceId,
    'centerStage',
    prev => ({
      ...prev,
      tabStripOrderByContext: {
        ...(prev.tabStripOrderByContext ?? {}),
        [contextId]: order,
      },
    }),
    DEFAULT_CENTER_STAGE,
  );
}

// --- Run tabs ---

export interface RunTerminalTab {
  id: string;
  name: string;
}

const DEFAULT_RUN_TABS: RunTerminalTab[] = [{ id: '1', name: 'Run' }];

export function useRunTabs(contextId: string): [RunTerminalTab[], (tabs: RunTerminalTab[]) => void] {
  const instanceId = useActiveInstanceId();
  const readSlice = useUiPrefStore(s => s.readSlice);
  const patchSlice = useUiPrefStore(s => s.patchSlice);

  const all = useMemo(
    () => readSlice(instanceId, 'run', { byContext: {} as Record<string, RunTerminalTab[]> }),
    [instanceId, readSlice],
  );

  const tabs = all.byContext[contextId] ?? DEFAULT_RUN_TABS;

  const setTabs = useCallback(
    (next: RunTerminalTab[]) => {
      patchSlice(
        instanceId,
        'run',
        prev => ({
          byContext: {
            ...(prev as { byContext: Record<string, RunTerminalTab[]> }).byContext,
            [contextId]: next,
          },
        }),
        { byContext: {} },
      );
    },
    [instanceId, contextId, patchSlice],
  );

  return [tabs, setTabs];
}

// --- Canvas ---

export interface CanvasLastPinnedTerminal {
  pinKey: string;
  shapeId: string;
  pinnedAt: number;
}

export interface CanvasUiPrefs {
  sessionByBoard: Record<string, CanvasTldrawSession>;
  /** Last terminal pinned onto each board — used to auto-focus on Canvas open. */
  lastPinnedByBoard: Record<string, CanvasLastPinnedTerminal>;
  agentClientId: string | null;
  acceptsCommands: boolean;
  /**
   * When true, camera pans/zooms to shapes the canvas agent touches.
   * Turn off when drawing alongside the agent.
   */
  agentFollow: boolean;
}

export const DEFAULT_CANVAS_PREFS: CanvasUiPrefs = {
  sessionByBoard: {},
  lastPinnedByBoard: {},
  agentClientId: null,
  acceptsCommands: false,
  agentFollow: true,
};

/** Merge persisted canvas prefs with defaults (older saves omit new fields). */
function normalizeCanvasPrefs(raw: Partial<CanvasUiPrefs> | null | undefined): CanvasUiPrefs {
  return {
    ...DEFAULT_CANVAS_PREFS,
    ...raw,
    sessionByBoard: raw?.sessionByBoard ?? DEFAULT_CANVAS_PREFS.sessionByBoard,
    lastPinnedByBoard: raw?.lastPinnedByBoard ?? DEFAULT_CANVAS_PREFS.lastPinnedByBoard,
  };
}

function readCanvasPrefs(): CanvasUiPrefs {
  const instanceId = resolveCanvasPrefsInstanceId();
  const raw = useUiPrefStore.getState().readSlice(instanceId, "canvas", DEFAULT_CANVAS_PREFS);
  return normalizeCanvasPrefs(raw);
}

/** Canvas session prefs follow the relay/local computer target, not a stale instance id. */
export function resolveCanvasPrefsInstanceId(): ConnectionInstanceId {
  const computer = useAtmosComputerStore.getState();
  return instanceIdFromRelaySelection(computer.connectionMode, computer.selectedServerId);
}

export function readCanvasSession(boardGuid?: string | null): CanvasTldrawSession | null {
  const key = boardGuid ?? 'default';
  return readCanvasPrefs().sessionByBoard[key] ?? null;
}

export function readLastPinnedTerminal(
  boardGuid?: string | null,
): CanvasLastPinnedTerminal | null {
  const key = boardGuid ?? "default";
  return readCanvasPrefs().lastPinnedByBoard[key] ?? null;
}

/** Read pending auto-focus pin once, then remove it from storage. */
export function consumeLastPinnedTerminal(
  boardGuid?: string | null,
): CanvasLastPinnedTerminal | null {
  const key = boardGuid ?? "default";
  const instanceId = resolveCanvasPrefsInstanceId();
  let consumed: CanvasLastPinnedTerminal | null = null;
  useUiPrefStore.getState().patchSlice(
    instanceId,
    "canvas",
    (prev) => {
      const base = normalizeCanvasPrefs(prev);
      const current = base.lastPinnedByBoard[key];
      if (!current) return base;
      consumed = current;
      const nextBoard = { ...base.lastPinnedByBoard };
      delete nextBoard[key];
      return { ...base, lastPinnedByBoard: nextBoard };
    },
    DEFAULT_CANVAS_PREFS,
  );
  return consumed;
}

export function writeLastPinnedTerminal(
  entry: CanvasLastPinnedTerminal,
  boardGuid?: string | null,
): void {
  const key = boardGuid ?? "default";
  const instanceId = resolveCanvasPrefsInstanceId();
  useUiPrefStore.getState().patchSlice(
    instanceId,
    "canvas",
    (prev) => {
      const base = normalizeCanvasPrefs(prev);
      return {
        ...base,
        lastPinnedByBoard: { ...base.lastPinnedByBoard, [key]: entry },
      };
    },
    DEFAULT_CANVAS_PREFS,
  );
}

export function clearLastPinnedTerminal(
  boardGuid?: string | null,
  pinKey?: string,
): void {
  const key = boardGuid ?? "default";
  const instanceId = resolveCanvasPrefsInstanceId();
  useUiPrefStore.getState().patchSlice(
    instanceId,
    "canvas",
    (prev) => {
      const base = normalizeCanvasPrefs(prev);
      const current = base.lastPinnedByBoard[key];
      if (!current) return base;
      if (pinKey && current.pinKey !== pinKey) return base;
      const next = { ...base.lastPinnedByBoard };
      delete next[key];
      return { ...base, lastPinnedByBoard: next };
    },
    DEFAULT_CANVAS_PREFS,
  );
}

export function writeCanvasSession(
  session: CanvasTldrawSession,
  boardGuid?: string | null,
): void {
  const key = boardGuid ?? 'default';
  const instanceId = resolveCanvasPrefsInstanceId();
  useUiPrefStore.getState().patchSlice(
    instanceId,
    'canvas',
    (prev) => {
      const base = normalizeCanvasPrefs(prev);
      return {
        ...base,
        sessionByBoard: { ...base.sessionByBoard, [key]: session },
      };
    },
    DEFAULT_CANVAS_PREFS,
  );
}

export function useCanvasAgentBridgePrefs(): [
  { clientId: string | null; acceptsCommands: boolean; agentFollow: boolean },
  {
    setClientId: (id: string) => void;
    setAcceptsCommands: (value: boolean) => void;
    setAgentFollow: (value: boolean) => void;
  },
] {
  const [prefs, setPrefs] = useInstanceSlice('canvas', DEFAULT_CANVAS_PREFS);
  return [
    {
      clientId: prefs.agentClientId,
      acceptsCommands: prefs.acceptsCommands,
      agentFollow: prefs.agentFollow !== false,
    },
    {
      setClientId: id =>
        setPrefs(prev => ({ ...prev, agentClientId: id })),
      setAcceptsCommands: value =>
        setPrefs(prev => ({ ...prev, acceptsCommands: value })),
      setAgentFollow: value =>
        setPrefs(prev => ({ ...prev, agentFollow: value })),
    },
  ];
}

// --- Global quick open (not instance-scoped) ---

import { globalKey, readJson, writeJson } from '@/shared/lib/browser-store';

const QUICK_OPEN_KEY = globalKey('quickOpenLastUsed');

export function readQuickOpenLastUsed(): string | null {
  return readJson<string | null>(QUICK_OPEN_KEY, null);
}

export function writeQuickOpenLastUsed(appName: string): void {
  writeJson(QUICK_OPEN_KEY, appName);
}

export const EXT_VERSION_CHECK_KEY = globalKey('extVersionCheckTs');

export function readExtVersionCheckTs(): number {
  return readJson(EXT_VERSION_CHECK_KEY, 0);
}

export function writeExtVersionCheckTs(ts: number): void {
  writeJson(EXT_VERSION_CHECK_KEY, ts);
}
