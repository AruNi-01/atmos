const RUNTIME_TOKENS = new Set([
  "node",
  "nodejs",
  "python",
  "python3",
  "java",
  "ruby",
  "php",
  "perl",
  "deno",
  "bun",
  "tsx",
  "ts-node",
]);

/** Last path segment plus following non-path args, for the Local Services row. */
export function localServiceCommandLabel(commandPreview: string): string | null {
  const original = commandPreview.trim();
  if (!original) return null;

  const tokens = original.split(/\s+/).map(stripQuotes).filter(Boolean);
  if (tokens.length === 0) return null;

  const pathIndex = tokens.findIndex(looksLikePath);
  if (pathIndex >= 0) {
    const base = pathBasename(tokens[pathIndex]);
    if (!base) return null;
    const trailing: string[] = [];
    for (const token of tokens.slice(pathIndex + 1)) {
      if (looksLikePath(token)) break;
      trailing.push(token);
    }
    return [base, ...trailing].join(" ");
  }

  // Process titles such as `next-server (v16.3.0)` keep their spaces. Only drop a
  // leading runtime when the remainder looks like a real argument, not `(v1.2.3)`.
  if (shouldStripLeadingRuntime(tokens)) {
    return tokens.slice(1).join(" ");
  }
  return original;
}

/** Full launch command when present; otherwise the launch directory shown before. */
export function localServiceCommandTooltip(
  commandPreview: string,
  launchDirDisplay?: string | null,
  commandPath?: string | null,
): string {
  const path = commandPath?.trim() ?? "";
  if (path) return path;
  const command = commandPreview.trim();
  const launchDir = launchDirDisplay?.trim() ?? "";
  if (commandHasFilesystemPath(command)) return command;
  if (launchDir) return launchDir;
  return command;
}

function commandHasFilesystemPath(commandPreview: string): boolean {
  return commandPreview
    .trim()
    .split(/\s+/)
    .map(stripQuotes)
    .some(looksLikePath);
}

function shouldStripLeadingRuntime(tokens: string[]): boolean {
  if (tokens.length < 2) return false;
  if (!RUNTIME_TOKENS.has(tokens[0].toLowerCase())) return false;
  const rest = tokens.slice(1).join(" ");
  return !isParentheticalVersion(rest);
}

function isParentheticalVersion(value: string): boolean {
  return /^\(v?\d[\w.+-]*\)$/i.test(value);
}

function stripQuotes(token: string): string {
  return token.replace(/^['"]+|['"]+$/g, "");
}

function looksLikePath(token: string): boolean {
  if (token.startsWith("-")) return false;
  return token.startsWith("~") || token.includes("/") || token.includes("\\");
}

function pathBasename(token: string): string {
  const normalized = token.replace(/\\/g, "/").replace(/\/+$/, "");
  const slash = normalized.lastIndexOf("/");
  return slash === -1 ? normalized : normalized.slice(slash + 1);
}
