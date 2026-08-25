/** Last path segment plus following non-path args, for the Local Services row. */
export function localServiceCommandLabel(commandPreview: string): string | null {
  const tokens = commandPreview
    .trim()
    .split(/\s+/)
    .map(stripQuotes)
    .filter(Boolean);
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

  return tokens.length > 1 ? tokens.slice(1).join(" ") : tokens[0];
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
