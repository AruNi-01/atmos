"use client";

import { create } from "zustand";
import { getRuntimeApiConfig, httpBase } from "@/lib/desktop-runtime";

export type PushServerType = "ntfy" | "bark" | "gotify" | "custom_webhook";

export interface PushServerConfig {
  id: string;
  enabled: boolean;
  type: PushServerType;
  url: string;
  token?: string | null;
  topic?: string | null;
  device_key?: string | null;
  custom_body_template?: string | null;
}

export interface NotificationSettings {
  browser_notification: boolean;
  desktop_notification: boolean;
  notify_on_permission_request: boolean;
  notify_on_task_complete: boolean;
  push_servers: PushServerConfig[];
}

const DEFAULT_SETTINGS: NotificationSettings = {
  browser_notification: false,
  desktop_notification: false,
  notify_on_permission_request: true,
  notify_on_task_complete: true,
  push_servers: [],
};

interface NotificationSettingsStore {
  settings: NotificationSettings;
  /** Increments on each optimistic `updateSettings`; used to ignore stale rollbacks. */
  _version: number;
  isLoading: boolean;
  isSaving: boolean;

  loadSettings: () => Promise<void>;
  updateSettings: (settings: NotificationSettings) => Promise<void>;
  updateField: <K extends keyof NotificationSettings>(
    key: K,
    value: NotificationSettings[K]
  ) => Promise<void>;
  addPushServer: (server: PushServerConfig) => Promise<void>;
  removePushServer: (id: string) => Promise<void>;
  updatePushServer: (id: string, updates: Partial<PushServerConfig>) => Promise<void>;
  testPushServer: (index: number) => Promise<{ ok: boolean; error?: string }>;
}

async function getBase(): Promise<string> {
  const config = await getRuntimeApiConfig();
  return httpBase(config);
}

export const useNotificationSettings = create<NotificationSettingsStore>(
  (set, get) => ({
    settings: DEFAULT_SETTINGS,
    _version: 0,
    isLoading: false,
    isSaving: false,

    loadSettings: async () => {
      set({ isLoading: true });
      try {
        const base = await getBase();
        const res = await fetch(`${base}/hooks/notification/settings`);
        if (res.ok) {
          const data = await res.json();
          set({ settings: { ...DEFAULT_SETTINGS, ...data } });
        }
      } catch {
        // use defaults
      } finally {
        set({ isLoading: false });
      }
    },

    updateSettings: async (settings: NotificationSettings) => {
      const prev = get().settings;
      const versionAtStart = get()._version + 1;
      set({ settings, isSaving: true, _version: versionAtStart });
      try {
        const base = await getBase();
        const res = await fetch(`${base}/hooks/notification/settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
        });
        if (!res.ok) {
          set((s) =>
            s._version === versionAtStart ? { settings: prev } : {}
          );
        }
      } catch {
        set((s) =>
          s._version === versionAtStart ? { settings: prev } : {}
        );
      } finally {
        set({ isSaving: false });
      }
    },

    updateField: async (key, value) => {
      const next = { ...get().settings, [key]: value };
      await get().updateSettings(next);
    },

    addPushServer: async (server: PushServerConfig) => {
      const next = {
        ...get().settings,
        push_servers: [...get().settings.push_servers, server],
      };
      await get().updateSettings(next);
    },

    removePushServer: async (id: string) => {
      const next = {
        ...get().settings,
        push_servers: get().settings.push_servers.filter((s) => s.id !== id),
      };
      await get().updateSettings(next);
    },

    updatePushServer: async (
      id: string,
      updates: Partial<PushServerConfig>
    ) => {
      const next = {
        ...get().settings,
        push_servers: get().settings.push_servers.map((s) =>
          s.id === id ? { ...s, ...updates } : s
        ),
      };
      await get().updateSettings(next);
    },

    testPushServer: async (index: number) => {
      try {
        const base = await getBase();
        const res = await fetch(`${base}/hooks/notification/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ server_index: index }),
        });
        return await res.json();
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Unknown error",
        };
      }
    },
  })
);
