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

