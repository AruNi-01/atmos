"use client";

import { create } from "zustand";
import type { AgentHookStateNotification } from "@atmos/api-types/ws/dto/events";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { getRuntimeApiConfig, httpBase } from "@/shared/lib/desktop-runtime";
import { agentHooksApi } from "@/api/rest-api";
import type {
  AgentAttentionSummaryDto,
  WorkspaceAgentGroupKeyDto,
} from "@/api/rest-api";
import {
  setAgentPaneAcknowledgedHandler,
  useAgentAttentionStore,
} from "@/features/agent/store/agent-attention-store";
import {
  hydrateAttentionSummariesFromServer,
  useAgentAttentionSummaryStore,
} from "@/features/agent/store/agent-attention-summary-store";
import {
  collectIdleSessionIdsForPane,
  collectSessionIdsForPane,
  resolveAgentStateForPaneId,
} from "@/features/agent/store/agent-hooks-idle";
import { useWorkspaceAgentGroupingHoldStore } from "@/features/agent/store/workspace-agent-grouping-hold";

export {
  collectIdleSessionIdsForPane,
  collectSessionIdsForPane,
  findSessionForPaneId,
  resolveAgentStateForPaneId,
} from "@/features/agent/store/agent-hooks-idle";

export const AGENT_STATE = {
  IDLE: "idle",
  RUNNING: "running",
  PERMISSION_REQUEST: "permission_request",
} as const;

export type AgentHookState = (typeof AGENT_STATE)[keyof typeof AGENT_STATE];

export const AGENT_TOOL = {
  CLAUDE_CODE: "claude-code",
  CODEX: "codex",
  CURSOR: "cursor",
  GEMINI: "gemini",
  ANTIGRAVITY: "antigravity",
  FACTORY_DROID: "factory-droid",
  KIRO: "kiro",
  OPENCODE: "opencode",
  AMPCODE: "ampcode",
  PI: "pi",
  HERMES: "hermes",
  GROK_BUILD: "grok-build",
} as const;

export type AgentToolType = (typeof AGENT_TOOL)[keyof typeof AGENT_TOOL];

export const AGENT_TOOL_LABELS: Record<AgentToolType, string> = {
  [AGENT_TOOL.CLAUDE_CODE]: "Claude Code",
  [AGENT_TOOL.CODEX]: "Codex",
  [AGENT_TOOL.CURSOR]: "Cursor",
  [AGENT_TOOL.GEMINI]: "Gemini CLI",
  [AGENT_TOOL.ANTIGRAVITY]: "Antigravity",
  [AGENT_TOOL.FACTORY_DROID]: "Factory Droid",
  [AGENT_TOOL.KIRO]: "Kiro",
  [AGENT_TOOL.OPENCODE]: "OpenCode",
  [AGENT_TOOL.AMPCODE]: "AMP",
  [AGENT_TOOL.PI]: "Pi",
  [AGENT_TOOL.HERMES]: "Hermes Agent",
  [AGENT_TOOL.GROK_BUILD]: "Grok Build",
};

export const AGENT_TOOL_ICON_IDS: Record<AgentToolType, string> = {
  [AGENT_TOOL.CLAUDE_CODE]: "claude-code",
  [AGENT_TOOL.CODEX]: "codex",
  [AGENT_TOOL.CURSOR]: "cursor",
  [AGENT_TOOL.GEMINI]: "gemini",
  [AGENT_TOOL.ANTIGRAVITY]: "antigravity",
  [AGENT_TOOL.FACTORY_DROID]: "factory-droid",
  [AGENT_TOOL.KIRO]: "kiro",
  [AGENT_TOOL.OPENCODE]: "opencode",
  [AGENT_TOOL.AMPCODE]: "amp",
  [AGENT_TOOL.PI]: "pi",
  [AGENT_TOOL.HERMES]: "hermes",
  [AGENT_TOOL.GROK_BUILD]: "grok-build",
};


export interface AgentHookSession {
  session_id: string;
  tool: AgentToolType;
  state: AgentHookState;
  timestamp: string;
  project_path?: string | null;
  /** effectiveContextId: workspace GUID or project GUID */
  context_id?: string | null;
  pane_id?: string | null;
  terminal_kind?: string | null;
  side_chat_id?: string | null;
  source_pane_id?: string | null;
  hook_version?: number | null;
}

interface AgentHooksStore {
  sessions: Map<string, AgentHookSession>;
  /**
   * Last grouping snapshot from API memory. Used until live sessions +
   * attention hydrate, so By Agent Status buckets survive a page refresh.
   */
  serverWorkspaceGroupKeys: Readonly<Record<string, WorkspaceAgentGroupKeyDto>>;
  hooksHydrated: boolean;
  _unsubscribe: (() => void) | null;

  init: () => void;
  cleanup: () => void;
  /**
   * Drop Computer-scoped hook/attention snapshots on target switch.
   * WS listeners stay; the next hydrate reads the new Computer's REST maps.
   */
  resetForConnectionChange: () => void;

  getAllSessions: () => AgentHookSession[];
  getSessionsByProjectPath: (projectPath: string) => AgentHookSession[];
  getAggregateAgentStateForProjectPath: (projectPath: string) => AgentHookState;
  getAgentStateForContextId: (contextId: string) => AgentHookState;
  getAgentStateForTool: (tool: AgentToolType | null) => AgentHookState;
  getAgentStateForPaneId: (paneId: string) => AgentHookState;
  getLatestSession: () => AgentHookSession | null;
  hasRunningSession: () => boolean;
  hasPermissionRequest: () => boolean;
  getGlobalState: () => AgentHookState;
  forceSessionIdle: (sessionId: string) => Promise<void>;
  removeSession: (sessionId: string) => Promise<void>;
  /**
   * Drop idle hook sessions for a focused/acknowledged pane.
   * Sticky attention already holds "needs attention"; idle rows do not need to
   * wait for the backend idle sweeper after the user has looked at the pane.
   */
  dismissIdleSessionsForPane: (stablePaneId: string) => void;
  /**
   * Drop every hook session attributed to a destroyed pane (running + idle,
   * including side-chats sourced from it). Map key may differ from pane_id.
   */
  removeSessionsForPane: (stablePaneId: string) => void;
  clearIdleSessions: () => Promise<void>;
}

export const useAgentHooksStore = create<AgentHooksStore>((set, get) => ({
  sessions: new Map(),
  serverWorkspaceGroupKeys: {},
  hooksHydrated: false,
  _unsubscribe: null,

  init: () => {
    const existing = get()._unsubscribe;
    if (existing) return;

    // When the user focuses a pane (or attention auto-clears while focused),
    // drop idle hook sessions for that pane — sticky attention already covered
    // the "needs attention" signal until acknowledge.
    setAgentPaneAcknowledgedHandler((stablePaneId) => {
      if (hydrateInFlight) {
        ackedDuringHydrate.add(stablePaneId);
        dropStaleServerGroupKey(set, get, stablePaneId);
      }
      get().dismissIdleSessionsForPane(stablePaneId);
    });

    const unsubscribeStateChanged = useWebSocketStore.getState().onEvent(
      "agent_hook_state_changed",
      (update: AgentHookStateNotification) => {
        const previous = get().sessions.get(update.session_id);
        set((state) => {
          const sessions = new Map(state.sessions);
          sessions.set(update.session_id, {
            session_id: update.session_id,
            tool: update.tool,
            state: update.state,
            timestamp: update.timestamp,
            project_path: update.project_path,
            context_id: update.context_id,
            pane_id: update.pane_id,
            terminal_kind: update.terminal_kind,
            side_chat_id: update.side_chat_id,
            source_pane_id: update.source_pane_id,
            hook_version: update.hook_version,
          });
          return { sessions };
        });

        // Sticky "need attention" latches — cleared on user click, or after a
        // short dwell when a jump auto-focuses the pane.
        const attention = useAgentAttentionStore.getState();
        const contextId = update.context_id ?? previous?.context_id ?? null;
        if (
          update.state === AGENT_STATE.PERMISSION_REQUEST &&
          previous?.state !== AGENT_STATE.PERMISSION_REQUEST
        ) {
          // Prefer Atmos pane_id (same key terminal focus reconstructs) over
          // raw agent session ids so focus can clear attention reliably.
          const stablePaneId =
            update.pane_id?.trim() ||
            previous?.pane_id?.trim() ||
            update.session_id;
          attention.raise({
            stablePaneId,
            contextId,
            reason: "permission_request",
            sessionId: update.session_id,
            tool: update.tool,
          });
        } else if (
          update.state === AGENT_STATE.IDLE &&
          previous?.state === AGENT_STATE.RUNNING
        ) {
          const stablePaneId =
            update.pane_id?.trim() ||
            previous?.pane_id?.trim() ||
            update.session_id;
          attention.raise({
            stablePaneId,
            contextId,
            reason: "task_complete",
            sessionId: update.session_id,
            tool: update.tool,
          });
        }
      }
    );

    const unsubscribeCleared = useWebSocketStore.getState().onEvent(
      "agent_hook_sessions_cleared",
      (data: unknown) => {
        const { session_ids } = data as { session_ids: string[] };
        if (!session_ids?.length) return;
        set((state) => {
          const sessions = new Map(state.sessions);
          for (const id of session_ids) sessions.delete(id);
          return { sessions };
        });
        // Do NOT clear sticky attention here. Idle session sweeps must not drop
        // need-attention latches — those live in API memory until acknowledge
        // (or pane destroy / explicit remove, which emit agent_attention_cleared).
      }
    );

    const unsubscribeAttentionRaised = useWebSocketStore.getState().onEvent(
      "agent_attention_raised",
      (data: unknown) => {
        const latch = data as {
          stable_pane_id?: string;
          context_id?: string;
          reason?: "permission_request" | "task_complete";
          session_id?: string;
          tool?: string;
          raised_at?: string;
        };
        if (!latch?.stable_pane_id || !latch.reason) return;
        useAgentAttentionStore.getState().raise({
          stablePaneId: latch.stable_pane_id,
          contextId: latch.context_id,
          reason: latch.reason,
          sessionId: latch.session_id,
          tool: latch.tool,
          raisedAt: latch.raised_at ? Date.parse(latch.raised_at) : undefined,
        });
      },
    );

    const unsubscribeAttentionCleared = useWebSocketStore.getState().onEvent(
      "agent_attention_cleared",
      (data: unknown) => {
        const { stable_pane_ids } = data as { stable_pane_ids?: string[] };
        if (!stable_pane_ids?.length) return;
        useAgentAttentionStore.getState().clearMatchingSessionIds(stable_pane_ids);
      },
    );

    const unsubscribeAttentionSummaryUpdated = useWebSocketStore
      .getState()
      .onEvent("agent_attention_summary_updated", (data: unknown) => {
        const dto = data as AgentAttentionSummaryDto;
        if (!dto?.stable_pane_id || !dto.status) return;
        useAgentAttentionSummaryStore.getState().upsert({
          stablePaneId: dto.stable_pane_id,
          contextId: dto.context_id,
          sessionId: dto.session_id || dto.stable_pane_id,
          status: dto.status,
          summary: dto.summary ?? undefined,
          nextSteps: Array.isArray(dto.next_steps)
            ? dto.next_steps.map(String).filter(Boolean)
            : [],
          canCloseSession:
            typeof dto.can_close_session === "boolean"
              ? dto.can_close_session
              : undefined,
          error: dto.error ?? undefined,
          startedAt: dto.started_at ? Date.parse(dto.started_at) : Date.now(),
          completedAt: dto.completed_at
            ? Date.parse(dto.completed_at)
            : undefined,
        });
      });

    const unsubscribeAttentionSummaryCleared = useWebSocketStore
      .getState()
      .onEvent("agent_attention_summary_cleared", (data: unknown) => {
        const { stable_pane_ids } = data as { stable_pane_ids?: string[] };
        if (!stable_pane_ids?.length) return;
        useAgentAttentionSummaryStore
          .getState()
          .clearMatchingIds(stable_pane_ids);
      });

    const _unsubscribe = () => {
      unsubscribeStateChanged();
      unsubscribeCleared();
      unsubscribeAttentionRaised();
      unsubscribeAttentionCleared();
      unsubscribeAttentionSummaryUpdated();
      unsubscribeAttentionSummaryCleared();
    };
    set({ _unsubscribe });

    void hydrateHookSnapshots(set, get, beginHydrateWindow());
    void hydrateAttentionSummariesFromServer();
  },

  resetForConnectionChange: () => {
    set({
      sessions: new Map(),
      serverWorkspaceGroupKeys: {},
      hooksHydrated: false,
    });
    useAgentAttentionStore.getState().hydrateFromServer([]);
    useAgentAttentionSummaryStore.getState().hydrateFromServer([]);
    useWorkspaceAgentGroupingHoldStore.getState().clearAll();
    void hydrateHookSnapshots(set, get, beginHydrateWindow());
    void hydrateAttentionSummariesFromServer();
  },

  cleanup: () => {
    const { _unsubscribe } = get();
    if (_unsubscribe) {
      _unsubscribe();
      setAgentPaneAcknowledgedHandler(null);
      invalidateHydrateWindow();
      set({
        _unsubscribe: null,
        sessions: new Map(),
        serverWorkspaceGroupKeys: {},
        hooksHydrated: false,
      });
      useAgentAttentionSummaryStore.getState().hydrateFromServer([]);
      useWorkspaceAgentGroupingHoldStore.getState().clearAll();
    }
  },

  getAllSessions: () => {
    return Array.from(get().sessions.values());
  },

  getSessionsByProjectPath: (projectPath: string) => {
    return Array.from(get().sessions.values()).filter(
      (s) => s.project_path === projectPath
    );
  },

  getAggregateAgentStateForProjectPath: (projectPath: string) => {
    let hasRunning = false;
    for (const s of get().sessions.values()) {
      if (s.project_path !== projectPath) continue;
      if (s.state === AGENT_STATE.PERMISSION_REQUEST) return AGENT_STATE.PERMISSION_REQUEST;
      if (s.state === AGENT_STATE.RUNNING) hasRunning = true;
    }
    return hasRunning ? AGENT_STATE.RUNNING : AGENT_STATE.IDLE;
  },

  getAgentStateForContextId: (contextId: string) => {
    let hasRunning = false;
    for (const s of get().sessions.values()) {
      if (s.context_id !== contextId) continue;
      if (s.state === AGENT_STATE.PERMISSION_REQUEST) return AGENT_STATE.PERMISSION_REQUEST;
      if (s.state === AGENT_STATE.RUNNING) hasRunning = true;
    }
    return hasRunning ? AGENT_STATE.RUNNING : AGENT_STATE.IDLE;
  },

  getAgentStateForTool: (tool: AgentToolType | null) => {
    if (!tool) return AGENT_STATE.IDLE;
    let hasRunning = false;
    for (const s of get().sessions.values()) {
      if (s.tool !== tool) continue;
      if (s.state === AGENT_STATE.PERMISSION_REQUEST) return AGENT_STATE.PERMISSION_REQUEST;
      if (s.state === AGENT_STATE.RUNNING) hasRunning = true;
    }
    return hasRunning ? AGENT_STATE.RUNNING : AGENT_STATE.IDLE;
  },

  getAgentStateForPaneId: (paneId: string) => {
    return resolveAgentStateForPaneId(get().sessions, paneId) as AgentHookState;
  },

  getLatestSession: () => {
    const sessions = Array.from(get().sessions.values());
    if (sessions.length === 0) return null;
    return sessions.reduce((latest, s) =>
      s.timestamp > latest.timestamp ? s : latest
    );
  },

  hasRunningSession: () => {
    return Array.from(get().sessions.values()).some(
      (s) => s.state === AGENT_STATE.RUNNING
    );
  },

  hasPermissionRequest: () => {
    return Array.from(get().sessions.values()).some(
      (s) => s.state === AGENT_STATE.PERMISSION_REQUEST
    );
  },

  getGlobalState: () => {
    const sessions = Array.from(get().sessions.values());
    if (sessions.some((s) => s.state === AGENT_STATE.PERMISSION_REQUEST))
      return AGENT_STATE.PERMISSION_REQUEST;
    if (sessions.some((s) => s.state === AGENT_STATE.RUNNING)) return AGENT_STATE.RUNNING;
    return AGENT_STATE.IDLE;
  },

  forceSessionIdle: async (sessionId: string) => {
    let previous: AgentHookSession | undefined;
    let optimistic: AgentHookSession | undefined;

    set((state) => {
      const session = state.sessions.get(sessionId);
      if (!session || session.state === AGENT_STATE.IDLE) return state;
      previous = session;
      optimistic = { ...session, state: AGENT_STATE.IDLE };
      const sessions = new Map(state.sessions);
      sessions.set(sessionId, optimistic);
      return { sessions };
    });

    if (!previous || !optimistic) return;
    const previousSession = previous;
    const optimisticSession = optimistic;

    try {
      await agentHooksApi.forceSessionIdle(sessionId);
    } catch (error) {
      console.warn("[AgentHooksStore] Failed to force session idle:", error);
      set((state) => {
        if (state.sessions.get(sessionId) !== optimisticSession) return state;
        const sessions = new Map(state.sessions);
        sessions.set(sessionId, previousSession);
        return { sessions };
      });
    }
  },

  removeSession: async (sessionId: string) => {
    let previous: AgentHookSession | undefined;

    set((state) => {
      previous = state.sessions.get(sessionId);
      if (!previous) return state;
      const sessions = new Map(state.sessions);
      sessions.delete(sessionId);
      return { sessions };
    });

    if (!previous) return;
    const previousSession = previous;

    try {
      await agentHooksApi.removeSession(sessionId);
    } catch (error) {
      console.warn("[AgentHooksStore] Failed to remove session:", error);
      set((state) => {
        if (state.sessions.has(sessionId)) return state;
        const sessions = new Map(state.sessions);
        sessions.set(sessionId, previousSession);
        return { sessions };
      });
    }
  },

  dismissIdleSessionsForPane: (stablePaneId) => {
    const toRemove = collectIdleSessionIdsForPane(get().sessions, stablePaneId);
    for (const id of toRemove) {
      void get().removeSession(id);
    }
  },

  removeSessionsForPane: (stablePaneId) => {
    const toRemove = collectSessionIdsForPane(get().sessions, stablePaneId, {
      includeSource: true,
    });
    for (const id of toRemove) {
      void get().removeSession(id);
    }
  },

  clearIdleSessions: async () => {
    try {
      const config = await getRuntimeApiConfig();
      const base = httpBase(config);
      const res = await fetch(`${base}/hooks/sessions/clear-idle`, {
        method: "POST",
      });
      if (!res.ok) return;
      set((state) => {
        const sessions = new Map(state.sessions);
        for (const [id, s] of sessions) {
          if (s.state === AGENT_STATE.IDLE) {
            sessions.delete(id);
          }
        }
        return { sessions };
      });
    } catch {
      // silent
    }
  },
}));

let hydrateGeneration = 0;
let hydrateInFlight = false;
const ackedDuringHydrate = new Set<string>();

function beginHydrateWindow(): number {
  ackedDuringHydrate.clear();
  hydrateInFlight = true;
  return ++hydrateGeneration;
}

function invalidateHydrateWindow() {
  hydrateGeneration += 1;
  hydrateInFlight = false;
  ackedDuringHydrate.clear();
}

function contextIdFromStablePaneId(stablePaneId: string): string {
  const idx = stablePaneId.indexOf(":");
  return idx === -1 ? stablePaneId : stablePaneId.slice(0, idx);
}

function dropStaleServerGroupKey(
  set: (partial: Partial<AgentHooksStore> | ((state: AgentHooksStore) => Partial<AgentHooksStore> | AgentHooksStore)) => void,
  get: () => AgentHooksStore,
  stablePaneId: string,
) {
  const contextId = contextIdFromStablePaneId(stablePaneId);
  if (!contextId) return;
  const attentionReason = useAgentAttentionStore
    .getState()
    .getContextReason(contextId);
  if (
    get().getAgentStateForContextId(contextId) !== AGENT_STATE.IDLE ||
    attentionReason
  ) {
    return;
  }
  set((state) => {
    if (!state.serverWorkspaceGroupKeys[contextId]) return state;
    const serverWorkspaceGroupKeys = { ...state.serverWorkspaceGroupKeys };
    delete serverWorkspaceGroupKeys[contextId];
    return { serverWorkspaceGroupKeys };
  });
}

async function hydrateHookSnapshots(
  set: (partial: Partial<AgentHooksStore> | ((state: AgentHooksStore) => Partial<AgentHooksStore> | AgentHooksStore)) => void,
  get: () => AgentHooksStore,
  generation: number,
): Promise<void> {
  const groupsPromise = fetchWorkspaceAgentGroups();
  const sessionsPromise = fetchInitialSessions();
  const attentionPromise = fetchInitialAttention();
  const groups = await groupsPromise;
  if (generation !== hydrateGeneration) return;
  if (groups.length > 0) {
    set((state) => {
      const serverWorkspaceGroupKeys = {
        ...state.serverWorkspaceGroupKeys,
      };
      for (const row of groups) {
        if (!row.context_id || row.group_key === "idle" || row.group_key === "done") continue;
        serverWorkspaceGroupKeys[row.context_id] = row.group_key;
      }
      for (const paneId of ackedDuringHydrate) {
        const contextId = contextIdFromStablePaneId(paneId);
        if (!contextId) continue;
        const attentionReason = useAgentAttentionStore
          .getState()
          .getContextReason(contextId);
        if (
          get().getAgentStateForContextId(contextId) === AGENT_STATE.IDLE &&
          !attentionReason
        ) {
          delete serverWorkspaceGroupKeys[contextId];
        }
      }
      return { serverWorkspaceGroupKeys };
    });
  }

  const [initialSessions, attention] = await Promise.all([
    sessionsPromise,
    attentionPromise,
  ]);
  if (generation !== hydrateGeneration) return;
  if (attention.length > 0) {
    const filteredAttention = attention.filter((latch) => {
      const paneId = latch.stable_pane_id?.trim();
      const sessionId = latch.session_id?.trim();
      if (paneId && ackedDuringHydrate.has(paneId)) return false;
      if (sessionId && ackedDuringHydrate.has(sessionId)) return false;
      return true;
    });
    useAgentAttentionStore.getState().hydrateFromServer(filteredAttention);
  }
  set((state) => {
    const sessions = new Map(state.sessions);
    for (const s of initialSessions) {
      if (!sessions.has(s.session_id)) {
        sessions.set(s.session_id, s);
      }
    }
    return {
      sessions,
      hooksHydrated: true,
    };
  });
  if (generation === hydrateGeneration) {
    hydrateInFlight = false;
  }
}

async function fetchWorkspaceAgentGroups(): Promise<
  import("@/api/rest-api").WorkspaceAgentGroupSnapshotDto[]
> {
  try {
    const { groups } = await agentHooksApi.listWorkspaceAgentGroups();
    return groups ?? [];
  } catch {
    return [];
  }
}

async function fetchInitialSessions(): Promise<AgentHookSession[]> {
  try {
    const config = await getRuntimeApiConfig();
    const base = httpBase(config);
    const res = await fetch(`${base}/hooks/sessions`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.sessions ?? [];
  } catch {
    return [];
  }
}

async function fetchInitialAttention(): Promise<
  import("@/api/rest-api").AgentAttentionLatchDto[]
> {
  try {
    const { attention } = await agentHooksApi.listAttention();
    return attention ?? [];
  } catch {
    return [];
  }
}
