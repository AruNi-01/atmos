import { shellQuote } from "@/shared/lib/shell-quote";
import {
  TERMINAL_AGENT_DEFINITIONS,
  type TerminalAgentDefinition,
  type TerminalAgentPromptStrategy,
  type TerminalAgentReasoningMode as TerminalAgentReasoningCapabilityMode,
  type TerminalAgentReasoningSupport,
} from "@/features/agent/lib/terminal-agent-definitions";
import { agentNeedsTuiFollowUp } from "@/features/agent/lib/terminal-agent-tui-follow-up";

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

function resolveInteractivePromptStrategy(
  definition: TerminalAgentDefinition | undefined,
): TerminalAgentPromptStrategy {
  if (definition?.useEcho) {
    return "stdin";
  }
  return definition?.promptStrategy ?? "arg";
}

function interactivePromptFlagSuffix(
  definition: TerminalAgentDefinition,
): string | null {
  const automationParams = definition.params.trim();
  const interactiveParams = definition.interactiveParams ?? "";
  if (!automationParams || automationParams === interactiveParams.trim()) {
    return null;
  }
  if (interactiveParams && automationParams.startsWith(interactiveParams)) {
    const suffix = automationParams.slice(interactiveParams.length).trim();
    return suffix || null;
  }
  return automationParams;
}

export function buildPipedAgentTerminalInput(
  agentId: string,
  command: string,
  text: string,
): string | null {
  const definition = terminalAgentDefinitionById(agentId);
  if (!definition?.useEcho) {
    return null;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const interactiveParams = definition.interactiveParams ?? "";
  const baseCommand = [command.trim(), interactiveParams].filter(Boolean).join(" ");
  return `echo ${shellQuote(trimmed)} | ${baseCommand}`;
}

export interface TerminalAgentRunPlan {
  launchCommand: string;
  tuiFollowUpPrompt?: string;
}

export type TerminalAgentRunMode = "interactive" | "headless";

export function buildInteractiveAgentRunPlan(args: {
  agentId: string;
  launchCommand: string;
  prompt: string;
  runConfig?: TerminalAgentRunConfigInput | null;
  mode?: TerminalAgentRunMode;
}): TerminalAgentRunPlan {
  const mode = args.mode ?? "interactive";
  const definition = TERMINAL_AGENT_DEFINITIONS.find((item) => item.id === args.agentId);
  const strategy =
    mode === "headless"
      ? (definition?.promptStrategy ?? "arg")
      : resolveInteractivePromptStrategy(definition);
  const structuredArgs = buildStructuredRunConfigArgs(args.agentId, args.runConfig);
  const quotedStructuredArgs = structuredArgs.map((item) => shellQuote(item));
  const launchCommand = args.launchCommand.trim();
  const headlessPromptFlag =
    mode === "headless" && strategy === "prompt_flag" && definition
      ? promptFlagForInteractiveCommand(definition)
      : null;
  const launchTokens = tokenizeCommand(launchCommand);
  const promptFlagIndex =
    headlessPromptFlag && launchTokens.at(-1) === headlessPromptFlag
      ? launchCommand.lastIndexOf(headlessPromptFlag)
      : -1;
  const baseCommand =
    promptFlagIndex >= 0 && quotedStructuredArgs.length > 0
      ? [
          launchCommand.slice(0, promptFlagIndex).trimEnd(),
          ...quotedStructuredArgs,
          launchCommand.slice(promptFlagIndex),
        ]
          .filter(Boolean)
          .join(" ")
      : [launchCommand, ...quotedStructuredArgs].filter(Boolean).join(" ");
  const prompt = args.prompt.trim();
  if (!prompt) {
    return { launchCommand: baseCommand };
  }

  if (mode === "interactive" && agentNeedsTuiFollowUp(args.agentId, prompt)) {
    return {
      launchCommand: baseCommand,
      tuiFollowUpPrompt: prompt,
    };
  }

  const quotedPrompt = shellQuote(prompt);
  if (strategy === "stdin") {
    return {
      launchCommand: `echo ${quotedPrompt} | ${baseCommand}`,
    };
  }
  if (args.agentId === "opencode") {
    return {
      launchCommand: `${baseCommand} --prompt ${quotedPrompt}`,
    };
  }
  if (args.agentId === "antigravity") {
    return {
      launchCommand: `${baseCommand} --prompt-interactive ${quotedPrompt}`,
    };
  }
  if (mode === "interactive" && args.agentId === "grok-build") {
    return {
      launchCommand: `${baseCommand} ${quotedPrompt}`,
    };
  }
  if (strategy === "prompt_flag" && definition) {
    if (mode === "interactive" && args.agentId === "pi") {
      return {
        launchCommand: `${baseCommand} ${quotedPrompt}`,
      };
    }
    const promptFlag = promptFlagForInteractiveCommand(definition);
    if (promptFlag) {
      const flagPrefix = commandContainsToken(args.launchCommand, promptFlag)
        ? ""
        : ` ${shellQuote(promptFlag)}`;
      return {
        launchCommand: `${baseCommand}${flagPrefix} ${quotedPrompt}`,
      };
    }
    const promptFlagSuffix =
      mode === "interactive" ? interactivePromptFlagSuffix(definition) : definition.params;
    if (mode === "interactive" && promptFlagSuffix) {
      const promptedBaseCommand = [baseCommand, promptFlagSuffix].filter(Boolean).join(" ");
      return {
        launchCommand: `${promptedBaseCommand} ${quotedPrompt}`,
      };
    }
    if (definition.params?.trim()) {
      const promptedBaseCommand = [
        definition.cmd,
        definition.params,
        ...structuredArgs.map((item) => shellQuote(item)),
      ]
        .filter(Boolean)
        .join(" ");
      return {
        launchCommand: `${promptedBaseCommand} ${quotedPrompt}`,
      };
    }
  }
  return {
    launchCommand: `${baseCommand} ${quotedPrompt}`,
  };
}

export function buildInteractiveAgentCommand(args: {
  agentId: string;
  launchCommand: string;
  prompt: string;
  runConfig?: TerminalAgentRunConfigInput | null;
  mode?: TerminalAgentRunMode;
}): string {
  return buildInteractiveAgentRunPlan(args).launchCommand;
}

function promptFlagForInteractiveCommand(definition: TerminalAgentDefinition): string | null {
  const params = tokenizeCommand(definition.params);
  if (params.length === 0) return null;
  const interactive = tokenizeCommand(definition.interactiveParams ?? "");
  let prefixLength = 0;
  while (
    prefixLength < params.length &&
    prefixLength < interactive.length &&
    params[prefixLength] === interactive[prefixLength]
  ) {
    prefixLength += 1;
  }
  const candidates = params.slice(prefixLength).filter((item) => item.startsWith("-"));
  return candidates.at(-1) ?? null;
}

function commandContainsToken(command: string, token: string): boolean {
  return tokenizeCommand(command).includes(token);
}

function tokenizeCommand(value: string): string[] {
  try {
    return parseExtraArgsText(value);
  } catch {
    return value
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
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
    case "antigravity":
    case "devin":
    case "droid":
    case "cursor":
    case "kilocode":
    case "kiro":
    case "commandcode":
    case "pi":
    case "opencode":
    case "kimi":
    case "grok-build":
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
