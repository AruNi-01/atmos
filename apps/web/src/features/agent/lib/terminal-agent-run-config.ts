import { shellQuote } from "@/shared/lib/shell-quote";
import {
  TERMINAL_AGENT_DEFINITIONS,
  type TerminalAgentDefinition,
  type TerminalAgentReasoningMode as TerminalAgentReasoningCapabilityMode,
  type TerminalAgentReasoningSupport,
} from "@/features/agent/lib/terminal-agent-definitions";

export type TerminalAgentReasoningMode = Exclude<
  TerminalAgentReasoningCapabilityMode,
  "none"
>;

export interface TerminalAgentReasoningInput {
  mode: TerminalAgentReasoningMode;
  value: string;
}

export interface TerminalAgentRunConfigInput {
  model?: string | null;
  reasoning?: TerminalAgentReasoningInput | null;
  extra_args?: string[];
}

export interface TerminalAgentSavedRunConfig {
  id: string;
  name: string;
  agent_id: string;
  config: TerminalAgentRunConfigInput;
}

export function readSavedRunConfigs(value: unknown): TerminalAgentSavedRunConfig[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.name !== "string" ||
      typeof candidate.agent_id !== "string"
    ) {
      return [];
    }
    return [
      {
        id: candidate.id,
        name: candidate.name,
        agent_id: candidate.agent_id,
        config: sanitizeRunConfig(candidate.config as TerminalAgentRunConfigInput) ?? {},
      },
    ];
  });
}

export function parseRunConfigJson(value: string | null | undefined): TerminalAgentRunConfigInput | null {
  if (!value) return null;
  try {
    return sanitizeRunConfig(JSON.parse(value) as TerminalAgentRunConfigInput);
  } catch {
    return null;
  }
}

export interface TerminalAgentCapabilityDescriptor {
  modelInputMode: "none" | "manual" | "catalog";
  reasoningSupport: TerminalAgentReasoningSupport;
  supportsExtraArgs: boolean;
}

export function sanitizeRunConfig(
  value: TerminalAgentRunConfigInput | null | undefined,
): TerminalAgentRunConfigInput | null {
  if (!value) return null;
  const model = value.model?.trim() || null;
  const reasoningValue = value.reasoning?.value?.trim() || null;
  const reasoning = value.reasoning && reasoningValue
    ? { mode: value.reasoning.mode, value: reasoningValue }
    : null;
  const extraArgs = (value.extra_args ?? []).map((item) => item.trim()).filter(Boolean);
  if (!model && !reasoning && extraArgs.length === 0) {
    return null;
  }
  return {
    model,
    reasoning,
    extra_args: extraArgs,
  };
}

export function getTerminalAgentCapability(agentId: string): TerminalAgentCapabilityDescriptor {
  const agent = TERMINAL_AGENT_DEFINITIONS.find((item) => item.id === agentId);
  if (!agent) {
    return {
      modelInputMode: "none",
      reasoningSupport: { mode: "none" },
      supportsExtraArgs: true,
    };
  }
  return {
    modelInputMode: agent.modelSupport ?? "none",
    reasoningSupport: agent.reasoningSupport ?? { mode: "none" },
    supportsExtraArgs: true,
  };
}

export function parseExtraArgsText(text: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let hasToken = false;

  for (const ch of text) {
    if (escaped) {
      current += ch;
      escaped = false;
      hasToken = true;
      continue;
    }

    if (quote === "'") {
      if (ch === "'") {
        quote = null;
      } else {
        current += ch;
      }
      hasToken = true;
      continue;
    }

    if (quote === '"') {
      if (ch === '"') {
        quote = null;
      } else if (ch === "\\") {
        escaped = true;
      } else {
        current += ch;
      }
      hasToken = true;
      continue;
    }

    if (/\s/.test(ch)) {
      if (hasToken) {
        args.push(current);
        current = "";
        hasToken = false;
      }
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch;
      hasToken = true;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      hasToken = true;
      continue;
    }

    current += ch;
    hasToken = true;
  }

  if (quote) {
    throw new Error(`Unterminated ${quote} quote in extra args.`);
  }

  if (hasToken) {
    args.push(current);
  }

  return args;
}

export function joinExtraArgsText(extraArgs: string[] | null | undefined): string {
  return (extraArgs ?? []).map((item) => shellQuote(item)).join(" ");
}

export function buildRunConfigSummary(
  agentLabel: string,
  value: TerminalAgentRunConfigInput | null | undefined,
): string {
  const config = sanitizeRunConfig(value);
  if (!config) {
    return agentLabel;
  }
  const parts = [agentLabel];
  if (config.model) {
    parts.push(config.model);
  }
  if (config.reasoning?.value) {
    parts.push(config.reasoning.value);
  }
  if ((config.extra_args?.length ?? 0) > 0) {
    parts.push(joinExtraArgsText(config.extra_args));
  }
  return parts.join(" · ");
}

export function buildInteractiveAgentCommand(args: {
  agentId: string;
  launchCommand: string;
  prompt: string;
  runConfig?: TerminalAgentRunConfigInput | null;
}): string {
  const definition = TERMINAL_AGENT_DEFINITIONS.find((item) => item.id === args.agentId);
  const strategy = definition?.promptStrategy ?? "arg";
  const structuredArgs = buildStructuredRunConfigArgs(args.agentId, args.runConfig);
  const baseCommand = [args.launchCommand.trim(), ...structuredArgs.map((item) => shellQuote(item))]
    .filter(Boolean)
    .join(" ");
  const prompt = args.prompt.trim();
  if (!prompt) {
    return baseCommand;
  }
  const quotedPrompt = shellQuote(prompt);
  if (strategy === "stdin") {
    return `echo ${quotedPrompt} | ${baseCommand}`;
  }
  if (strategy === "prompt_flag" && definition?.params?.trim()) {
    const promptedBaseCommand = [
      definition.cmd,
      definition.params,
      ...structuredArgs.map((item) => shellQuote(item)),
    ]
      .filter(Boolean)
      .join(" ");
    return `${promptedBaseCommand} ${quotedPrompt}`;
  }
  return `${baseCommand} ${quotedPrompt}`;
}

export function buildStructuredRunConfigArgs(
  agentId: string,
  value: TerminalAgentRunConfigInput | null | undefined,
): string[] {
  const config = sanitizeRunConfig(value);
  if (!config) return [];
  const args: string[] = [];
  if (config.model) {
    const modelFlag = modelFlagForAgent(agentId);
    if (modelFlag) {
      args.push(modelFlag, config.model);
    }
  }
  if (config.reasoning) {
    const reasoningFlag = reasoningArgForAgent(agentId, config.reasoning.mode);
    if (reasoningFlag) {
      args.push(reasoningFlag);
      if (reasoningValueStyleForAgent(agentId, config.reasoning.mode) !== "flag_only") {
        args.push(config.reasoning.value);
      }
    }
  }
  args.push(...(config.extra_args ?? []));
  return args;
}

export function hasRunConfig(value: TerminalAgentRunConfigInput | null | undefined): boolean {
  return sanitizeRunConfig(value) !== null;
}

export function modelFlagForAgent(agentId: string): string | null {
  switch (agentId) {
    case "claude":
    case "codex":
    case "gemini":
    case "devin":
    case "droid":
    case "cursor":
    case "kilocode":
    case "kiro":
    case "commandcode":
    case "pi":
    case "opencode":
    case "kimi":
      return "--model";
    default:
      return null;
  }
}

export function reasoningArgForAgent(
  agentId: string,
  mode: TerminalAgentReasoningMode,
): string | null {
  const support = reasoningSupportForAgent(agentId);
  if (support.mode === "none" || support.mode === "encoded_in_model" || support.mode !== mode) {
    return null;
  }
  return support.arg?.trim() || null;
}

export function reasoningValueStyleForAgent(
  agentId: string,
  mode: TerminalAgentReasoningMode,
): "value" | "flag_only" {
  const support = reasoningSupportForAgent(agentId);
  if (support.mode !== mode) {
    return "value";
  }
  return support.valueStyle ?? "value";
}

export function runConfigConflicts(
  agentId: string,
  value: TerminalAgentRunConfigInput | null | undefined,
): string[] {
  const config = sanitizeRunConfig(value);
  if (!config) return [];
  const extraArgs = config.extra_args ?? [];
  const conflicts: string[] = [];
  const modelFlag = config.model ? modelFlagForAgent(agentId) : null;
  if (modelFlag && extraArgs.includes(modelFlag)) {
    conflicts.push(modelFlag);
  }
  const reasoningFlag = config.reasoning
    ? reasoningArgForAgent(agentId, config.reasoning.mode)
    : null;
  if (reasoningFlag && extraArgs.includes(reasoningFlag)) {
    conflicts.push(reasoningFlag);
  }
  const reservedFlags = reservedFlagsForAgent(agentId);
  for (const arg of extraArgs) {
    if (reservedFlags.has(arg)) {
      conflicts.push(arg);
    }
  }
  return conflicts;
}

export function terminalAgentDefinitionById(agentId: string): TerminalAgentDefinition | undefined {
  return TERMINAL_AGENT_DEFINITIONS.find((item) => item.id === agentId);
}

export function reasoningSupportForAgent(agentId: string): TerminalAgentReasoningSupport {
  return terminalAgentDefinitionById(agentId)?.reasoningSupport ?? { mode: "none" };
}

function reservedFlagsForAgent(agentId: string): Set<string> {
  const definition = terminalAgentDefinitionById(agentId);
  const flags = new Set<string>();
  for (const token of [
    ...(tokenizeReservedFlags(definition?.params ?? "")),
    ...(tokenizeReservedFlags(definition?.interactiveParams ?? "")),
  ]) {
    flags.add(token);
  }
  return flags;
}

function tokenizeReservedFlags(value: string): string[] {
  try {
    return parseExtraArgsText(value).filter((item) => item.startsWith("-"));
  } catch {
    return value
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.startsWith("-"));
  }
}
