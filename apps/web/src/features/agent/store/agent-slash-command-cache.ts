"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type AgentChatSlashCommand = {
  name: string;
  description: string;
  hint?: string | null;
};

export const EMPTY_AGENT_SLASH_COMMANDS: AgentChatSlashCommand[] = [];

type AgentSlashCommandCacheState = {
  byProviderId: Record<string, AgentChatSlashCommand[]>;
  remember: (providerId: string, commands: AgentChatSlashCommand[]) => void;
};

export const useAgentSlashCommandCache = create<AgentSlashCommandCacheState>()(
  persist(
    (set) => ({
      byProviderId: {},
      remember: (providerId, commands) => {
        const id = providerId.trim();
        if (!id || commands.length === 0) return;
        set((state) => ({
          byProviderId: {
            ...state.byProviderId,
            [id]: commands,
          },
        }));
      },
    }),
    {
      name: "atmos-agent-slash-commands",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ byProviderId: state.byProviderId }),
    },
  ),
);

export function rememberAgentSlashCommands(
  providerId: string | null | undefined,
  commands: AgentChatSlashCommand[],
) {
  if (!providerId) return;
  useAgentSlashCommandCache.getState().remember(providerId, commands);
}

export function cachedAgentSlashCommands(
  providerId: string | null | undefined,
): AgentChatSlashCommand[] {
  const id = providerId?.trim();
  if (!id) return EMPTY_AGENT_SLASH_COMMANDS;
  return useAgentSlashCommandCache.getState().byProviderId[id] ?? EMPTY_AGENT_SLASH_COMMANDS;
}

export function normalizeAgentSlashCommands(
  commands:
    | Array<{ name?: string | null; description?: string | null; hint?: string | null }>
    | null
    | undefined,
): AgentChatSlashCommand[] {
  return (commands ?? []).flatMap((command) => {
    const name = command.name?.trim().replace(/^\/+/, "");
    if (!name) return [];
    return [
      {
        name,
        description: command.description?.trim() || name,
        hint: command.hint ?? null,
      },
    ];
  });
}

export function overlayAgentSlashCommands(
  base: AgentChatSlashCommand[],
  overlay: AgentChatSlashCommand[],
): AgentChatSlashCommand[] {
  const byName = new Map<string, AgentChatSlashCommand>();
  for (const command of base) {
    byName.set(command.name.toLowerCase(), command);
  }
  for (const command of overlay) {
    byName.set(command.name.toLowerCase(), command);
  }
  return [...byName.values()];
}

export function resolveAgentSlashCommands(
  sessionCommands: AgentChatSlashCommand[],
  cachedCommands: AgentChatSlashCommand[],
  catalogCommands: AgentChatSlashCommand[] = [],
): AgentChatSlashCommand[] {
  if (catalogCommands.length > 0) {
    return overlayAgentSlashCommands(catalogCommands, sessionCommands);
  }
  return sessionCommands.length > 0 ? sessionCommands : cachedCommands;
}
