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

/**
 * CMD_END / cwd-style titles that mean "shell at prompt", not a running binary.
 *
 * Absolute agent/CLI paths (`/opt/homebrew/bin/claude`, `~/.grok/.../grok`)
 * are path-like but busy — close confirmation must still treat them as work.
 */
export function isIdleCwdTitle(value: string | undefined): boolean {
  if (!value) return false;
  const command = firstCommandToken(value);
  if (!isPathLikeTitle(value) || command.rest) return false;
  return !executablePathMatchToken(command.token);
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

/**
 * Single-token process basename from tmux `pane_current_command` / CMD_START
 * inject (e.g. "agy", "node", "python3.11") — not a path, cwd, or multi-word title.
 */
export function isBareProcessTitle(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 48) return false;
  if (isPathLikeTitle(trimmed)) return false;
  if (trimmed.includes("·") || trimmed.includes(" - ")) return false;
  // Allow versioned binaries (python3.11) but reject multi-word shell titles.
  if (/\s/.test(trimmed)) return false;
  return true;
}

/**
 * Default tmux window names are decimal indexes (`1`, `6`). Those are attach
 * identities, not display titles — center tabs should keep the last cwd/command.
 */
export function isTmuxIndexTitle(value: string | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  return /^\d+$/.test(trimmed);
}

/**
 * Reattach injects CMD_START:<process> which must not clobber a richer title
 * already held in the pane store (warm workspace switch keep-alive).
 */
export function isDynamicTitleDowngrade(
  existing: string | undefined,
  next: string | undefined,
): boolean {
  const prev = existing?.trim();
  const n = next?.trim();
  if (!prev || !n || prev === n) return false;
  // Never replace a real title with a tmux window index.
  if (isTmuxIndexTitle(n)) return true;
  if (!isBareProcessTitle(n)) return false;
  // Process just started over a cwd/path title — that is an upgrade, allow it.
  if (isPathLikeTitle(prev)) return false;
  // Both bare process names — allow agy → node style swaps.
  if (isBareProcessTitle(prev)) return false;
  // Existing is richer (agent brand, custom OSC, multi-word) — keep it.
  return true;
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

/** Practical cap for native OSC 0/2 titles in Atmos toolbars (APP-047). */
export const MAX_NATIVE_OSC_TITLE_CHARS = 64;

/**
 * Normalize untrusted native OSC 0/2 title text into a single display line.
 * Strips control characters, collapses whitespace, and caps length.
 */
export function sanitizeNativeOscTitle(title: string | undefined): string {
  if (!title) return "";
  let pendingSpace = false;
  let out = "";
  for (const ch of title) {
    // Whitespace (including \t/\n) collapses to a single space.
    if (/\s/u.test(ch)) {
      if (out.length > 0) pendingSpace = true;
      continue;
    }
    // Drop remaining C0/C1 controls and DEL so titles cannot break OSC framing.
    if (ch <= "\u001f" || ch === "\u007f" || (ch >= "\u0080" && ch <= "\u009f")) {
      continue;
    }
    if (pendingSpace) {
      if (out.length + 1 >= MAX_NATIVE_OSC_TITLE_CHARS) break;
      out += " ";
      pendingSpace = false;
    }
    if (out.length >= MAX_NATIVE_OSC_TITLE_CHARS) break;
    out += ch;
  }
  return out;
}

export type OscTitleDisplayContext = {
  /** Atmos auto title already shown (agent label / command / path). */
  autoDisplayTitle?: string;
  /** Shim dynamic title (CMD_START command name, etc.). */
  dynamicTitle?: string;
  /** Resolved toolbar agent — when set, bare CLI names are redundant. */
  toolbarAgent?: TerminalTitleAgent;
};

/**
 * Shell builtins / navigation / listing helpers that auto-title on every
 * short interactive command. These should never flash as OSC suffixes.
 *
 * Program CLIs (`git`, `npm`, `node`, `cargo`, …) are intentionally **not**
 * listed — bare tool names can still surface as running-process titles.
 */
const TRANSIENT_SHELL_COMMAND_OSC = new Set([
  // Interactive shells themselves (idle prompt / reattach titles)
  "zsh",
  "bash",
  "sh",
  "fish",
  "nu",
  "nushell",
  "pwsh",
  "powershell",
  "cmd",
  "cmd.exe",
  "dash",
  "ksh",
  "csh",
  "tcsh",
  "xonsh",
  "elvish",
  "oil",
  "osh",
  // Directory / listing
  "ls",
  "ll",
  "la",
  "l",
  "dir",
  "tree",
  "pwd",
  "cd",
  "pushd",
  "popd",
  "dirs",
  // Shell builtins / job control / trivial interactive
  "echo",
  "printf",
  "true",
  "false",
  ":",
  "type",
  "which",
  "whence",
  "command",
  "builtin",
  "hash",
  "alias",
  "unalias",
  "export",
  "unset",
  "set",
  "shift",
  "read",
  "readonly",
  "local",
  "declare",
  "typeset",
  "let",
  "eval",
  "source",
  ".",
  "exec",
  "exit",
  "logout",
  "return",
  "break",
  "continue",
  "wait",
  "jobs",
  "fg",
  "bg",
  "disown",
  "kill",
  "killall",
  "history",
  "fc",
  "bind",
  "bindkey",
  "compdef",
  "complete",
  "compgen",
  "ulimit",
  "umask",
  "times",
  "time",
  "trap",
  "clear",
  "reset",
  "tput",
  // Common short filesystem one-shots that only restate cwd activity
  "touch",
  "mkdir",
  "rmdir",
  "rm",
  "cp",
  "mv",
  "ln",
  "chmod",
  "chown",
  "stat",
  "file",
  "du",
  "df",
  "head",
  "tail",
  "cat",
  "less",
  "more",
  "wc",
  "basename",
  "dirname",
  "realpath",
  "readlink",
  "env",
  "printenv",
  "date",
  "whoami",
  "hostname",
  "uname",
  "sleep",
  // Process / network inspection one-shots (oh-my-zsh style auto-title)
  "ps",
  "pgrep",
  "pkill",
  "lsof",
  "top",
  "htop",
  "btop",
  "iotop",
  "vmstat",
  "iostat",
  "netstat",
  "ss",
  "ifconfig",
  "ip",
  "ping",
  "traceroute",
  "dig",
  "nslookup",
  "curl",
  "wget",
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "ag",
  "ack",
  "find",
  "fd",
  "locate",
  "awk",
  "sed",
  "cut",
  "sort",
  "uniq",
  "tr",
  "xargs",
  "tee",
  "watch",
  "man",
  "info",
  "open",
  "xdg-open",
  "pbcopy",
  "pbpaste",
  "clip",
  "jq",
  "yq",
]);

/**
 * Commands that commonly accept BSD-style option bundles without a leading dash
 * (e.g. `ps aux`, `ps ax`). Only these may treat bare letter tokens as flags —
 * do not apply this to prose-prone commands like `find`.
 * Note: `tar` is intentionally not in TRANSIENT_SHELL_COMMAND_OSC (program CLI),
 * so it is not listed here either.
 */
const OPTION_BUNDLE_TRANSIENT_COMMANDS = new Set(["ps"]);

/** BSD / clustered option bundle: `aux`, `ax`, `ef`, `xzf` — letters only, short. */
function isShellOptionBundleToken(tok: string): boolean {
  return /^[A-Za-z]+$/.test(tok) && tok.length <= 8;
}

/** Path-ish target after a standalone `<` redirect (not prose `A < B`). */
function looksLikeRedirectTarget(tok: string): boolean {
  return (
    tok.startsWith("./") ||
    tok.startsWith("../") ||
    tok.startsWith("/") ||
    tok.startsWith("~/") ||
    tok.includes("/") ||
    /\.\w{1,10}$/.test(tok)
  );
}

/**
 * Shell redirect operators as tokens — keeps `Generics<T>` / `A < B check` as
 * legitimate OSC topics while still catching `cat file > out` and `2>&1`.
 */
function hasShellRedirectTokens(osc: string): boolean {
  const tokens = osc.trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i] ?? "";
    // Output / fd redirects: `>`, `>>`, `2>&1`, `>out`
    if (/^\d*>{1,2}&?\d*$/.test(tok) || /^\d*>{1,2}.+/.test(tok)) return true;
    // Attached input / heredoc: `<file`, `<<EOF`, `2<&0`
    if (/^\d*<{1,2}&?\d+$/.test(tok) || /^\d*<{1,2}.+/.test(tok)) return true;
    // Standalone `<` / `<<` only when the next token looks like a path/file.
    if ((tok === "<" || tok === "<<") && looksLikeRedirectTarget(tokens[i + 1] ?? "")) {
      return true;
    }
  }
  return false;
}

/**
 * Whether OSC text is a bare shell builtin/navigation command from preexec
 * auto-title (e.g. `ls`, `pwd`, `cd`) — not a program CLI or agent topic.
 *
 * Only bare commands or command+flags/paths (`ls`, `ls -la`, `find .`, `ps aux`)
 * count. Multi-word natural-language topics (`find memory leak`, `fix src/api`)
 * pass.
 */
export function isTransientShellCommandOscTitle(osc: string): boolean {
  const t = osc.trim();
  if (!t) return false;
  const tokens = t.split(/\s+/).filter(Boolean);
  const first = tokens[0]?.toLowerCase() ?? "";
  if (!first) return false;
  // Drop leading `./` / path wrappers so `./ls` still matches if ever used.
  const base = first.includes("/") ? (first.split("/").pop() ?? first) : first;
  if (!TRANSIENT_SHELL_COMMAND_OSC.has(base)) return false;
  if (tokens.length === 1) return true;
  const allowOptionBundles = OPTION_BUNDLE_TRANSIENT_COMMANDS.has(base);
  // Further tokens must look like shell flags/paths, not prose words.
  return tokens.slice(1).every((tok) => {
    return (
      tok.startsWith("-") ||
      tok.startsWith("./") ||
      tok.startsWith("/") ||
      tok.startsWith("~/") ||
      tok === "." ||
      tok === ".." ||
      tok.includes("/") ||
      (allowOptionBundles && isShellOptionBundleToken(tok))
    );
  });
}

/**
 * Whether OSC text looks like a shell preexec auto-title of the typed command
 * line (pipelines, chains, redirects, transient builtins) rather than an
 * agent session topic (`debugging auth`, `fix src/api`).
 *
 * Used both to reject noise on ingest and to clear a stale command line when
 * the shell returns to idle (path OSC / CMD_END) without wiping real topics.
 */
export function isShellPreexecCommandOscTitle(osc: string): boolean {
  const t = osc.trim();
  if (!t) return false;
  // Pipeline / chain / command substitution — classic shell preexec.
  if (/[|`]|\$\(|\$\{|\s(?:&&|\|\|)\s/.test(t)) return true;
  // Redirect-like tokens (`> out`, `>>log`, `< /tmp/x`, `2>&1`) — not angle
  // brackets inside prose/types (`Generics<T>`, `A < B check`).
  if (hasShellRedirectTokens(t)) return true;
  // Background job: trailing or token-alone `&` (not `Q&A`, not `X & Y` prose).
  // Require `&` at end of title or before `;` / another operator-like boundary.
  if (/(?:^|\s)&\s*$/.test(t) || /(?:^|\s)&\s*[;|]/.test(t)) return true;
  if (isTransientShellCommandOscTitle(t)) return true;
  return false;
}

/**
 * Shell / terminal-integration titles that should not appear as OSC suffixes.
 * Examples: `user@Host:~/path`, pure paths, bare preexec shell cmds (`ls`),
 * full preexec command lines (`ps aux | grep foo`).
 *
 * Intentionally keeps program CLIs (`git`, `npm`) and multi-word session topics
 * (`fix src/api`) — those are useful OSC titles.
 */
export function isNoisyShellOscTitle(osc: string): boolean {
  const t = osc.trim();
  if (!t) return true;
  // user@host:…  (classic bash/zsh PROMPT_COMMAND / oh-my-zsh auto-title)
  if (/^[^@\s]+@[^:\s]+:/.test(t)) return true;
  // host:absolute-or-home path without @
  if (/^[\w.-]+:(?:~|\/)/.test(t)) return true;
  // Entire title is a bare filesystem path (no spaces / not a phrase).
  if (isBareFilesystemOscTitle(t)) return true;
  // Shell preexec command lines (builtins, inspection tools, pipelines).
  if (isShellPreexecCommandOscTitle(t)) return true;
  return false;
}

/**
 * Classify an incoming native OSC 0/2 title for store/UI updates.
 *
 * - `set`: meaningful session topic — store it
 * - `clear`: explicit empty title — wipe stored OSC
 * - `ignore`: shell path/host/command noise — do not store the noise as the
 *   new title (callers should use {@link nextOscTitleAfterIncoming} so ignored
 *   commands still clear a previous suffix)
 */
export function resolveIncomingOscTitle(
  raw: string | undefined,
): { action: "set"; value: string } | { action: "clear" } | { action: "ignore" } {
  if (raw == null) return { action: "clear" };
  const cleaned = sanitizeNativeOscTitle(raw);
  if (!cleaned) return { action: "clear" };
  if (isNoisyShellOscTitle(cleaned)) return { action: "ignore" };
  return { action: "set", value: cleaned };
}

/**
 * Apply an incoming native OSC update against a previously stored value.
 *
 * - `set` / `clear` — take the resolved value
 * - ignored **shell command** preexec (`ls`, `ps aux | …`) — always clear.
 *   The command is not a session topic, so the toolbar suffix should be empty
 *   rather than keeping a stale previous title.
 * - ignored **path/host** redraw (`user@host:cwd`) — clear a stale preexec
 *   command line, but keep real agent session topics (agents re-emit slowly;
 *   prompt redraw must not erase them).
 */
export function nextOscTitleAfterIncoming(
  previous: string | undefined,
  raw: string | undefined,
): string | undefined {
  const resolved = resolveIncomingOscTitle(raw);
  if (resolved.action === "set") return resolved.value;
  if (resolved.action === "clear") return undefined;

  // ignore — never paint the noise; decide whether to wipe previous.
  const cleaned = sanitizeNativeOscTitle(raw);
  // User ran an ignored shell command → final suffix must be empty.
  if (cleaned && isShellPreexecCommandOscTitle(cleaned)) return undefined;
  // Idle path/host noise: drop stuck preexec lines; keep agent topics.
  if (previous && isShellPreexecCommandOscTitle(previous)) return undefined;
  return previous;
}

/** True when the whole OSC string is a path, not a multi-word session topic. */
function isBareFilesystemOscTitle(t: string): boolean {
  if (/\s/.test(t)) return false;
  // Absolute / home / Windows / UNC
  if (
    t.startsWith("/") ||
    t.startsWith("~/") ||
    t === "~" ||
    t === "." ||
    t === ".." ||
    t.startsWith("../") ||
    /^[a-zA-Z]:[\\/]/.test(t) ||
    t.startsWith("\\\\")
  ) {
    return true;
  }
  // Shortened path form from Atmos shim style (.../foo/bar)
  if (/^\.\.\.?\//.test(t)) return true;
  // Single path-like token under common roots (e.g. Users/me/proj without leading /)
  if (
    /^(?:Users|home|tmp|var|opt|private|Volumes|Library|\.atmos)\//i.test(t) ||
    t.includes("/.atmos/") ||
    t.includes("/workspaces/")
  ) {
    return true;
  }
  return false;
}

/**
 * OSC text that only repeats what Atmos already shows as agent brand / command.
 * E.g. agent label "Claude Code" + OSC "claude" → redundant.
 */
export function isRedundantAgentOscTitle(
  osc: string,
  context: OscTitleDisplayContext = {},
): boolean {
  const t = osc.trim();
  if (!t) return true;

  const oscNorm = normalizeAgentCommand(t);
  const oscLower = t.toLowerCase();
  const auto = context.autoDisplayTitle?.trim() ?? "";
  if (auto && (auto === t || auto.toLowerCase() === oscLower)) return true;

  const dynamic = context.dynamicTitle?.trim() ?? "";
  if (dynamic) {
    if (dynamic === t || dynamic.toLowerCase() === oscLower) return true;
    if (normalizeAgentCommand(dynamic) === oscNorm && !/\s/.test(t)) return true;
  }

  const agent = context.toolbarAgent;
  if (!agent) return false;

  const label = agent.label?.trim() ?? "";
  if (label && label.toLowerCase() === oscLower) return true;

  // Single-token OSC that is just the agent CLI / brand / id (e.g. "claude").
  if (!/\s/.test(t)) {
    const tokens = new Set<string>();
    for (const raw of [agent.command, agent.pipeCommand, ...(agent.aliases ?? [])]) {
      if (!raw?.trim()) continue;
      tokens.add(normalizeAgentCommand(raw));
    }
    if (agent.id) tokens.add(agent.id.toLowerCase());
    if (label) {
      tokens.add(label.toLowerCase());
      tokens.add(label.replace(/\s+/g, "").toLowerCase());
      tokens.add(normalizeAgentCommand(label));
      const firstWord = label.split(/\s+/)[0]?.toLowerCase();
      if (firstWord) tokens.add(firstWord);
    }
    if (tokens.has(oscNorm) || tokens.has(oscLower)) return true;
    // Grok packaged binaries: osc "grok-macos-aarc" while agent cmd is "grok"
    if (tokens.has("grok") && isGrokBuildCommandToken(oscNorm)) return true;
  }

  return false;
}

/**
 * Sanitize + filter native OSC for toolbar display.
 * Drops shell host/cwd noise and agent-command duplicates.
 */
export function resolveDisplayOscTitle(
  oscTitle: string | undefined,
  context: OscTitleDisplayContext = {},
): string {
  const osc = sanitizeNativeOscTitle(oscTitle);
  if (!osc) return "";
  if (isNoisyShellOscTitle(osc)) return "";
  if (isRedundantAgentOscTitle(osc, context)) return "";
  return osc;
}

/**
 * Grok Build composes OSC 0/2 titles as `part - part - …` with realtime
 * prefixes (`Action Required`, spinner, `Responding` / `Running: …`) and a
 * trailing brand (`grok`). Session name is the stable part center tabs want.
 *
 * @see xai-org/grok-build `notifications/title.rs` (separator ` - `)
 */
const GROK_TITLE_PART_SEPARATOR = " - ";

/** Braille / classic spinner glyphs used by agent CLIs in host titles. */
const OSC_SPINNER_SEGMENT_RE =
  /^[\u2800-\u28FF●○◉◎◐◑◒◓⣾⣽⣻⢿⡿⣟⣯⣷⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]+$/u;

const REALTIME_OSC_ACTIVITY_EXACT = new Set([
  "action required",
  "thinking",
  "responding",
  "waiting",
  "compacting",
  "verifying",
  "running tool",
  "grok",
]);

function isRealtimeOscTitleSegment(segment: string): boolean {
  const t = segment.trim();
  if (!t) return true;
  if (OSC_SPINNER_SEGMENT_RE.test(t)) return true;
  const lower = t.toLowerCase();
  if (REALTIME_OSC_ACTIVITY_EXACT.has(lower)) return true;
  // Grok activity: "Running: cargo test", "Retrying (2/3)"
  if (/^running:\s+/i.test(t)) return true;
  if (/^retrying\b/i.test(t)) return true;
  // Turn timer item: "42s", "12m"
  if (/^\d+[smh]$/i.test(t)) return true;
  return false;
}

/**
 * Extract a **stable session topic** from a live native OSC title for center-tab
 * display (not the pane toolbar).
 *
 * - Grok-style compound titles (`Responding - my-session - grok`) → `my-session`
 * - Pure realtime segments only → empty (callers keep a sticky previous topic)
 * - Plain multi-word / session topics (Claude/Codex) → the topic itself
 *
 * Pane toolbars should keep using {@link resolveDisplayOscTitle} / live OSC.
 */
export function extractStableCenterTabOscTitle(
  oscTitle: string | undefined,
  context: OscTitleDisplayContext = {},
): string {
  const osc = resolveDisplayOscTitle(oscTitle, context);
  if (!osc) return "";

  // Grok (and similar) join title items with " - ".
  if (osc.includes(GROK_TITLE_PART_SEPARATOR)) {
    const parts = osc
      .split(GROK_TITLE_PART_SEPARATOR)
      .map((p) => p.trim())
      .filter(Boolean);

    // Drop trailing brand / pure realtime tails, then leading realtime heads.
    while (parts.length > 0 && isRealtimeOscTitleSegment(parts[parts.length - 1]!)) {
      parts.pop();
    }
    while (parts.length > 0 && isRealtimeOscTitleSegment(parts[0]!)) {
      parts.shift();
    }

    if (parts.length === 0) return "";
    // Default Grok order places session-name first among remaining stable items
    // (before optional model / cwd). Prefer that fixed identity for the tab.
    return parts[0]!;
  }

  // Single-segment OSC: reject pure activity so center tabs do not thrash.
  if (isRealtimeOscTitleSegment(osc)) return "";
  return osc;
}

/**
 * Sticky session-topic state for center-stage terminal tabs.
 *
 * - Live OSC cleared → forget the sticky topic
 * - Extractable stable topic → adopt it (session rename / first topic)
 * - Live OSC is pure realtime noise → keep the previous sticky topic
 *
 * Pane toolbars still follow live OSC; only center tabs use this.
 */
export function nextCenterTabSessionOscTitle(
  previous: string | undefined,
  liveOscTitle: string | undefined,
  context: OscTitleDisplayContext = {},
): string | undefined {
  const cleaned = sanitizeNativeOscTitle(liveOscTitle);
  if (!cleaned) return undefined;

  const extracted = extractStableCenterTabOscTitle(liveOscTitle, context);
  if (extracted) return extracted;

  // Realtime-only update (spinner / activity) — hold the last session topic.
  const prev = previous?.trim();
  return prev || undefined;
}

/**
 * Append a native OSC title after an Atmos auto/custom display title.
 * Returns auto-only when `oscTitle` is empty, suppressed, or filtered as noise.
 */
export function appendNativeOscTitle(
  autoDisplayTitle: string | undefined,
  oscTitle: string | undefined,
  suppress = false,
  context: OscTitleDisplayContext = {},
): string {
  const base = autoDisplayTitle?.trim() ?? "";
  if (suppress) return base;
  const osc = resolveDisplayOscTitle(oscTitle, {
    ...context,
    autoDisplayTitle: context.autoDisplayTitle ?? base,
  });
  if (!osc) return base;
  if (!base) return osc;
  return `${base} | ${osc}`;
}

export function getTerminalDisplayTitle<TAgent extends TerminalTitleAgent>(options: {
  baseTitle: string | undefined;
  dynamicTitle: string | undefined;
  configuredAgents?: TAgent[];
  agent?: TAgent;
  contestedOwners?: ContestedOwnersMap;
  oscTitle?: string;
  suppressOscTitle?: boolean;
  /**
   * When false, hide the detected agent brand text (icon still shown by callers).
   * Default true. OSC then joins with a space (no ` | `) because primary is empty.
   */
  showAgentName?: boolean;
}) {
  return getTerminalDisplayMeta(options).displayTitle;
}

export function getTerminalDisplayMeta<TAgent extends TerminalTitleAgent>(options: {
  baseTitle: string | undefined;
  dynamicTitle: string | undefined;
  configuredAgents?: TAgent[];
  agent?: TAgent;
  contestedOwners?: ContestedOwnersMap;
  /**
   * Native OSC 0/2 title from the foreground process (Codex/Claude/…).
   * Never used for agent detection — display suffix only (APP-047).
   */
  oscTitle?: string;
  /** User set a custom pane label — hide OSC suffix. */
  suppressOscTitle?: boolean;
  /**
   * When false, hide the detected agent brand text (icon still shown by callers).
   * Default true. With name hidden, primary is empty so OSC stands alone (no ` | `).
   */
  showAgentName?: boolean;
}): {
  /** Combined title for plain string consumers (tabs, tooltips, a11y). */
  displayTitle: string;
  /** Atmos-owned left title (agent brand / command / path / custom). */
  primaryTitle: string;
  /** Filtered OSC session topic; empty when suppressed or noise. */
  oscSuffix: string;
  toolbarAgent: TAgent | undefined;
} {
  const {
    baseTitle,
    dynamicTitle,
    configuredAgents = [],
    agent,
    contestedOwners,
    oscTitle,
    suppressOscTitle,
    showAgentName = true,
  } = options;
  const dynamicTitleIsVersion = isVersionLikeTitle(dynamicTitle);
  // Pane leftover `agent` still brands when the live command is that agent
  // (`claude` → Claude Code). It must not brand unrelated CLIs (mole, agy).
  const agentsForTitle = agent ? [agent, ...configuredAgents] : configuredAgents;
  const matchedDynamicAgent = resolveAgentForTitle(dynamicTitle, agentsForTitle, {
    contestedOwners,
  });
  // Contested bare `agent` command lines suppress stale brand fallbacks.
  // Path-only titles ending in `agent` are cwd/path text, not that CLI token.
  const unresolvedContestedDynamic =
    titleMatchToken(dynamicTitle) === "agent" &&
    !matchedDynamicAgent &&
    !isPathOnlyTitle(dynamicTitle);
  const labelAgent = resolveAgentForLabel(baseTitle, configuredAgents);
  // Runtime wrappers (python3.11, node) and version-like reattach injects
  // (3.1.3) should not hide a known pane agent brand. Real CLIs (mole, vim,
  // htop, agy, git) must display as themselves unless resolveAgentForTitle
  // matches a configured agent.
  const fallbackAgent = isRuntimeWrapperTitle(dynamicTitle)
    ? agent ?? labelAgent
    : dynamicTitleIsVersion
      ? labelAgent ?? agent
      : undefined;
  // A live cwd or non-agent command is the current title. Do not keep a leftover
  // pane-label brand (e.g. launched as "Claude Code") after the agent exits or
  // the shell returns to a prompt — refresh + typed commands must show cwd.
  const hasLiveDynamicTitle =
    Boolean(dynamicTitle?.trim()) && !isTmuxIndexTitle(dynamicTitle);
  const toolbarAgent = unresolvedContestedDynamic
    ? undefined
    : matchedDynamicAgent ?? fallbackAgent ?? (hasLiveDynamicTitle ? undefined : labelAgent);

  // Agent brand is optional: icon stays (callers), name can be hidden to save space.
  // When hidden, primary is empty so OSC (if any) is shown without a ` | ` separator.
  const nonAgentPrimary =
    (shouldPreferBaseTitleOverDynamic(dynamicTitle, dynamicTitleIsVersion, toolbarAgent)
      ? baseTitle
      : dynamicTitle) ??
    baseTitle ??
    "";
  const primaryTitle = toolbarAgent
    ? showAgentName !== false
      ? toolbarAgent.label
      : ""
    : nonAgentPrimary;

  // Redundancy filter still knows the agent brand even when name is hidden,
  // so bare OSC "claude" does not replace the icon-only brand identity.
  const oscFilterPrimary =
    toolbarAgent && showAgentName === false ? toolbarAgent.label : primaryTitle;

  const oscSuffix =
    suppressOscTitle === true
      ? ""
      : resolveDisplayOscTitle(oscTitle, {
          autoDisplayTitle: oscFilterPrimary,
          dynamicTitle,
          toolbarAgent,
        });

  return {
    toolbarAgent,
    primaryTitle,
    oscSuffix,
    displayTitle: appendNativeOscTitle(primaryTitle, oscTitle, suppressOscTitle === true, {
      autoDisplayTitle: oscFilterPrimary,
      dynamicTitle,
      toolbarAgent,
    }),
  };
}
