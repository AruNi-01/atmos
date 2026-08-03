'use client';

import * as React from 'react';
import { create } from 'zustand';
import { toastManager } from '@workspace/ui';
import { useTranslations } from 'next-intl';

import { functionSettingsApi } from '@/api/ws-api';
import {
  getComputerQueryScope,
  type ComputerQueryScope,
} from '@/api/query/query-scope';
import { useFunctionSettingsStore } from '@/features/settings/store/function-settings-store';
import type { TerminalAgentRunConfigInput } from '@/features/agent/lib/terminal-agent-run-config';
import { TERMINAL_AGENT_DEFINITIONS } from '@/features/agent/lib/terminal-agent-definitions';
import {
  DEFAULT_TERMINAL_SPLIT_PREFS,
  TERMINAL_DEFAULT_SPLIT_AGENT_KEYS,
  parseTerminalSplitPrefsFromSettings,
  type TerminalSplitPrefs,
} from '@/features/terminal/lib/terminal-split-prefs';

interface TerminalSplitPrefsState extends TerminalSplitPrefs {
  loaded: boolean;
  loading: boolean;
  loadSettings: () => Promise<void>;
  /** Drop cached prefs when the active Computer changes so the next load is fresh. */
  resetForConnectionChange: () => void;
  setEnabled: (enabled: boolean) => Promise<void>;
  setAgentId: (agentId: string) => Promise<void>;
  setRunConfig: (agentId: string, runConfig: TerminalAgentRunConfigInput | null) => Promise<void>;
  setApplyToNewTerminalTab: (enabled: boolean) => Promise<void>;
}

type TerminalSplitPrefsStoreTranslator = ReturnType<typeof useTranslations>;

let terminalSplitPrefsTranslator: TerminalSplitPrefsStoreTranslator | null = null;
let loadRequestToken = 0;
let enabledRequestToken = 0;
let agentIdRequestToken = 0;
let runConfigRequestToken = 0;
let applyToNewTabRequestToken = 0;
/** Bumped on connection change so in-flight hydrates ignore stale writes. */
let hydrateGeneration = 0;
let lastPersisted: TerminalSplitPrefs = { ...DEFAULT_TERMINAL_SPLIT_PREFS };
let hydratedFromServer = false;
/** Shared in-flight load so concurrent callers await the same request. */
let inFlightLoad: Promise<void> | null = null;

function scopesMatch(a: ComputerQueryScope, b: ComputerQueryScope): boolean {
  return (
    a.activeInstanceId === b.activeInstanceId &&
    a.connectionEpoch === b.connectionEpoch &&
    a.relaySessionRevision === b.relaySessionRevision
  );
}

function defaultAgentId(): string {
  return TERMINAL_AGENT_DEFINITIONS[0]?.id ?? 'claude';
}

function storeText(
  key:
    | 'syncFailedTitle'
    | 'enabledFailed'
    | 'agentFailed'
    | 'runConfigFailed'
    | 'newTabFailed',
): string {
  if (terminalSplitPrefsTranslator) {
    return terminalSplitPrefsTranslator(key);
  }

  switch (key) {
    case 'syncFailedTitle':
      return 'Settings Sync Failed';
    case 'enabledFailed':
      return 'Failed to update Default split agent.';
    case 'agentFailed':
      return 'Failed to update the default split agent.';
    case 'runConfigFailed':
      return 'Failed to update the default split agent run config.';
    case 'newTabFailed':
      return 'Failed to update New Terminal Tab default agent.';
  }
}

/**
 * Load prefs from the server. Only assigns `lastPersisted` when the connection
 * scope and hydrate generation still match the values captured at start.
 * Returns null when a connection change made the result stale.
 */
async function hydratePersistedFromServer(): Promise<TerminalSplitPrefs | null> {
  const expectedScope = getComputerQueryScope();
  const generation = hydrateGeneration;
  const settings = await useFunctionSettingsStore.getState().load();
  if (generation !== hydrateGeneration) return null;
  if (!scopesMatch(getComputerQueryScope(), expectedScope)) return null;

  const terminal = settings.terminal as Record<string, unknown> | undefined;
  const parsed = parseTerminalSplitPrefsFromSettings(terminal);
  lastPersisted = parsed;
  hydratedFromServer = true;
  return parsed;
}

async function persistTerminalKey(
  key: string,
  value: unknown,
  expectedScope = getComputerQueryScope(),
): Promise<void> {
  await functionSettingsApi.update('terminal', key, value, expectedScope);
}

function isWriteStillCurrent(
  requestToken: number,
  currentToken: number,
  expectedScope: ComputerQueryScope,
): boolean {
  return requestToken === currentToken && scopesMatch(getComputerQueryScope(), expectedScope);
}

const terminalSplitPrefsStore = create<TerminalSplitPrefsState>((set, get) => ({
  ...DEFAULT_TERMINAL_SPLIT_PREFS,
  loaded: false,
  loading: false,

  resetForConnectionChange: () => {
    loadRequestToken += 1;
    enabledRequestToken += 1;
    agentIdRequestToken += 1;
    runConfigRequestToken += 1;
    applyToNewTabRequestToken += 1;
    hydrateGeneration += 1;
    inFlightLoad = null;
    lastPersisted = { ...DEFAULT_TERMINAL_SPLIT_PREFS };
    hydratedFromServer = false;
    set({
      ...DEFAULT_TERMINAL_SPLIT_PREFS,
      loaded: false,
      loading: false,
    });
  },

  loadSettings: async () => {
    if (get().loaded) return;
    if (inFlightLoad) return inFlightLoad;

    const requestToken = ++loadRequestToken;
    const expectedScope = getComputerQueryScope();
    set({ loading: true });

    const promise = (async () => {
      try {
        const parsed = await hydratePersistedFromServer();
        if (parsed === null) return;
        if (loadRequestToken !== requestToken) return;
        if (!scopesMatch(getComputerQueryScope(), expectedScope)) return;
        // A setter may have marked loaded while this request was in flight —
        // do not clobber the user's optimistic toggle with a stale load result.
        if (get().loaded) {
          set({ loading: false });
          return;
        }
        set({
          ...parsed,
          loaded: true,
          loading: false,
        });
      } catch {
        if (loadRequestToken === requestToken && scopesMatch(getComputerQueryScope(), expectedScope)) {
          // Keep defaults visible but leave loaded=false so a later mount can retry.
          set({
            ...DEFAULT_TERMINAL_SPLIT_PREFS,
            loaded: false,
            loading: false,
          });
        }
      } finally {
        // Clear only while this request still owns the in-flight slot.
        // Prefer requestToken over promise identity so we avoid a self-referential
        // const (TS2454: used before assigned) and still ignore superseded loads
        // after resetForConnectionChange bumps the token.
        if (loadRequestToken === requestToken) {
          inFlightLoad = null;
        }
      }
    })();

    inFlightLoad = promise;
    return promise;
  },

  setEnabled: async (enabled) => {
    const requestToken = ++enabledRequestToken;
    const expectedScope = getComputerQueryScope();
    const current = get();
    const nextAgentId = enabled ? current.agentId ?? defaultAgentId() : current.agentId;
    const nextApplyToNewTab = enabled ? current.applyToNewTerminalTab : false;
    const snapshot: TerminalSplitPrefs = {
      enabled: current.enabled,
      agentId: current.agentId,
      runConfig: current.runConfig,
      applyToNewTerminalTab: current.applyToNewTerminalTab,
    };

    set({
      enabled,
      agentId: nextAgentId,
      applyToNewTerminalTab: nextApplyToNewTab,
      loaded: true,
      loading: false,
    });

    try {
      const writes: Promise<void>[] = [
        persistTerminalKey(TERMINAL_DEFAULT_SPLIT_AGENT_KEYS.enabled, enabled, expectedScope),
      ];
      if (enabled && nextAgentId && nextAgentId !== snapshot.agentId) {
        writes.push(
          persistTerminalKey(TERMINAL_DEFAULT_SPLIT_AGENT_KEYS.agentId, nextAgentId, expectedScope),
        );
      }
      if (!enabled && snapshot.applyToNewTerminalTab) {
        writes.push(
          persistTerminalKey(
            TERMINAL_DEFAULT_SPLIT_AGENT_KEYS.applyToNewTerminalTab,
            false,
            expectedScope,
          ),
        );
      }
      await Promise.all(writes);

      if (isWriteStillCurrent(requestToken, enabledRequestToken, expectedScope)) {
        lastPersisted = {
          ...lastPersisted,
          enabled,
          agentId: nextAgentId,
          applyToNewTerminalTab: nextApplyToNewTab,
        };
      }
    } catch {
      if (enabledRequestToken === requestToken) {
        if (!hydratedFromServer) {
          try {
            await hydratePersistedFromServer();
          } catch {
            /* keep last known */
          }
        }
        if (isWriteStillCurrent(requestToken, enabledRequestToken, expectedScope)) {
          set({ ...lastPersisted });
          toastManager.add({
            title: storeText('syncFailedTitle'),
            description: storeText('enabledFailed'),
            type: 'error',
          });
        }
      }
    }
  },

  setAgentId: async (agentId) => {
    const requestToken = ++agentIdRequestToken;
    const expectedScope = getComputerQueryScope();
    const current = get();
    const nextRunConfig = agentId === current.agentId ? current.runConfig : null;

    set({
      agentId,
      runConfig: nextRunConfig,
      loaded: true,
      loading: false,
    });

    try {
      const writes: Promise<void>[] = [
        persistTerminalKey(TERMINAL_DEFAULT_SPLIT_AGENT_KEYS.agentId, agentId, expectedScope),
      ];
      if (nextRunConfig !== current.runConfig) {
        writes.push(
          persistTerminalKey(
            TERMINAL_DEFAULT_SPLIT_AGENT_KEYS.runConfig,
            nextRunConfig,
            expectedScope,
          ),
        );
      }
      await Promise.all(writes);

      if (isWriteStillCurrent(requestToken, agentIdRequestToken, expectedScope)) {
        lastPersisted = {
          ...lastPersisted,
          agentId,
          runConfig: nextRunConfig,
        };
      }
    } catch {
      if (agentIdRequestToken === requestToken) {
        if (!hydratedFromServer) {
          try {
            await hydratePersistedFromServer();
          } catch {
            /* keep last known */
          }
        }
        if (isWriteStillCurrent(requestToken, agentIdRequestToken, expectedScope)) {
          set({
            agentId: lastPersisted.agentId,
            runConfig: lastPersisted.runConfig,
          });
          toastManager.add({
            title: storeText('syncFailedTitle'),
            description: storeText('agentFailed'),
            type: 'error',
          });
        }
      }
    }
  },

  setRunConfig: async (agentId, runConfig) => {
    const requestToken = ++runConfigRequestToken;
    const expectedScope = getComputerQueryScope();
    const previousAgentId = get().agentId;

    set({
      agentId,
      runConfig,
      loaded: true,
      loading: false,
    });

    try {
      const writes: Promise<void>[] = [
        persistTerminalKey(TERMINAL_DEFAULT_SPLIT_AGENT_KEYS.runConfig, runConfig, expectedScope),
      ];
      if (agentId !== previousAgentId) {
        writes.push(
          persistTerminalKey(TERMINAL_DEFAULT_SPLIT_AGENT_KEYS.agentId, agentId, expectedScope),
        );
      }
      await Promise.all(writes);

      if (isWriteStillCurrent(requestToken, runConfigRequestToken, expectedScope)) {
        lastPersisted = {
          ...lastPersisted,
          agentId,
          runConfig,
        };
      }
    } catch {
      if (runConfigRequestToken === requestToken) {
        if (!hydratedFromServer) {
          try {
            await hydratePersistedFromServer();
          } catch {
            /* keep last known */
          }
        }
        if (isWriteStillCurrent(requestToken, runConfigRequestToken, expectedScope)) {
          // null is a valid persisted value — do not fall back with ??.
          set({
            agentId: lastPersisted.agentId,
            runConfig: lastPersisted.runConfig,
          });
          toastManager.add({
            title: storeText('syncFailedTitle'),
            description: storeText('runConfigFailed'),
            type: 'error',
          });
        }
      }
    }
  },

  setApplyToNewTerminalTab: async (enabled) => {
    const requestToken = ++applyToNewTabRequestToken;
    const expectedScope = getComputerQueryScope();

    set({
      applyToNewTerminalTab: enabled,
      loaded: true,
      loading: false,
    });

    try {
      await persistTerminalKey(
        TERMINAL_DEFAULT_SPLIT_AGENT_KEYS.applyToNewTerminalTab,
        enabled,
        expectedScope,
      );
      if (isWriteStillCurrent(requestToken, applyToNewTabRequestToken, expectedScope)) {
        lastPersisted = {
          ...lastPersisted,
          applyToNewTerminalTab: enabled,
        };
      }
    } catch {
      if (applyToNewTabRequestToken === requestToken) {
        if (!hydratedFromServer) {
          try {
            await hydratePersistedFromServer();
          } catch {
            /* keep last known */
          }
        }
        if (isWriteStillCurrent(requestToken, applyToNewTabRequestToken, expectedScope)) {
          set({ applyToNewTerminalTab: lastPersisted.applyToNewTerminalTab });
          toastManager.add({
            title: storeText('syncFailedTitle'),
            description: storeText('newTabFailed'),
            type: 'error',
          });
        }
      }
    }
  },
}));

export const useTerminalSplitPrefsStore = Object.assign(
  function useTerminalSplitPrefsStore(
    ...args: Parameters<typeof terminalSplitPrefsStore>
  ) {
    const t = useTranslations('settings.terminalSplitPrefsStore');

    React.useEffect(() => {
      // Keep the newest translator; never null out on unmount so long-lived
      // terminal consumers still get localized setter toasts after Settings closes.
      terminalSplitPrefsTranslator = t;
    }, [t]);

    return terminalSplitPrefsStore(...args);
  },
  terminalSplitPrefsStore,
) as typeof terminalSplitPrefsStore;
