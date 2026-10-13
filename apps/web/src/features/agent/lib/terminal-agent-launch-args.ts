import {
  TERMINAL_AGENT_DEFINITIONS,
  type TerminalAgentDefinition,
  type TerminalAgentReasoningMode as TerminalAgentReasoningCapabilityMode,
  type TerminalAgentReasoningSupport,
} from "@/features/agent/lib/terminal-agent-definitions";

export type TerminalAgentReasoningMode = Exclude<TerminalAgentReasoningCapabilityMode, "none">;

export interface TerminalAgentReasoningInput {
  mode: TerminalAgentReasoningMode;
  value: string;
}

export interface TerminalAgentRunConfigInput {
  model?: string | null;
  reasoning?: TerminalAgentReasoningInput | null;
  extra_args?: string[];
  /** Amp `--fast`, or a confirmed model-id fast parameter. Absent means off. */
  fast?: boolean | null;
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
  const fast = value.fast === true;
  if (!model && !reasoning && extraArgs.length === 0 && !fast) {
    return null;
  }
  return {
    model,
    reasoning,
    extra_args: extraArgs,
    ...(fast ? { fast: true } : {}),
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
      if (ch === "'") quote = null;
      else current += ch;
      hasToken = true;
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = null;
      else if (ch === "\\") escaped = true;
      else current += ch;
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
  if (hasToken) args.push(current);
  return args;
}

const rememberedModelEfforts = new Map<string, ReadonlyMap<string, readonly string[]>>();

/** Remember a probed catalog so launch can narrow effort without spawning a CLI. */
export function rememberTerminalAgentCatalog(
  agentId: string,
  models: readonly { id: string; thinking?: { options?: readonly string[] | null } | null }[],
): void {
  const id = agentId.trim();
  if (!id) return;
  const rows = new Map<string, readonly string[]>();
  for (const model of models) {
    const modelId = model.id.trim();
    if (!modelId) continue;
    rows.set(
      modelId,
      (model.thinking?.options ?? []).map((item) => item.trim()).filter(Boolean),
    );
  }
  rememberedModelEfforts.set(id, rows);
}

export function clearRememberedTerminalAgentCatalog(agentId?: string): void {
  if (agentId) rememberedModelEfforts.delete(agentId);
  else rememberedModelEfforts.clear();
}

/** The selected model row's effort list, when a catalog has already been probed. */
export function probedEffortForStoredModel(
  agentId: string,
  model: string | null | undefined,
): readonly string[] | undefined {
  const modelId = model?.trim();
  if (!modelId) return undefined;
  const rows = rememberedModelEfforts.get(agentId);
  if (!rows?.has(modelId)) return undefined;
  return rows.get(modelId) ?? [];
}

export function buildStructuredRunConfigArgs(
  agentId: string,
  value: TerminalAgentRunConfigInput | null | undefined,
  probedEffort?: readonly string[] | null,
): string[] {
  const config = sanitizeRunConfig(value);
  if (!config) return [];
  const support = reasoningSupportForAgent(agentId);
  const resolvedProbe = probedEffort ?? probedEffortForStoredModel(agentId, config.model);
  const effort = acceptedEffortValue(
    agentId,
    config.reasoning?.value,
    resolvedProbe,
    config.model,
  );
  const variant = openCodeVariantValue(agentId, config.reasoning?.value, resolvedProbe);
  const extraArgs = config.extra_args ?? [];
  const modelFlag = modelFlagForAgent(agentId);
  if (config.model && modelFlag && extraArgs.includes(modelFlag)) {
    throw new Error(`Extra args already include ${modelFlag} for agent \`${agentId}\`.`);
  }
  const effortFlag = effort ? effortFlagToken(agentId) : null;
  if (effortFlag && extraArgs.includes(effortFlag)) {
    throw new Error(`Extra args already include ${effortFlag} for agent \`${agentId}\`.`);
  }
  if (variant && extraArgs.includes("--variant")) {
    throw new Error(`Extra args already include --variant for agent \`${agentId}\`.`);
  }
  const fastFlag = config.fast ? standaloneFastFlag(agentId) : null;
  if (fastFlag && extraArgs.includes(fastFlag)) {
    throw new Error(`Extra args already include ${fastFlag} for agent \`${agentId}\`.`);
  }
  for (const arg of extraArgs) {
    if (reservedFlagsForAgent(agentId).has(arg)) {
      throw new Error(
        `Extra args cannot override reserved Atmos flags such as ${arg} for agent \`${agentId}\`.`,
      );
    }
  }

  let model = config.model ?? null;
  if (support.mode === "encoded_in_model" && effort) {
    if (!model) {
      throw new Error(
        `Agent \`${agentId}\` encodes effort in the model id, but no model was selected.`,
      );
    }
    model = encodeEffortInModelId(model, effort);
  }
  if (config.fast && model) {
    model = applyModelIdFast(agentId, model);
  }
  const args: string[] = [];
  if (model) {
    if (!modelFlag) {
      throw new Error(`Agent \`${agentId}\` does not support structured model selection.`);
    }
    args.push(modelFlag, model);
  }
  if (effort && support.mode !== "encoded_in_model") {
    pushEffortArgs(agentId, effort, args);
  }
  if (variant) args.push("--variant", variant);
  if (fastFlag) args.push(fastFlag);
  args.push(...extraArgs);
  return args;
}

function acceptedEffortValue(
  agentId: string,
  rawValue: string | null | undefined,
  probedEffort: readonly string[] | null | undefined,
  modelId?: string | null,
): string | null {
  const support = reasoningSupportForAgent(agentId);
  if (support.mode === "none") return null;
  const value = rawValue?.trim() ?? "";
  if (!value) return null;
  const winning = winningEffortOptions(agentId, probedEffort, undefined, modelId);
  if (support.mode === "encoded_in_model" && winning.length === 0) return null;
  if (winning.length > 0 && !winning.includes(value)) {
    throw new Error(`Agent \`${agentId}\` does not accept effort \`${value}\`.`);
  }
  if (winning.length === 0 && support.mode === "enum") {
    throw new Error(`Agent \`${agentId}\` does not accept effort \`${value}\`.`);
  }
  return value;
}

export type TerminalEffortProbeSource = "cli" | "native" | "acp";

/**
 * Where this built-in's catalog comes from. ACP snapshots are not Terminal effort.
 * A CLI line list that does not emit effort tokens is `cli` and still must not
 * replace the manifest enum (see `trustsProbedEffort`).
 */
export function terminalEffortProbeSource(agentId: string): TerminalEffortProbeSource {
  switch (agentId) {
    case "claude":
    case "codex":
    case "opencode":
    case "pi":
      return "native";
    case "gemini":
    case "devin":
    case "amp":
    case "hermes":
    case "openclaw":
    case "kilocode":
      return "acp";
    default:
      return "cli";
  }
}

/**
 * Per-model probes whose tokens are this CLI's effort values, not an ACP ladder.
 * `grok-build`'s own line list has no ladder; Terminal copies native `grok`
 * `reasoningEfforts` onto those rows before this filter runs.
 */
function trustsProbedEffort(agentId: string): boolean {
  switch (agentId) {
    case "claude":
    case "codex":
    case "opencode":
    case "pi":
    case "droid":
    case "cursor":
    case "grok-build":
      return true;
    default:
      return false;
  }
}

/**
 * Effort words a trusted CLI probe may return. Model ids and ACP-only names
 * are not in this set, so a long catalog dump cannot become the slider.
 * Includes Droid `minimal`, Codex `none`, and OpenCode variant `thinking`.
 */
const CLI_EFFORT_TOKENS = new Set([
  "off",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "thinking",
]);

function filterConfirmedEffort(agentId: string, probed: readonly string[]): string[] {
  if (!trustsProbedEffort(agentId)) return [];
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of probed) {
    const token = raw.trim().toLowerCase();
    if (!token || seen.has(token) || !CLI_EFFORT_TOKENS.has(token)) continue;
    seen.add(token);
    kept.push(token);
  }
  return kept;
}

/**
 * Native `grok` `reasoningEfforts` for the `grok models` line list.
 * That list has no per-model thinking. `grok-4.7-build-fast` uses `grok-4.7`.
 * A non-empty per-model probe still wins over this table.
 */
function grokBuildLineListEffort(modelId: string | null | undefined): string[] | null {
  const id = modelId?.trim() ?? "";
  if (!id) return null;
  const base = id.endsWith("-build-fast") ? id.slice(0, -"-build-fast".length) : id;
  switch (base) {
    case "grok-4.5":
      return ["low", "medium", "high"];
    case "grok-4.6":
    case "grok-4.7":
      return ["low", "medium", "high", "xhigh"];
    default:
      return null;
  }
}

/**
 * Thinking levels for one catalog row. An empty or missing `thinking.options`
 * list is the line-list case: it must not expand into the manifest enum.
 */
export function effortLevelsForTerminalRow(
  agentId: string,
  modelId: string | null | undefined,
  row?: { thinking?: { options?: readonly string[] | null } | null } | null,
): string[] {
  const options = row
    ? (row.thinking?.options ?? []).map((item) => item.trim()).filter(Boolean)
    : undefined;
  return visibleEffortOptions(
    agentId,
    options,
    terminalEffortProbeSource(agentId),
    modelId,
  );
}

export function visibleEffortOptions(
  agentId: string,
  probedEffort?: readonly string[] | null,
  source?: TerminalEffortProbeSource | null,
  modelId?: string | null,
): string[] {
  if (agentId === "opencode") {
    if (source === "acp" || !trustsProbedEffort(agentId)) return [];
    if (!probedEffort || probedEffort.length === 0) return [];
    return filterConfirmedEffort(agentId, probedEffort);
  }
  const support = reasoningSupportForAgent(agentId);
  if (support.mode === "none" || support.mode === "manual") return [];
  if (support.mode === "encoded_in_model") {
    if (source === "acp" || !probedEffort || probedEffort.length === 0) return [];
    return filterConfirmedEffort(agentId, probedEffort);
  }
  return winningEffortOptions(agentId, probedEffort, source, modelId);
}

function winningEffortOptions(
  agentId: string,
  probedEffort: readonly string[] | null | undefined,
  source?: TerminalEffortProbeSource | null,
  modelId?: string | null,
): string[] {
  const support = reasoningSupportForAgent(agentId);
  const ignoreProbe = source === "acp" || !trustsProbedEffort(agentId);
  if (!ignoreProbe && probedEffort && probedEffort.length > 0) {
    const filtered = filterConfirmedEffort(agentId, probedEffort);
    if (filtered.length > 0) return filtered;
    if (support.mode === "encoded_in_model") return [];
  }
  if (probedEffort && probedEffort.length === 0 && support.mode === "encoded_in_model") {
    return [];
  }
  if (source === "acp" && support.mode === "encoded_in_model") return [];
  if (agentId === "grok-build") {
    return grokBuildLineListEffort(modelId) ?? [];
  }
  return support.options ?? [];
}

function openCodeVariantValue(
  agentId: string,
  rawValue: string | null | undefined,
  probedEffort: readonly string[] | null | undefined,
): string | null {
  if (agentId !== "opencode") return null;
  const value = rawValue?.trim().toLowerCase() ?? "";
  if (!value) return null;
  const levels = visibleEffortOptions(agentId, probedEffort);
  return levels.includes(value) ? value : null;
}

/** Amp's standalone flag. Model-id fast (Droid, Cursor, Grok) is not a flag. */
function standaloneFastFlag(agentId: string): string | null {
  return agentId === "amp" ? "--fast" : null;
}

export function terminalFastVisible(
  agentId: string,
  model?: { fast?: boolean | null } | null,
): boolean {
  if (agentId === "amp") return true;
  if (agentId === "droid" || agentId === "cursor" || agentId === "grok-build") {
    return model?.fast === true;
  }
  return false;
}

function applyModelIdFast(agentId: string, model: string): string {
  if (agentId === "droid") {
    return model.endsWith("-fast") ? model : `${model}-fast`;
  }
  if (agentId === "grok-build") {
    return model.endsWith("-build-fast") ? model : `${model}-build-fast`;
  }
  if (agentId === "cursor") return setBracketParam(model, "fast", "true");
  return model;
}

function setBracketParam(model: string, key: string, value: string): string {
  const trimmed = model.trim();
  const open = trimmed.lastIndexOf("[");
  if (open >= 0 && trimmed.endsWith("]") && open + 1 < trimmed.length) {
    const base = trimmed.slice(0, open);
    const inner = trimmed.slice(open + 1, -1);
    const parts: string[] = [];
    let found = false;
    for (const raw of inner.split(",")) {
      const part = raw.trim();
      if (!part) continue;
      const eq = part.indexOf("=");
      const partKey = eq >= 0 ? part.slice(0, eq).trim() : "";
      if (partKey === key) {
        parts.push(`${key}=${value}`);
        found = true;
      } else {
        parts.push(part);
      }
    }
    if (!found) parts.push(`${key}=${value}`);
    return `${base}[${parts.join(",")}]`;
  }
  return `${trimmed}[${key}=${value}]`;
}

function pushEffortArgs(agentId: string, effort: string, args: string[]) {
  const support = reasoningSupportForAgent(agentId);
  const arg = support.arg?.trim();
  if (!arg) {
    throw new Error(`Agent \`${agentId}\` is missing a structured reasoning flag definition.`);
  }
  if (support.valueStyle === "flag_only") {
    args.push(arg);
    return;
  }
  if (support.valueStyle === "config") {
    if (effort.includes('"') || effort.includes("\n")) {
      throw new Error(`Agent \`${agentId}\` does not accept effort \`${effort}\`.`);
    }
    args.push("-c", `${arg}="${effort}"`);
    return;
  }
  args.push(arg, effort);
}

function effortFlagToken(agentId: string): string | null {
  const support = reasoningSupportForAgent(agentId);
  if (support.valueStyle === "config") return "-c";
  if (support.mode === "none" || support.mode === "encoded_in_model") return null;
  const arg = support.arg?.trim();
  return arg?.startsWith("-") ? arg : null;
}

function encodeEffortInModelId(model: string, effort: string): string {
  const trimmed = model.trim();
  const open = trimmed.lastIndexOf("[");
  if (open >= 0 && trimmed.endsWith("]") && open + 1 < trimmed.length) {
    const base = trimmed.slice(0, open);
    const inner = trimmed.slice(open + 1, -1);
    const parts: string[] = [];
    let found = false;
    for (const raw of inner.split(",")) {
      const part = raw.trim();
      if (!part) continue;
      const eq = part.indexOf("=");
      const key = eq >= 0 ? part.slice(0, eq).trim() : "";
      if (key === "effort") {
        parts.push(`effort=${effort}`);
        found = true;
      } else {
        parts.push(part);
      }
    }
    if (!found) parts.push(`effort=${effort}`);
    return `${base}[${parts.join(",")}]`;
  }
  return `${trimmed}[effort=${effort}]`;
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
): "value" | "flag_only" | "config" {
  const support = reasoningSupportForAgent(agentId);
  if (support.mode !== mode) return "value";
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
  if (modelFlag && extraArgs.includes(modelFlag)) conflicts.push(modelFlag);
  const reasoningFlag = config.reasoning?.value ? effortFlagToken(agentId) : null;
  if (reasoningFlag && extraArgs.includes(reasoningFlag)) conflicts.push(reasoningFlag);
  if (agentId === "opencode" && config.reasoning?.value && extraArgs.includes("--variant")) {
    conflicts.push("--variant");
  }
  if (config.fast && extraArgs.includes("--fast") && agentId === "amp") conflicts.push("--fast");
  for (const arg of extraArgs) {
    if (reservedFlagsForAgent(agentId).has(arg)) conflicts.push(arg);
  }
  return conflicts;
}

export function terminalAgentDefinitionById(agentId: string): TerminalAgentDefinition | undefined {
  return TERMINAL_AGENT_DEFINITIONS.find((item) => item.id === agentId);
}

/**
 * Native Chat hosts are probed through initialize even when the manifest has
 * no `modelList` command. Claude is that host: the CLI has `--model` and no
 * list subcommand, and the catalog comes from the native probe.
 */
function nativeOptionsHost(agentId: string): boolean {
  switch (agentId) {
    case "claude":
    case "claude-code":
    case "claude_code":
    case "codex":
    case "opencode":
    case "pi":
    case "grok":
      return true;
    default:
      return false;
  }
}

export function terminalModelCatalogEnabled(agentId: string): boolean {
  if (terminalAgentDefinitionById(agentId)?.modelList?.supported) return true;
  return nativeOptionsHost(agentId);
}

export function reasoningSupportForAgent(agentId: string): TerminalAgentReasoningSupport {
  return terminalAgentDefinitionById(agentId)?.reasoningSupport ?? { mode: "none" };
}

function reservedFlagsForAgent(agentId: string): Set<string> {
  const definition = terminalAgentDefinitionById(agentId);
  const flags = new Set<string>();
  for (const token of [
    ...tokenizeReservedFlags(definition?.params ?? ""),
    ...tokenizeReservedFlags(definition?.interactiveParams ?? ""),
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
