"use client";

import type { ILink, ILinkProvider, Terminal as XTerm } from "@xterm/xterm";

import { fsApi } from "@/api/ws-api";
import {
  isSupportedExternalProtocol,
  resolveExternalUrl,
} from "@/lib/desktop-external-url";

type LinkRoutingContext = {
  projectRootPath?: string;
};

type TerminalLinkMatch = {
  text: string;
  startIndex: number;
  endIndex: number;
};

type ResolvedFileLink = {
  type: "file";
  path: string;
  line?: number;
  column?: number;
};

type ResolvedDirectoryLink = {
  type: "directory";
  path: string;
};

type ResolvedExternalLink = {
  type: "external";
  url: string;
};

export type ResolvedTerminalLink =
  | ResolvedFileLink
  | ResolvedDirectoryLink
  | ResolvedExternalLink
  | null;

export type TerminalLinkContext = LinkRoutingContext;

const TOKEN_REGEX = /[^\s"'`<>|]+/g;
const TRAILING_PUNCTUATION = new Set([".", ",", ";", "!", "?"]);
const LEADING_WRAPPERS = new Set(["(", "[", "{", "\"", "'"]);
const TRAILING_WRAPPERS = new Set(["]", "}", "\"", "'"]);
const EXPLICIT_EXTERNAL_PROTOCOL_REGEX = /^(https?:\/\/|mailto:|tel:)/i;

function resolveSupportedExternalUrl(rawText: string): URL | null {
  if (!EXPLICIT_EXTERNAL_PROTOCOL_REGEX.test(rawText)) {
    return null;
  }

  const resolvedUrl = resolveExternalUrl(rawText);
  if (!resolvedUrl || !isSupportedExternalProtocol(resolvedUrl.protocol)) {
    return null;
  }

  return resolvedUrl;
}

function toForwardSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

function detectSeparator(path: string): "/" | "\\" {
  return path.includes("\\") ? "\\" : "/";
}

function isWindowsAbsolutePath(path: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(path);
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || isWindowsAbsolutePath(path);
}

function stripTokenWrappers(raw: string, start: number, end: number): TerminalLinkMatch | null {
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

  return {
    text: nextText,
    startIndex: nextStart,
    endIndex: nextEnd,
  };
}

function splitLocationSuffix(raw: string): {
  pathText: string;
  line?: number;
  column?: number;
} {
  const tupleMatch = raw.match(/^(.*)\((\d+),(\d+)\)$/);
  if (tupleMatch) {
    return {
      pathText: tupleMatch[1],
      line: Number(tupleMatch[2]),
      column: Number(tupleMatch[3]),
    };
  }

  const locationMatch = raw.match(/^(.*?)(?::(\d+))(?::(\d+))?$/);
  if (!locationMatch) {
    return { pathText: raw };
  }

  const pathText = locationMatch[1];
  const line = Number(locationMatch[2]);
  const column = locationMatch[3] ? Number(locationMatch[3]) : undefined;

  if (!Number.isFinite(line)) {
    return { pathText: raw };
  }

  return {
    pathText,
    line,
    column,
  };
}

function hasFileLikeShape(pathText: string, hasLocation: boolean): boolean {
  if (!pathText) return false;
  if (pathText.startsWith("file://")) return true;
  if (pathText.startsWith("~/") || pathText.startsWith("./") || pathText.startsWith("../")) return true;
  if (isAbsolutePath(pathText)) return true;
  if (pathText.includes("/")) return true;
  if (pathText.includes("\\")) return true;
  if (hasLocation && /^[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+$/.test(pathText)) return true;
  return false;
}

function normalizePath(path: string): string {
  const separator = detectSeparator(path);
  const normalizedInput = separator === "\\" ? path.replace(/\//g, "\\") : toForwardSlashes(path);
  const prefixMatch = normalizedInput.match(/^[a-zA-Z]:\\/);
  const prefix = prefixMatch ? prefixMatch[0] : normalizedInput.startsWith("/") ? "/" : "";
  const remainder = prefix ? normalizedInput.slice(prefix.length) : normalizedInput;
  const rawParts = remainder.split(separator);
  const parts: string[] = [];

  for (const part of rawParts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length > 0 && parts[parts.length - 1] !== "..") {
        parts.pop();
      } else if (!prefix) {
        parts.push(part);
      }
      continue;
    }
    parts.push(part);
  }

  if (!prefix) {
    return parts.join(separator) || ".";
  }

  const joined = parts.join(separator);
  return joined ? `${prefix}${joined}` : prefix;
}

function joinPaths(basePath: string, relativePath: string): string {
  const separator = detectSeparator(basePath);
  const base = normalizePath(basePath);
  const relative = separator === "\\" ? relativePath.replace(/\//g, "\\") : toForwardSlashes(relativePath);
  const trimmedBase = base.endsWith(separator) ? base.slice(0, -1) : base;
  return normalizePath(`${trimmedBase}${separator}${relative}`);
}

function isWithinRoot(path: string, root: string): boolean {
  const normalizedPath = toForwardSlashes(normalizePath(path));
  const normalizedRoot = toForwardSlashes(normalizePath(root));

  if (normalizedPath === normalizedRoot) return true;

  const rootWithSlash = normalizedRoot.endsWith("/")
    ? normalizedRoot
    : `${normalizedRoot}/`;

  return normalizedPath.startsWith(rootWithSlash);
}

async function resolveHomeRelativePath(pathText: string): Promise<string | null> {
  if (!pathText.startsWith("~/")) return null;
  const homeDir = await fsApi.getHomeDir();
  return joinPaths(homeDir, pathText.slice(2));
}

async function resolveInternalPath(
  pathText: string,
  context: LinkRoutingContext,
): Promise<ResolvedFileLink | ResolvedDirectoryLink | null> {
  const roots = [context.projectRootPath].filter(Boolean) as string[];
  if (roots.length === 0 && !isAbsolutePath(pathText) && !pathText.startsWith("~/")) {
    return null;
  }

  const candidatePaths: string[] = [];

  if (pathText.startsWith("~/")) {
    const resolvedHome = await resolveHomeRelativePath(pathText);
    if (resolvedHome) {
      candidatePaths.push(resolvedHome);
    }
  } else if (pathText.startsWith("file://")) {
    try {
      const fileUrl = new URL(pathText);
      if (fileUrl.protocol === "file:") {
        candidatePaths.push(normalizePath(decodeURIComponent(fileUrl.pathname)));
      }
    } catch {
      return null;
    }
  } else if (isAbsolutePath(pathText)) {
    candidatePaths.push(normalizePath(pathText));
  } else {
    for (const root of roots) {
      candidatePaths.push(joinPaths(root, pathText));
    }
  }

  for (const candidatePath of candidatePaths) {
    const withinScope =
      roots.length === 0 || roots.some((root) => isWithinRoot(candidatePath, root));
    if (!withinScope) continue;

    try {
      const result = await fsApi.readFile(candidatePath);
      if (result.exists && result.content !== null) {
        return {
          type: "file",
          path: candidatePath,
        };
      }
    } catch {
      // Ignore lookup failures and keep trying fallbacks.
    }

    try {
      await fsApi.listDir(candidatePath, { showHidden: true, dirsOnly: false });
      return {
        type: "directory",
        path: candidatePath,
      };
    } catch {
      // Ignore lookup failures and keep trying fallbacks.
    }
  }

  return null;
}

function collectCandidateTokens(line: string): TerminalLinkMatch[] {
  const matches: TerminalLinkMatch[] = [];
  const regex = new RegExp(TOKEN_REGEX.source, "g");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    const next = stripTokenWrappers(match[0], match.index, match.index + match[0].length);
    if (next) {
      matches.push(next);
    }
  }

  return matches;
}

export async function resolveTerminalLink(
  rawText: string,
  context: LinkRoutingContext,
): Promise<ResolvedTerminalLink> {
  const sanitized = stripTokenWrappers(rawText.trim(), 0, rawText.trim().length);
  const text = sanitized?.text ?? rawText.trim();
  if (!text) return null;

  const resolvedUrl = resolveSupportedExternalUrl(text);
  if (resolvedUrl) {
    return {
      type: "external",
      url: resolvedUrl.toString(),
    };
  }

  const { pathText, line, column } = splitLocationSuffix(text);
  const hasLocation = line !== undefined || column !== undefined;
  if (!hasFileLikeShape(pathText, hasLocation)) {
    return null;
  }

  const resolvedPath = await resolveInternalPath(pathText, context);
  if (!resolvedPath) {
    return null;
  }

  if (resolvedPath.type === "directory") {
    return resolvedPath;
  }

  return {
    type: "file",
    path: resolvedPath.path,
    line,
    column,
  };
}

function canResolveTokenAsLink(rawText: string): boolean {
  const sanitized = stripTokenWrappers(rawText.trim(), 0, rawText.trim().length);
  const text = sanitized?.text ?? rawText.trim();
  if (!text) return false;

  const resolvedUrl = resolveSupportedExternalUrl(text);
  if (resolvedUrl) {
    return true;
  }

  const { pathText, line, column } = splitLocationSuffix(text);
  return hasFileLikeShape(pathText, line !== undefined || column !== undefined);
}

export function createTerminalLinkProvider(
  terminal: XTerm,
  context: LinkRoutingContext,
  activate: (event: MouseEvent, target: ResolvedTerminalLink) => void,
): ILinkProvider {
  return {
    provideLinks(bufferLineNumber, callback) {
      const line = terminal.buffer.active.getLine(bufferLineNumber - 1)?.translateToString(true) ?? "";
      if (!line) {
        callback(undefined);
        return;
      }

      const links: ILink[] = [];
      for (const candidate of collectCandidateTokens(line)) {
        if (!canResolveTokenAsLink(candidate.text)) {
          continue;
        }

        links.push({
          text: candidate.text,
          range: {
            start: { x: candidate.startIndex + 1, y: bufferLineNumber },
            end: { x: candidate.endIndex, y: bufferLineNumber },
          },
          activate(event) {
            void (async () => {
              const resolved = await resolveTerminalLink(candidate.text, context);
              if (resolved) {
                activate(event, resolved);
              }
            })();
          },
          decorations: {
            pointerCursor: true,
            underline: true,
          },
        });
      }

      callback(links.length > 0 ? links : undefined);
    },
  };
}

export async function resolveTerminalLinkAtCell(
  terminal: XTerm,
  bufferLineNumber: number,
  column: number,
  context: LinkRoutingContext,
): Promise<ResolvedTerminalLink> {
  const line = terminal.buffer.active.getLine(bufferLineNumber - 1)?.translateToString(true) ?? "";
  if (!line) {
    return null;
  }

  for (const candidate of collectCandidateTokens(line)) {
    const startColumn = candidate.startIndex + 1;
    const endColumn = candidate.endIndex;
    if (column < startColumn || column > endColumn) {
      continue;
    }

    return resolveTerminalLink(candidate.text, context);
  }

  return null;
}
