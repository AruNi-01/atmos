import terminalAgents from "@atmos/resources/terminal-agents/builtin_agents.json";
import type { TerminalTitleAgent } from "@atmos/shared/terminal";

type BuiltinAgentManifestEntry = {
  id: string;
  label: string;
  cmd: string;
  useEcho?: boolean;
};

/**
 * Built-in terminal agents as title matchers.
 * Same command tokens the pane toolbar uses (`grok`, `grok-*`, `claude`, …).
 */
const BUILTIN_TERMINAL_TITLE_AGENTS: readonly TerminalTitleAgent[] = (
  terminalAgents as BuiltinAgentManifestEntry[]
).map((agent) => ({
  id: agent.id,
  label: agent.label,
  command: agent.cmd,
  iconType: "built-in",
  pipeCommand: agent.useEcho ? agent.cmd : undefined,
}));

/**
 * Caller entries win when the id matches. Builtins fill anything the caller
 * omitted, so a typed `grok` / `grok-1.0.46` still brands Grok Build when the
 * center tab or exit check was not given the quick-open catalog.
 */
export function mergeBuiltinTerminalTitleAgents(
  configured: readonly TerminalTitleAgent[] | undefined,
): TerminalTitleAgent[] {
  const explicit = configured ?? [];
  if (explicit.length === 0) return [...BUILTIN_TERMINAL_TITLE_AGENTS];
  const overridden = new Set(explicit.map((agent) => agent.id));
  return [
    ...explicit,
    ...BUILTIN_TERMINAL_TITLE_AGENTS.filter((agent) => !overridden.has(agent.id)),
  ];
}
