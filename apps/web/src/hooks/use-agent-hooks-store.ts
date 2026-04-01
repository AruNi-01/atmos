"use client";

import { create } from "zustand";
import { useWebSocketStore } from "./use-websocket";
import { getRuntimeApiConfig, httpBase } from "@/lib/desktop-runtime";

export const AGENT_STATE = {
  IDLE: "idle",
  RUNNING: "running",
  PERMISSION_REQUEST: "permission_request",
} as const;

export type AgentHookState = (typeof AGENT_STATE)[keyof typeof AGENT_STATE];

export const AGENT_TOOL = {
  CLAUDE_CODE: "claude-code",
  CODEX: "codex",
  OPENCODE: "opencode",
} as const;

export type AgentToolType = (typeof AGENT_TOOL)[keyof typeof AGENT_TOOL];

export const AGENT_TOOL_LABELS: Record<AgentToolType, string> = {
  [AGENT_TOOL.CLAUDE_CODE]: "Claude Code",
  [AGENT_TOOL.CODEX]: "Codex",
  [AGENT_TOOL.OPENCODE]: "OpenCode",
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
}

interface AgentHookStateUpdate {
  session_id: string;
  tool: AgentToolType;
  state: AgentHookState;
  timestamp: string;
  project_path?: string | null;
  context_id?: string | null;
  pane_id?: string | null;
}

interface AgentHooksStore {
  sessions: Map<string, AgentHookSession>;
  _unsubscribe: (() => void) | null;

  init: () => void;
  cleanup: () => void;

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
  forceSessionIdle: (sessionId: string) => void;
  clearIdleSessions: () => Promise<void>;
}

export const useAgentHooksStore = create<AgentHooksStore>((set, get) => ({
  sessions: new Map(),
  _unsubscribe: null,

  init: () => {
    const existing = get()._unsubscribe;
    if (existing) return;

    const unsubscribe = useWebSocketStore.getState().onEvent(
      "agent_hook_state_changed",
      (data: unknown) => {
        const update = data as AgentHookStateUpdate;
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
          });
          return { sessions };
        });
      }
    );

    set({ _unsubscribe: unsubscribe });

    fetchInitialSessions().then((initialSessions) => {
      if (initialSessions.length > 0) {
        set((state) => {
          const sessions = new Map(state.sessions);
          for (const s of initialSessions) {
            if (!sessions.has(s.session_id)) {
              sessions.set(s.session_id, s);
            }
          }
          return { sessions };
        });
      }
    });
  },

  cleanup: () => {
    const { _unsubscribe } = get();
    if (_unsubscribe) {
      _unsubscribe();
      set({ _unsubscribe: null, sessions: new Map() });
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
    const session = get().sessions.get(paneId);
    return session?.state ?? AGENT_STATE.IDLE;
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

  forceSessionIdle: (sessionId: string) => {
    set((state) => {
      const session = state.sessions.get(sessionId);
      if (!session || session.state === AGENT_STATE.IDLE) return state;
      const sessions = new Map(state.sessions);
      sessions.set(sessionId, { ...session, state: AGENT_STATE.IDLE });
      return { sessions };
    });
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
