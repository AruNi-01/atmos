const MULTI_WORD_COMMANDS = new Set([
  "cargo",
  "npm",
  "yarn",
  "pnpm",
  "bun",
  "docker",
  "git",
  "kubectl",
  "go",
  "just",
  "make",
  "python",
  "ruby",
  "node",
]);

export function extractCommandName(fullCommand: string): string {
  const stripped = fullCommand
    .replace(/^(\s*(sudo|command|env)\s+)*/g, "")
    .replace(/^\s*\S+=\S+\s+/g, "")
    .trim();

  const parts = stripped.split(/\s+/);
  if (parts.length === 0 || !parts[0]) return fullCommand;

  const command = parts[0];
  if (MULTI_WORD_COMMANDS.has(command) && parts.length > 1) {
    return `${command} ${parts[1]}`;
  }
  return command;
}

export function shortenPath(fullPath: string): string {
  if (!fullPath || fullPath === "/") return "/";
  const parts = fullPath.split("/").filter(Boolean);
  if (parts.length <= 2) return fullPath;

  return `.../${parts.slice(-2).join("/")}`;
}

const RUNTIME_WRAPPER_COMMANDS = new Set([
  "bun",
  "cargo",
  "deno",
  "dotnet",
  "elixir",
  "env",
  "erl",
  "go",
  "gradle",
  "iex",
  "java",
  "lua",
  "luajit",
  "mvn",
  "mvnw",
  "node",
  "nodejs",
  "npm",
  "npx",
  "perl",
  "php",
  "pip",
  "pip3",
  "pipx",
  "pnpm",
  "poetry",
  "pypy",
  "python",
  "python3",
  "ruby",
  "rustc",
  "swift",
  "uv",
  "uvx",
  "yarn",
]);

const VERSIONED_RUNTIME_WRAPPER_COMMANDS = [
  "bun",
  "deno",
  "dotnet",
  "go",
  "java",
  "lua",
  "luajit",
  "nodejs",
  "node",
  "npm",
  "npx",
  "perl",
  "php",
  "pipx",
  "pip",
  "pypy",
  "python",
  "ruby",
  "rustc",
  "swift",
  "uvx",
  "uv",
];

const EXECUTABLE_SUFFIX_RE = /\.(?:exe|cmd|bat|sh)$/i;
const VERSION_SUFFIX_RE = /^[-_]?v?\d+(?:\.\d+)*(?:[-+_.]?[a-z][\w.-]*)?$/i;

/** Contested short names whose product owner depends on the real binary on PATH. */
export type ContestedCommandOwner = "grok-build" | "cursor" | "unknown";

export type ContestedOwnersMap = Partial<Record<"agent", ContestedCommandOwner>>;

export type TerminalTitleAgent = {
  id: string;
  label: string;
  command: string;
  iconType?: string;
  pipeCommand?: string;
  /** Optional extra first-token aliases for exact matching. */
  aliases?: string[];
};

export type ResolveAgentForTitleOptions = {
  contestedOwners?: ContestedOwnersMap;
};

function normalizeRuntimeWrapperTitle(value: string | undefined): string {
  const firstToken = firstCommandToken(value ?? "").token;
  const withoutPath = firstToken.split(/[\\/]/).filter(Boolean).pop() ?? firstToken;
  return withoutPath.replace(EXECUTABLE_SUFFIX_RE, "").toLowerCase();
}

function normalizeAgentCommand(value: string): string {
  const firstToken = firstCommandToken(value).token;
  const withoutPath = firstToken.split(/[\\/]/).filter(Boolean).pop() ?? firstToken;
  return withoutPath.replace(EXECUTABLE_SUFFIX_RE, "").toLowerCase();
}

function firstCommandToken(value: string): { token: string; rest: string } {
  const trimmed = value.trim();
  if (!trimmed) return { token: "", rest: "" };
  const quote = trimmed[0] === '"' || trimmed[0] === "'" ? trimmed[0] : null;
  if (!quote) {
    const match = trimmed.match(/^(\S+)(?:\s+([\s\S]*))?$/);
    return { token: match?.[1] ?? trimmed, rest: match?.[2]?.trim() ?? "" };
  }

  let escaped = false;
  for (let index = 1; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === quote) {
      return {
        token: trimmed.slice(1, index),
        rest: trimmed.slice(index + 1).trim(),
      };
    }
  }
  return { token: trimmed, rest: "" };
}

/** Platform-packaged Grok Build binaries: `grok`, `grok-macos-aarc`, `grok-linux-x86_64`, … */
function isGrokBuildCommandToken(token: string): boolean {
  return token === "grok" || token.startsWith("grok-");
}

function executablePathMatchToken(value: string): string | undefined {
  const normalized = value.replace(/\\/g, "/");
  const basename = normalizeAgentCommand(value);
  if (/(?:^|\/)(?:s?bin)\/[^/]+$/i.test(normalized)) {
    // bin/sbin basenames are returned as-is; grok-* is remapped in matchExactToken.
    return basename;
  }
  const lower = normalized.toLowerCase();
  if (
    lower.includes("/cursor-agent/") &&
    (basename === "agent" || basename === "cursor-agent")
  ) {
    return "cursor-agent";
  }
  if (lower.includes("/.grok/") && (basename === "agent" || isGrokBuildCommandToken(basename))) {
    return "grok";
  }
  return undefined;
}

export function isPathLikeTitle(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return (
    trimmed.startsWith("/") ||
    trimmed.startsWith("~/") ||
    /^[a-zA-Z]:[\\/]/.test(trimmed) ||
    trimmed.startsWith("\\\\") ||
    trimmed === "~" ||
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.startsWith("../") ||
    trimmed.startsWith("..\\") ||
    trimmed.includes("/") ||
    trimmed.includes("\\")
  );
}

function isRuntimeWrapperTitle(value: string | undefined): boolean {
  const normalized = normalizeRuntimeWrapperTitle(value);
  return Boolean(
    normalized &&
      (RUNTIME_WRAPPER_COMMANDS.has(normalized) ||
        VERSIONED_RUNTIME_WRAPPER_COMMANDS.some((command) => {
          if (!normalized.startsWith(command)) return false;
          return VERSION_SUFFIX_RE.test(normalized.slice(command.length));
        })),
  );
}

function shouldPreferBaseTitleOverDynamic<TAgent extends TerminalTitleAgent>(
  dynamicTitle: string | undefined,
  dynamicTitleIsVersion: boolean,
  toolbarAgent: TAgent | undefined,
): boolean {
  if (dynamicTitleIsVersion) return true;
  if (!dynamicTitle?.trim()) return false;
  return isRuntimeWrapperTitle(dynamicTitle) && !toolbarAgent;
}

function isVersionLikeTitle(value: string | undefined): boolean {
  if (!value) return false;
  return /^v?\d+(?:\.\d+)+(?:[-+][\w.-]+)?$/i.test(value.trim());
}

function agentCommandTokens(agent: TerminalTitleAgent): string[] {
  // Pipe-based agents are identified by the post-pipe executable only
  // (`echo … | myagent`), never by bare left-hand commands like `echo`.
  if (agent.pipeCommand) {
    const pipeToken = normalizeAgentCommand(agent.pipeCommand);
    return pipeToken ? [pipeToken] : [];
  }
  const tokens = [normalizeAgentCommand(agent.command)];
  for (const alias of agent.aliases ?? []) {
    const normalized = normalizeAgentCommand(alias);
    if (normalized) tokens.push(normalized);
  }
  return tokens.filter(Boolean);
}

/** Split on unquoted `|` only so paths/args with quotes keep working. */
function splitUnquotedPipeline(title: string): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (const character of title) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      current += character;
      escaped = true;
      continue;
    }
    if (quote) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }
    if (character === "|") {
      segments.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) segments.push(current.trim());
  return segments.filter(Boolean);
}

/**
 * Match dynamic terminal title first-token to a configured agent.
 * Uses exact token match (longer commands win ties). Contested bare `agent`
 * is resolved via `options.contestedOwners` instead of hard-coding a brand.
 */
export function resolveAgentForTitle<TAgent extends TerminalTitleAgent>(
  title: string | undefined,
  agents: TAgent[],
  options?: ResolveAgentForTitleOptions,
): TAgent | undefined {
  if (!title) return undefined;
  const command = firstCommandToken(title);
  const pathOnlyTitle = isPathLikeTitle(title) && !command.rest;
  const pathOnlyMatchToken = pathOnlyTitle
    ? executablePathMatchToken(command.token)
    : undefined;
  if (pathOnlyTitle && !pathOnlyMatchToken) {
    return undefined;
  }
  const normalizedTitle = pathOnlyMatchToken ?? normalizeAgentCommand(title);
  if (!normalizedTitle) return undefined;

  const pipeline = splitUnquotedPipeline(title);
  if (pipeline.length > 1) {
    const afterPipe = pipeline.slice(1).join(" | ").trim();
    const normalizedAfterPipe = normalizeAgentCommand(afterPipe);
    if (normalizedAfterPipe) {
      const matched = matchExactToken(normalizedAfterPipe, agents, options);
      if (matched) return matched;
    }
    // Fall back to the first executable segment when the pipe tail is unknown.
    return matchExactToken(normalizedTitle, agents, options);
  }

  return matchExactToken(normalizedTitle, agents, options);
}

function titleMatchToken(title: string | undefined): string {
  if (!title) return "";
  const pipeline = splitUnquotedPipeline(title);
  if (pipeline.length > 1) {
    return normalizeAgentCommand(pipeline.slice(1).join(" | ").trim());
  }
  return normalizeAgentCommand(title);
}

function isPathOnlyTitle(title: string | undefined): boolean {
  if (!title) return false;
  const command = firstCommandToken(title);
  return isPathLikeTitle(title) && !command.rest;
}

function matchExactToken<TAgent extends TerminalTitleAgent>(
  token: string,
  agents: TAgent[],
  options?: ResolveAgentForTitleOptions,
): TAgent | undefined {
  // Contested short name: map via real CLI identity, never substring-brand.
  if (token === "agent") {
    const owner = options?.contestedOwners?.agent;
    if (owner === "grok-build") {
      return agents.find((agent) => agent.id === "grok-build");
    }
    if (owner === "cursor") {
      return agents.find((agent) => agent.id === "cursor");
    }
    // unknown / missing → no brand match (show raw command)
    return undefined;
  }

  const matches = agents
    .map((agent) => {
      const tokens = agentCommandTokens(agent);
      // Exact token, or Grok platform binary prefix (`grok-macos-aarc` → agent cmd `grok`).
      const exact = tokens.find(
        (t) => t === token || (t === "grok" && isGrokBuildCommandToken(token)),
      );
      if (!exact) return null;
      return { agent, score: exact.length };
    })
    .filter((m): m is { agent: TAgent; score: number } => m !== null);

  if (matches.length === 0) return undefined;

  // Prefer longer / more-specific command token when multiple agents match.
  matches.sort((a, b) => b.score - a.score);
  return matches[0]?.agent;
}

function resolveAgentForLabel<TAgent extends TerminalTitleAgent>(
  label: string | undefined,
  agents: TAgent[],
): TAgent | undefined {
  if (!label) return undefined;
  const normalizedLabel = label.trim().toLowerCase();
  return agents.find((agent) => {
    const normalizedAgentLabel = agent.label.trim().toLowerCase();
    if (normalizedLabel === normalizedAgentLabel) return true;
    const suffix = normalizedLabel.slice(normalizedAgentLabel.length);
    return suffix.startsWith("-") && /^\d+$/.test(suffix.slice(1));
  });
}

export function getTerminalDisplayTitle<TAgent extends TerminalTitleAgent>(options: {
  baseTitle: string | undefined;
  dynamicTitle: string | undefined;
  configuredAgents?: TAgent[];
  agent?: TAgent;
  contestedOwners?: ContestedOwnersMap;
}) {
  return getTerminalDisplayMeta(options).displayTitle;
}

export function getTerminalDisplayMeta<TAgent extends TerminalTitleAgent>(options: {
  baseTitle: string | undefined;
  dynamicTitle: string | undefined;
  configuredAgents?: TAgent[];
  agent?: TAgent;
  contestedOwners?: ContestedOwnersMap;
}): {
  displayTitle: string;
  toolbarAgent: TAgent | undefined;
} {
  const { baseTitle, dynamicTitle, configuredAgents = [], agent, contestedOwners } = options;
  const dynamicTitleIsVersion = isVersionLikeTitle(dynamicTitle);
  const matchedDynamicAgent = resolveAgentForTitle(dynamicTitle, configuredAgents, {
    contestedOwners,
  });
  // Contested bare `agent` command lines suppress stale brand fallbacks.
  // Path-only titles ending in `agent` must not hide a valid pane agent.
  const unresolvedContestedDynamic =
    titleMatchToken(dynamicTitle) === "agent" &&
    !matchedDynamicAgent &&
    !isPathOnlyTitle(dynamicTitle);
  const labelAgent = resolveAgentForLabel(baseTitle, configuredAgents);
  const fallbackAgent = isRuntimeWrapperTitle(dynamicTitle)
    ? agent ?? labelAgent
    : dynamicTitleIsVersion
      ? labelAgent ?? agent
      : undefined;
  const toolbarAgent = unresolvedContestedDynamic
    ? undefined
    : matchedDynamicAgent ?? fallbackAgent ?? labelAgent;

  return {
    toolbarAgent,
    displayTitle:
      toolbarAgent?.label ??
      (shouldPreferBaseTitleOverDynamic(dynamicTitle, dynamicTitleIsVersion, toolbarAgent)
        ? baseTitle
        : dynamicTitle) ??
      baseTitle ??
      "",
  };
}
