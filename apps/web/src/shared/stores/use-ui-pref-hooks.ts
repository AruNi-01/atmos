'use client';

import { useCallback, useEffect, useMemo } from 'react';
import type { CanvasTldrawSession } from '@/shared/types/canvas';
import { useAtmosComputerStore } from '@/features/connection/lib/atmos-computer-store';
import {
  instanceIdFromRelaySelection,
  type ConnectionInstanceId,
} from '@/features/connection/lib/connection-instance';
import { useConnectionStore } from '@/features/connection/store/connection-store';
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
  lastSessionByContext: Record<string, string>;
}

const DEFAULT_AGENT_PREFS: AgentUiPrefs = {
  defaultRegistryId: null,
  lastSessionByContext: {},
};

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

export function writeAgentLastSession(contextKey: string, sessionGuid: string): void {
  const instanceId = useConnectionStore.getState().activeInstanceId;
  useUiPrefStore.getState().patchSlice(
    instanceId,
    'agent',
    prev => ({
      ...prev,
      lastSessionByContext: { ...prev.lastSessionByContext, [contextKey]: sessionGuid },
    }),
    DEFAULT_AGENT_PREFS,
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

// --- Usage ---

const DEFAULT_USAGE_PREFS: { providerOrder: string[] } = {
  providerOrder: [],
};

export function useUsageProviderOrder(): [
  string[],
  (order: string[] | ((prev: string[]) => string[])) => void,
] {
  const [prefs, setPrefs] = useInstanceSlice<{ providerOrder: string[] }>(
    'usage',
    DEFAULT_USAGE_PREFS,
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
  tabGroupOrderByContext: Record<string, Record<string, string[]>>;
}

const DEFAULT_CENTER_STAGE: CenterStageUiPrefs = {
  lastTabByContext: {},
  tabGroupOrderByContext: {},
};

export function useCenterStageUiPrefs(): CenterStageUiPrefs {
  const instanceId = useActiveInstanceId();
  const readSlice = useUiPrefStore(s => s.readSlice);
  return useMemo(
    () => readSlice(instanceId, 'centerStage', DEFAULT_CENTER_STAGE),
    [instanceId, readSlice],
  );
}

export function setCenterStageLastTab(contextId: string, tab: string): void {
  const instanceId = useConnectionStore.getState().activeInstanceId;
  useUiPrefStore.getState().patchSlice(
    instanceId,
    'centerStage',
    prev => ({
      ...prev,
      lastTabByContext: { ...prev.lastTabByContext, [contextId]: tab },
    }),
    DEFAULT_CENTER_STAGE,
  );
}

export function readCenterStageLastTab(contextId: string): string | undefined {
  const instanceId = useConnectionStore.getState().activeInstanceId;
  return useUiPrefStore.getState().readSlice(instanceId, 'centerStage', DEFAULT_CENTER_STAGE)
    .lastTabByContext[contextId];
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

// --- Run preview tabs ---

export interface RunTerminalTab {
  id: string;
  name: string;
}

const DEFAULT_RUN_TABS: RunTerminalTab[] = [{ id: '1', name: 'Run' }];

export function useRunPreviewTabs(contextId: string): [RunTerminalTab[], (tabs: RunTerminalTab[]) => void] {
  const instanceId = useActiveInstanceId();
  const readSlice = useUiPrefStore(s => s.readSlice);
  const patchSlice = useUiPrefStore(s => s.patchSlice);

  const all = useMemo(
    () => readSlice(instanceId, 'runPreview', { byContext: {} as Record<string, RunTerminalTab[]> }),
    [instanceId, readSlice],
  );

  const tabs = all.byContext[contextId] ?? DEFAULT_RUN_TABS;

  const setTabs = useCallback(
    (next: RunTerminalTab[]) => {
      patchSlice(
        instanceId,
        'runPreview',
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
}

const DEFAULT_CANVAS_PREFS: CanvasUiPrefs = {
  sessionByBoard: {},
  lastPinnedByBoard: {},
  agentClientId: null,
  acceptsCommands: false,
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
  { clientId: string | null; acceptsCommands: boolean },
  {
    setClientId: (id: string) => void;
    setAcceptsCommands: (value: boolean) => void;
  },
] {
  const [prefs, setPrefs] = useInstanceSlice('canvas', DEFAULT_CANVAS_PREFS);
  return [
    { clientId: prefs.agentClientId, acceptsCommands: prefs.acceptsCommands },
    {
      setClientId: id =>
        setPrefs(prev => ({ ...prev, agentClientId: id })),
      setAcceptsCommands: value =>
        setPrefs(prev => ({ ...prev, acceptsCommands: value })),
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
