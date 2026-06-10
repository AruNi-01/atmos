import terminalAgents from "@atmos/resources/terminal-agents/builtin_agents.json";

export type TerminalAgentPromptStrategy = "arg" | "stdin" | "prompt_flag" | "file_flag";
export type TerminalAgentModelSupport = "none" | "manual" | "catalog";
export type TerminalAgentReasoningMode = "none" | "enum" | "manual" | "encoded_in_model";
export type TerminalAgentReasoningValueStyle = "value" | "flag_only";

export interface TerminalAgentReasoningSupport {
  mode: TerminalAgentReasoningMode;
  arg?: string;
  options?: string[];
  placeholder?: string;
  valueStyle?: TerminalAgentReasoningValueStyle;
}

export interface TerminalAgentDefinition {
  id: string;
  label: string;
  cmd: string;
  params: string;
  interactiveParams?: string;
  promptStrategy?: TerminalAgentPromptStrategy;
  stdoutParser?: string;
  useEcho?: boolean;
  modelSupport?: TerminalAgentModelSupport;
  reasoningSupport?: TerminalAgentReasoningSupport;
  modelList?: {
    supported: boolean;
    command: string[];
    parser: string;
  };
}

const PROMPT_STRATEGIES = new Set<TerminalAgentPromptStrategy>([
  "arg",
  "stdin",
  "prompt_flag",
  "file_flag",
]);
const MODEL_SUPPORT = new Set<TerminalAgentModelSupport>(["none", "manual", "catalog"]);
const REASONING_MODES = new Set<TerminalAgentReasoningMode>([
  "none",
  "enum",
  "manual",
  "encoded_in_model",
]);
const REASONING_VALUE_STYLES = new Set<TerminalAgentReasoningValueStyle>(["value", "flag_only"]);

function normalizePromptStrategy(value: string | undefined): TerminalAgentPromptStrategy | undefined {
  if (!value) return undefined;
  if (PROMPT_STRATEGIES.has(value as TerminalAgentPromptStrategy)) {
    return value as TerminalAgentPromptStrategy;
  }
  throw new Error(`Unsupported terminal agent promptStrategy: ${value}`);
}

function normalizeModelSupport(value: string | undefined): TerminalAgentModelSupport | undefined {
  if (!value) return undefined;
  if (value === "explicit") {
    return "manual";
  }
  if (MODEL_SUPPORT.has(value as TerminalAgentModelSupport)) {
    return value as TerminalAgentModelSupport;
  }
  throw new Error(`Unsupported terminal agent modelSupport: ${value}`);
}

function normalizeReasoningSupport(value: unknown): TerminalAgentReasoningSupport | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    switch (value) {
      case "none":
        return { mode: "none" };
      case "encoded_in_model":
        return { mode: "encoded_in_model" };
      case "effort":
        return { mode: "manual", arg: "--effort" };
      case "thinking":
        return { mode: "manual", arg: "--thinking" };
      case "variant":
        return { mode: "manual", arg: "--variant" };
      default:
        throw new Error(`Unsupported terminal agent reasoningSupport: ${value}`);
    }
  }
  if (typeof value !== "object") {
    throw new Error(`Unsupported terminal agent reasoningSupport: ${String(value)}`);
  }
  const candidate = value as Record<string, unknown>;
  const mode = candidate.mode;
  if (typeof mode !== "string" || !REASONING_MODES.has(mode as TerminalAgentReasoningMode)) {
    throw new Error(`Unsupported terminal agent reasoningSupport.mode: ${String(mode)}`);
  }
  const normalizedMode = mode as TerminalAgentReasoningMode;
  const arg = typeof candidate.arg === "string" && candidate.arg.trim() ? candidate.arg.trim() : undefined;
  const options = Array.isArray(candidate.options)
    ? candidate.options
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : undefined;
  const placeholder =
    typeof candidate.placeholder === "string" && candidate.placeholder.trim()
      ? candidate.placeholder.trim()
      : undefined;
  const valueStyle =
    typeof candidate.valueStyle === "string" && REASONING_VALUE_STYLES.has(candidate.valueStyle as TerminalAgentReasoningValueStyle)
      ? (candidate.valueStyle as TerminalAgentReasoningValueStyle)
      : undefined;
  if (normalizedMode === "enum" || normalizedMode === "manual") {
    if (!arg) {
      throw new Error(`Structured terminal agent reasoningSupport requires an arg for mode ${normalizedMode}.`);
    }
  }
  if (normalizedMode === "enum" && (!options || options.length === 0)) {
    throw new Error("Enum terminal agent reasoningSupport requires at least one option.");
  }
  return {
    mode: normalizedMode,
    arg,
    options,
    placeholder,
    valueStyle,
  };
}

export const TERMINAL_AGENT_DEFINITIONS: readonly TerminalAgentDefinition[] = terminalAgents.map((agent) => ({
  ...agent,
  promptStrategy: normalizePromptStrategy(agent.promptStrategy),
  modelSupport: normalizeModelSupport(agent.modelSupport),
  reasoningSupport: normalizeReasoningSupport(agent.reasoningSupport),
}));
