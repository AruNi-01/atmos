"use client";

import { create } from "zustand";
import { useWebSocketStore } from "./use-websocket";
import { getRuntimeApiConfig, httpBase } from "@/lib/desktop-runtime";

export type AgentHookState = "idle" | "running" | "permission_request";
export type AgentToolType = "claude-code" | "codex" | "opencode";

export interface AgentHookSession {
  session_id: string;
  tool: AgentToolType;
  state: AgentHookState;
  timestamp: string;
  project_path?: string | null;
}

interface AgentHookStateUpdate {
  session_id: string;
  tool: AgentToolType;
  state: AgentHookState;
  timestamp: string;
  project_path?: string | null;
}

interface AgentHooksStore {
  sessions: Map<string, AgentHookSession>;
  _unsubscribe: (() => void) | null;

  init: () => void;
  cleanup: () => void;

  getAllSessions: () => AgentHookSession[];
  getSessionsByProjectPath: (projectPath: string) => AgentHookSession[];
  getAggregateAgentStateForProjectPath: (projectPath: string) => AgentHookState;
  getLatestSession: () => AgentHookSession | null;
  hasRunningSession: () => boolean;
  hasPermissionRequest: () => boolean;
  getGlobalState: () => AgentHookState;
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
      if (s.state === "permission_request") return "permission_request";
      if (s.state === "running") hasRunning = true;
    }
    return hasRunning ? "running" : "idle";
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
      (s) => s.state === "running"
    );
  },

  hasPermissionRequest: () => {
    return Array.from(get().sessions.values()).some(
      (s) => s.state === "permission_request"
    );
  },

  getGlobalState: () => {
    const sessions = Array.from(get().sessions.values());
    if (sessions.some((s) => s.state === "permission_request"))
      return "permission_request";
    if (sessions.some((s) => s.state === "running")) return "running";
    return "idle";
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
          if (s.state === "idle") {
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
