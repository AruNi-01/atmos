"use client";

/**
 * Agent code highlighting — beUI agent-code primitives.
 * Vendored from https://beui.dev/components/agents/file-diff (agent-code)
 * Author: Saurabh / beUI (copy-paste free component).
 * Adapted for @workspace/ui import paths; langs expanded for Atmos file tools.
 */

import {
  Fragment,
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import { createHighlighter, type Highlighter } from "shiki";
import { cn } from "../../lib/utils";

export type AgentCodeLanguage =
  | "bash"
  | "c"
  | "cpp"
  | "css"
  | "diff"
  | "dockerfile"
  | "go"
  | "html"
  | "java"
  | "javascript"
  | "json"
  | "jsx"
  | "markdown"
  | "python"
  | "rust"
  | "sql"
  | "text"
  | "toml"
  | "tsx"
  | "typescript"
  | "yaml";

export interface AgentCodeToken {
  content: string;
  offset: number;
  light?: string;
  dark?: string;
}

export type AgentCodeTokenLines = AgentCodeToken[][];

export interface AgentCodeProps {
  code: string;
  language?: AgentCodeLanguage;
  className?: string;
}

export interface AgentCodeLineProps {
  code: string;
  tokens?: AgentCodeToken[];
  className?: string;
}

const LIGHT_THEME = "github-light-high-contrast";
const DARK_THEME = "github-dark-high-contrast";
const AGENT_CODE_LANGS: AgentCodeLanguage[] = [
  "bash",
  "c",
  "cpp",
  "css",
  "diff",
  "dockerfile",
  "go",
  "html",
  "java",
  "javascript",
  "json",
  "jsx",
  "markdown",
  "python",
  "rust",
  "sql",
  "toml",
  "tsx",
  "typescript",
  "yaml",
];

let agentCodeHighlighter: Promise<Highlighter> | null = null;
const tokenCache = new Map<string, AgentCodeTokenLines>();

function getAgentCodeHighlighter() {
  if (!agentCodeHighlighter) {
    agentCodeHighlighter = createHighlighter({
      themes: [LIGHT_THEME, DARK_THEME],
      langs: AGENT_CODE_LANGS.filter((lang) => lang !== "text"),
    });
  }
  return agentCodeHighlighter;
}

function tokenCacheKey(code: string, language: AgentCodeLanguage) {
  return `${language}\u0000${code}`;
}

export function resolveAgentCodeLanguage(language?: string | null): AgentCodeLanguage {
  const raw = (language ?? "text").toLowerCase();
  const aliases: Record<string, AgentCodeLanguage> = {
    sh: "bash",
    shell: "bash",
    shellscript: "bash",
    zsh: "bash",
    js: "javascript",
    ts: "typescript",
    py: "python",
    rs: "rust",
    md: "markdown",
    yml: "yaml",
    plaintext: "text",
    txt: "text",
    "c++": "cpp",
  };
  const mapped = aliases[raw] ?? (raw as AgentCodeLanguage);
  if (mapped === "text") return "text";
  return AGENT_CODE_LANGS.includes(mapped) ? mapped : "text";
}

export function useAgentCodeTokens(
  code: string,
  language: AgentCodeLanguage,
) {
  const key = tokenCacheKey(code, language);
  const cached = tokenCache.get(key);
  const [result, setResult] = useState<{
    key: string;
    code: string;
    language: AgentCodeLanguage;
    lines: AgentCodeTokenLines;
  } | null>(cached ? { key, code, language, lines: cached } : null);

  useEffect(() => {
    if (language === "text" || !code) {
      setResult({ key, code, language, lines: [] });
      return;
    }

    const current = tokenCache.get(key);
    if (current) {
      setResult({ key, code, language, lines: current });
      return;
    }

    let cancelled = false;
    getAgentCodeHighlighter()
      .then((highlighter) => {
        if (cancelled) return;
        const lines = highlighter
          .codeToTokensWithThemes(code, {
            lang: language,
            themes: {
              light: LIGHT_THEME,
              dark: DARK_THEME,
            },
          })
          .map((line) =>
            line.map((token) => ({
              content: token.content,
              offset: token.offset,
              light: token.variants.light?.color,
              dark: token.variants.dark?.color,
            })),
          );
        tokenCache.set(key, lines);
        setResult({ key, code, language, lines });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, code, language, lines: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [code, key, language]);

  if (result?.key === key) return result.lines.length > 0 ? result.lines : null;
  if (result?.language === language && code.startsWith(result.code)) {
    return result.lines.length > 0 ? result.lines : null;
  }
  return null;
}

export function AgentCodeLine({
  code,
  tokens,
  className,
}: AgentCodeLineProps) {
  return (
    <span className={className}>
      {tokens
        ? tokens.map((token) => (
            <span
              key={`${token.offset}-${token.content}`}
              style={
                {
                  "--agent-code-light": token.light ?? "currentColor",
                  "--agent-code-dark": token.dark ?? token.light ?? "currentColor",
                } as CSSProperties
              }
              className="text-[var(--agent-code-light)] dark:text-[var(--agent-code-dark)]"
            >
              {token.content}
            </span>
          ))
        : code}
    </span>
  );
}

export function AgentCode({
  code,
  language = "bash",
  className,
}: AgentCodeProps) {
  const tokens = useAgentCodeTokens(code, language);
  let offset = 0;
  const lines = code.split("\n").map((content) => {
    const line = { content, offset };
    offset += content.length + 1;
    return line;
  });

  return (
    <pre
      className={cn(
        "m-0 overflow-x-auto whitespace-pre font-mono text-xs leading-5 text-foreground/85",
        className,
      )}
    >
      <code>
        {lines.map((line, index) => (
          <Fragment key={line.offset}>
            <AgentCodeLine code={line.content} tokens={tokens?.[index]} />
            {index < lines.length - 1 ? "\n" : null}
          </Fragment>
        ))}
      </code>
    </pre>
  );
}
