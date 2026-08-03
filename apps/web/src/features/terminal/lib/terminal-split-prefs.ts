import {
  buildInteractiveAgentRunPlan,
  sanitizeRunConfig,
  type TerminalAgentRunConfigInput,
} from '@/features/agent/lib/terminal-agent-run-config';
import type { TerminalPaneAgent } from '@/features/terminal/types/index';

export type TerminalSplitPrefs = {
  /** When true, plain split launches the configured default agent. */
  enabled: boolean;
  /** Explicitly chosen default agent id (settings). */
  agentId: string | null;
  /** Optional run config (model / reasoning / extra args) for the default agent. */
  runConfig: TerminalAgentRunConfigInput | null;
  /**
   * When true (and `enabled`), creating a new Terminal tab also launches the
   * default agent in the initial pane.
   */
  applyToNewTerminalTab: boolean;
};

export type TerminalDefaultAgentMatch = {
  agent: TerminalPaneAgent;
  command: string;
};

export const DEFAULT_TERMINAL_SPLIT_PREFS: TerminalSplitPrefs = {
  enabled: false,
  agentId: null,
  runConfig: null,
  applyToNewTerminalTab: false,
};

/** Disk keys under function_settings.terminal.* */
export const TERMINAL_DEFAULT_SPLIT_AGENT_KEYS = {
  enabled: 'default_split_agent_enabled',
  agentId: 'default_split_agent_id',
  runConfig: 'default_split_agent_run_config',
  applyToNewTerminalTab: 'default_split_agent_apply_to_new_tab',
} as const;

function readAgentId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readRunConfig(value: unknown): TerminalAgentRunConfigInput | null {
  if (!value || typeof value !== 'object') return null;
  return sanitizeRunConfig(value as TerminalAgentRunConfigInput);
}

/** Parse terminal.default_split_agent_* fields from function settings. */
export function parseTerminalSplitPrefsFromSettings(
  terminal: Record<string, unknown> | null | undefined,
): TerminalSplitPrefs {
  if (!terminal) return { ...DEFAULT_TERMINAL_SPLIT_PREFS };
  return {
    enabled: terminal[TERMINAL_DEFAULT_SPLIT_AGENT_KEYS.enabled] === true,
    agentId: readAgentId(terminal[TERMINAL_DEFAULT_SPLIT_AGENT_KEYS.agentId]),
    runConfig: readRunConfig(terminal[TERMINAL_DEFAULT_SPLIT_AGENT_KEYS.runConfig]),
    applyToNewTerminalTab:
      terminal[TERMINAL_DEFAULT_SPLIT_AGENT_KEYS.applyToNewTerminalTab] === true,
  };
}

/**
 * Resolve the configured default agent against the live agent list, applying
 * any saved run config to the launch command.
 */
export function resolveDefaultSplitAgent(
  prefs: Pick<TerminalSplitPrefs, 'enabled' | 'agentId' | 'runConfig'>,
  agents: readonly TerminalDefaultAgentMatch[],
): TerminalDefaultAgentMatch | null {
  if (!prefs.enabled || !prefs.agentId) return null;
  const match = agents.find(({ agent }) => agent.id === prefs.agentId);
  if (!match) return null;
  const plan = buildInteractiveAgentRunPlan({
    agentId: match.agent.id,
    launchCommand: match.command,
    prompt: '',
    runConfig: prefs.runConfig,
  });
  return {
    agent: match.agent,
    command: plan.launchCommand,
  };
}
