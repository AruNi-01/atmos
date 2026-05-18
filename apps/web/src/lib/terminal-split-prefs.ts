import { globalKey, readJson, writeJson } from '@/lib/browser-store';

const TERMINAL_SPLIT_PREFS_KEY = globalKey('terminalSplit');

export type TerminalSplitPrefs = {
  /** When true, plain split uses the last agent chosen from a split submenu. */
  useLastSplitAgentOnSplit: boolean;
  /** Agent id from the most recent split-with-agent action. */
  lastSplitAgentId: string | null;
};

export const DEFAULT_TERMINAL_SPLIT_PREFS: TerminalSplitPrefs = {
  useLastSplitAgentOnSplit: false,
  lastSplitAgentId: null,
};

export function readTerminalSplitPrefs(): TerminalSplitPrefs {
  const raw = readJson<Partial<TerminalSplitPrefs>>(TERMINAL_SPLIT_PREFS_KEY, DEFAULT_TERMINAL_SPLIT_PREFS);
  return {
    useLastSplitAgentOnSplit: raw.useLastSplitAgentOnSplit === true,
    lastSplitAgentId:
      typeof raw.lastSplitAgentId === 'string' && raw.lastSplitAgentId.length > 0
        ? raw.lastSplitAgentId
        : null,
  };
}

export function writeTerminalSplitPrefs(prefs: TerminalSplitPrefs): void {
  writeJson(TERMINAL_SPLIT_PREFS_KEY, prefs);
}

export function patchTerminalSplitPrefs(partial: Partial<TerminalSplitPrefs>): TerminalSplitPrefs {
  const next = { ...readTerminalSplitPrefs(), ...partial };
  writeTerminalSplitPrefs(next);
  return next;
}

export function rememberLastSplitAgentId(agentId: string): TerminalSplitPrefs {
  return patchTerminalSplitPrefs({ lastSplitAgentId: agentId });
}
