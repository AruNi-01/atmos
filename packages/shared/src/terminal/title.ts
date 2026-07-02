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

export type TerminalTitleAgent = {
  id: string;
  label: string;
  command: string;
  iconType?: string;
  pipeCommand?: string;
};

function normalizeRuntimeWrapperTitle(value: string | undefined): string {
  const firstToken = value?.trim().split(/\s+/)[0] ?? "";
  const withoutPath = firstToken.split("/").filter(Boolean).pop() ?? firstToken;
  return withoutPath.replace(EXECUTABLE_SUFFIX_RE, "").toLowerCase();
}

function normalizeAgentCommand(value: string): string {
  const firstToken = value.trim().split(/\s+/)[0] ?? "";
  const withoutPath = firstToken.split("/").filter(Boolean).pop() ?? firstToken;
  return withoutPath.toLowerCase();
}

export function isPathLikeTitle(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return (
    trimmed.startsWith("/") ||
    trimmed.startsWith("~/") ||
    trimmed === "~" ||
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.startsWith("../") ||
    trimmed.includes("/")
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

export function resolveAgentForTitle<TAgent extends TerminalTitleAgent>(
  title: string | undefined,
  agents: TAgent[],
): TAgent | undefined {
  if (!title || isPathLikeTitle(title)) return undefined;
  const normalizedTitle = normalizeAgentCommand(title);
  if (!normalizedTitle) return undefined;

  if (normalizedTitle === "echo") {
    return agents.find((agent) => agent.pipeCommand);
  }

  if (title.includes("|")) {
    const afterPipe = title.split("|").slice(1).join("|").trim();
    const normalizedAfterPipe = normalizeAgentCommand(afterPipe);
    if (normalizedAfterPipe) {
      return agents.find((agent) => {
        const normalizedCommand = normalizeAgentCommand(agent.command);
        const normalizedPipeCommand = agent.pipeCommand ? normalizeAgentCommand(agent.pipeCommand) : "";
        return (
          (normalizedCommand !== "" && normalizedAfterPipe.includes(normalizedCommand)) ||
          (normalizedPipeCommand !== "" && normalizedAfterPipe.includes(normalizedPipeCommand))
        );
      });
    }
  }

  return agents.find((agent) => {
    const normalizedCommand = normalizeAgentCommand(agent.command);
    return normalizedCommand !== "" && normalizedTitle.includes(normalizedCommand);
  });
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
}) {
  return getTerminalDisplayMeta(options).displayTitle;
}

export function getTerminalDisplayMeta<TAgent extends TerminalTitleAgent>(options: {
  baseTitle: string | undefined;
  dynamicTitle: string | undefined;
  configuredAgents?: TAgent[];
  agent?: TAgent;
}): {
  displayTitle: string;
  toolbarAgent: TAgent | undefined;
} {
  const { baseTitle, dynamicTitle, configuredAgents = [], agent } = options;
  const dynamicTitleIsVersion = isVersionLikeTitle(dynamicTitle);
  const matchedDynamicAgent = resolveAgentForTitle(dynamicTitle, configuredAgents);
  const labelAgent = resolveAgentForLabel(baseTitle, configuredAgents);
  const fallbackAgent = isRuntimeWrapperTitle(dynamicTitle)
    ? agent ?? labelAgent
    : dynamicTitleIsVersion
      ? labelAgent ?? agent
      : undefined;
  const toolbarAgent = matchedDynamicAgent ?? fallbackAgent ?? labelAgent;

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
