export type TerminalPathToken = {
  text: string;
  startIndex: number;
  endIndex: number;
};

const TOKEN_REGEX = /[^\s"'`<>|]+/g;
const TRAILING_PUNCTUATION = new Set([".", ",", ";", "!", "?"]);
const LEADING_WRAPPERS = new Set(["(", "[", "{", "\"", "'"]);
const TRAILING_WRAPPERS = new Set(["]", "}", "\"", "'"]);

export function extractTerminalPathTokens(line: string): TerminalPathToken[] {
  const matches: TerminalPathToken[] = [];
  for (const match of line.matchAll(TOKEN_REGEX)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const token = stripTokenWrappers(raw, start, start + raw.length);
    if (token && hasFileLikeShape(token.text)) {
      matches.push(token);
    }
  }
  return matches;
}

function stripTokenWrappers(raw: string, start: number, end: number): TerminalPathToken | null {
  let nextText = raw;
  let nextStart = start;
  let nextEnd = end;

  while (nextText.length > 0 && LEADING_WRAPPERS.has(nextText[0])) {
    nextText = nextText.slice(1);
    nextStart += 1;
  }

  while (nextText.length > 0) {
    const lastChar = nextText[nextText.length - 1];
    if (TRAILING_PUNCTUATION.has(lastChar) || TRAILING_WRAPPERS.has(lastChar)) {
      nextText = nextText.slice(0, -1);
      nextEnd -= 1;
      continue;
    }
    if (lastChar === ")" && !/\(\d+(?:,\d+)?\)$/.test(nextText)) {
      nextText = nextText.slice(0, -1);
      nextEnd -= 1;
      continue;
    }
    break;
  }

  if (!nextText) return null;
  return { text: nextText, startIndex: nextStart, endIndex: nextEnd };
}

function hasFileLikeShape(pathText: string): boolean {
  if (!pathText) return false;
  if (pathText.startsWith("file://")) return true;
  if (pathText.startsWith("~/") || pathText.startsWith("./") || pathText.startsWith("../")) return true;
  if (pathText.startsWith("/")) return true;
  if (/^[a-zA-Z]:[\\/]/.test(pathText)) return true;
  if (pathText.includes("/") || pathText.includes("\\")) return true;
  return /[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+(?::\d+)?(?::\d+)?$/.test(pathText);
}

