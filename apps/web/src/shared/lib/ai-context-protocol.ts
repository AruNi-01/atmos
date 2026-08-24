/**
 * Unified AI context clipboard → Composer chip protocol.
 *
 * Clipboard shape (first line is the protocol marker):
 * ```
 * atmos://context/{kind}
 * {exact prompt body sent to the agent}
 * ```
 *
 * Chips serialize as short tokens `[#ctx:{kind}:{id}]`. The body lives in an
 * in-memory registry so multi-line markdown never has to sit inside data-token.
 * On send, tokens expand back to the exact body (protocol line is never sent).
 */

export const AI_CONTEXT_PROTOCOL_PREFIX = "atmos://context/";
export const AI_CONTEXT_TOKEN_PREFIX = "[#ctx:";

export const AI_CONTEXT_KINDS = [
  "code-selection",
  "diff-selection",
  "wiki-selection",
  "preview-element",
  "terminal-selection",
  "diff-prompt-stash",
  "agent-fix",
  "review-run",
  "git-conflict",
  "canvas-agent",
  "pt-design-agent",
  "run-log",
] as const;

export type AiContextKind = (typeof AI_CONTEXT_KINDS)[number];

export type AiContextChipTone =
  | "violet"
  | "blue"
  | "amber"
  | "emerald"
  | "cyan"
  | "rose"
  | "orange"
  | "slate"
  | "indigo"
  | "fuchsia";

export type AiContextChipIcon =
  | "code"
  | "diff"
  | "book"
  | "mouse-pointer-click"
  | "terminal"
  | "layers"
  | "wrench"
  | "scan"
  | "git-merge"
  | "layout";

export type AiContextPayload = {
  kind: AiContextKind;
  promptText: string;
};

export type AiContextChipPresentation = {
  kind: AiContextKind;
  label: string;
  tooltip: string;
  tone: AiContextChipTone;
  icon: AiContextChipIcon;
};

const KIND_SET = new Set<string>(AI_CONTEXT_KINDS);
const PAYLOADS = new Map<string, AiContextPayload>();

const KIND_DEFAULTS: Record<
  AiContextKind,
  { label: string; tooltip: string; tone: AiContextChipTone; icon: AiContextChipIcon }
> = {
  "code-selection": {
    label: "Code",
    tooltip: "Code selection",
    tone: "blue",
    icon: "code",
  },
  "diff-selection": {
    label: "Diff",
    tooltip: "Diff selection",
    tone: "amber",
    icon: "diff",
  },
  "wiki-selection": {
    label: "Wiki",
    tooltip: "Wiki selection",
    tone: "indigo",
    icon: "book",
  },
  "preview-element": {
    label: "Element",
    tooltip: "Browser element selection",
    tone: "violet",
    icon: "mouse-pointer-click",
  },
  "terminal-selection": {
    label: "Terminal",
    tooltip: "Terminal selection",
    tone: "emerald",
    icon: "terminal",
  },
  "diff-prompt-stash": {
    label: "Diff stash",
    tooltip: "Stashed diff comments",
    tone: "orange",
    icon: "layers",
  },
  "agent-fix": {
    label: "Agent Fix",
    tooltip: "Agent Fix prompt",
    tone: "rose",
    icon: "wrench",
  },
  "review-run": {
    label: "Review",
    tooltip: "Code review prompt",
    tone: "cyan",
    icon: "scan",
  },
  "git-conflict": {
    label: "Conflict",
    tooltip: "Merge conflict prompt",
    tone: "fuchsia",
    icon: "git-merge",
  },
  "canvas-agent": {
    label: "Canvas",
    tooltip: "Canvas agent instructions",
    tone: "slate",
    icon: "layout",
  },
  "pt-design-agent": {
    label: "Prototype",
    tooltip: "Prototype Design agent instructions",
    tone: "violet",
    icon: "layout",
  },
  "run-log": {
    label: "Run log",
    tooltip: "Atmos Run log",
    // Align with slash menu (ScrollText / emerald) and Run product surface.
    tone: "emerald",
    icon: "terminal",
  },
};

export function isAiContextKind(value: string): value is AiContextKind {
  return KIND_SET.has(value);
}

export function formatAiContextProtocolUrl(kind: AiContextKind): string {
  return `${AI_CONTEXT_PROTOCOL_PREFIX}${kind}`;
}

export function wrapAiContextClipboard(kind: AiContextKind, promptText: string): string {
  const body = normalizeNewlines(promptText).trimEnd();
  if (!body) return body;
  const header = formatAiContextProtocolUrl(kind);
  if (body === header || body.startsWith(`${header}\n`)) {
    return body;
  }
  // Re-wrap if a different / stale protocol header is present.
  const stripped = stripProtocolHeader(body);
  return `${header}\n${stripped}`;
}

export function parseAiContextProtocol(text: string): AiContextPayload | null {
  const normalized = normalizeNewlines(text).trim();
  if (!normalized) return null;

  const firstLineEnd = normalized.indexOf("\n");
  const firstLine = (firstLineEnd === -1 ? normalized : normalized.slice(0, firstLineEnd)).trim();
  const rest = firstLineEnd === -1 ? "" : normalized.slice(firstLineEnd + 1).trimEnd();

  if (!firstLine.startsWith(AI_CONTEXT_PROTOCOL_PREFIX)) return null;
  const kind = firstLine.slice(AI_CONTEXT_PROTOCOL_PREFIX.length);
  if (!isAiContextKind(kind)) return null;
  if (!rest.trim()) return null;
  return { kind, promptText: rest.trimEnd() };
}

export function registerAiContextPrompt(kind: AiContextKind, promptText: string): string {
  const body = normalizeNewlines(promptText).trimEnd();
  const id = createOpaqueId();
  PAYLOADS.set(id, { kind, promptText: body });
  return formatAiContextToken(kind, id);
}

export function resolveAiContextPrompt(tokenOrId: string): AiContextPayload | null {
  const parsed = parseAiContextToken(tokenOrId);
  if (parsed) return PAYLOADS.get(parsed.id) ?? null;
  return PAYLOADS.get(tokenOrId) ?? null;
}

export function formatAiContextToken(kind: AiContextKind, id: string): string {
  return `${AI_CONTEXT_TOKEN_PREFIX}${kind}:${id}]`;
}

export function parseAiContextToken(
  token: string,
): { kind: AiContextKind; id: string } | null {
  if (!token.startsWith(AI_CONTEXT_TOKEN_PREFIX) || !token.endsWith("]")) {
    return null;
  }
  const inner = token.slice(AI_CONTEXT_TOKEN_PREFIX.length, -1);
  const colon = inner.indexOf(":");
  if (colon <= 0) return null;
  const kind = inner.slice(0, colon);
  const id = inner.slice(colon + 1);
  if (!isAiContextKind(kind)) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  return { kind, id };
}

/** Match any registered context chip token. */
export const AI_CONTEXT_TOKEN_PATTERN =
  /\[#ctx:([a-z0-9-]+):([a-zA-Z0-9_-]+)\]/g;

export function expandAiContextTokens(text: string): string {
  return text.replace(AI_CONTEXT_TOKEN_PATTERN, (match, kind: string, id: string) => {
    if (!isAiContextKind(kind)) return match;
    const payload = PAYLOADS.get(id);
    if (!payload || payload.kind !== kind) {
      // Still expand if id exists under a different registration edge case.
      return payload?.promptText ?? match;
    }
    return payload.promptText;
  });
}

/**
 * Expand chip tokens and unwrap a whole-string protocol envelope so the agent
 * never sees `atmos://context/...` headers (e.g. plain-textarea paste).
 */
export function materializeAiContextText(text: string): string {
  const expanded = expandAiContextTokens(text);
  const whole = parseAiContextProtocol(expanded);
  if (whole) return whole.promptText;
  return expanded;
}

export function presentAiContextChip(
  kind: AiContextKind,
  promptText: string,
): AiContextChipPresentation {
  const defaults = KIND_DEFAULTS[kind];
  return {
    kind,
    label: deriveChipLabel(kind, promptText) || defaults.label,
    tooltip: deriveChipTooltip(kind, promptText) || defaults.tooltip,
    tone: defaults.tone,
    icon: defaults.icon,
  };
}

/** Map SelectionPopover type → protocol kind. */
export function selectionTypeToAiContextKind(
  type: "editor" | "diff" | "wiki" | "preview",
): AiContextKind {
  switch (type) {
    case "editor":
      return "code-selection";
    case "diff":
      return "diff-selection";
    case "wiki":
      return "wiki-selection";
    case "preview":
      return "preview-element";
  }
}

/** Prefer a more specific kind for Agent Fix clipboard chips. */
export function agentFixSourceToAiContextKind(source: {
  id: string;
  family: string;
}): AiContextKind {
  if (source.id.startsWith("diff-stashed:")) return "diff-prompt-stash";
  if (source.family === "diff") return "diff-selection";
  if (source.family === "review_session" || source.family === "pr_review") {
    return "review-run";
  }
  return "agent-fix";
}

/** Test-only: clear the in-memory payload registry. */
export function __resetAiContextPayloadsForTests(): void {
  PAYLOADS.clear();
}

function deriveChipLabel(kind: AiContextKind, promptText: string): string | null {
  switch (kind) {
    case "code-selection":
    case "diff-selection": {
      const file = matchField(promptText, ["File", "文件"]);
      if (file) {
        const base = file.split("/").pop() || file;
        const lines = matchField(promptText, ["Lines", "行"]);
        return lines ? truncateLabel(`${base}:${lines}`, 32) : truncateLabel(base, 28);
      }
      return null;
    }
    case "wiki-selection": {
      const page = matchField(promptText, ["Wiki page", "Wiki 页面", "页面"]);
      if (page) {
        const base = page.split("/").pop() || page;
        return truncateLabel(base, 28);
      }
      return null;
    }
    case "preview-element": {
      const selector = matchField(promptText, ["Selector", "选择器"]);
      if (selector) return truncateLabel(selector, 28);
      const tag = matchField(promptText, ["Tag", "标签"]);
      if (tag) return truncateLabel(tag, 28);
      return null;
    }
    case "terminal-selection": {
      const first = firstNonEmptyLine(promptText);
      return first ? truncateLabel(first.replace(/\s+/g, " "), 28) : null;
    }
    case "diff-prompt-stash": {
      const count = (promptText.match(/^# Comment \d+/gm) ?? []).length;
      if (count > 0) return `Diff ×${count}`;
      return null;
    }
    case "agent-fix":
    case "review-run":
    case "git-conflict":
    case "canvas-agent":
    case "pt-design-agent": {
      const heading = promptText.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim();
      return heading ? truncateLabel(heading, 28) : null;
    }
    case "run-log":
      // Keep stable product label; do not derive from path/prompt first line.
      return null;
  }
}

function deriveChipTooltip(kind: AiContextKind, promptText: string): string | null {
  switch (kind) {
    case "code-selection":
    case "diff-selection":
      return matchField(promptText, ["File", "文件"]);
    case "wiki-selection":
      return matchField(promptText, ["Wiki page", "Wiki 页面", "页面"]);
    case "preview-element":
      return (
        matchField(promptText, ["Selector", "选择器"]) ||
        matchField(promptText, ["Page", "页面"])
      );
    case "terminal-selection": {
      const first = firstNonEmptyLine(promptText);
      return first ? truncateLabel(first.replace(/\s+/g, " "), 120) : null;
    }
    case "run-log": {
      // Prefer the log path line when present for hover detail.
      const pathLine = promptText
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.toLowerCase().startsWith("log path:"));
      if (pathLine) {
        return truncateLabel(pathLine.replace(/^log path:\s*/i, ""), 120);
      }
      return "Atmos Run log";
    }
    default: {
      const first = firstNonEmptyLine(promptText);
      return first ? truncateLabel(first, 120) : null;
    }
  }
}

function matchField(promptText: string, labels: string[]): string | null {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = promptText.match(
      new RegExp(`\\*\\*${escaped}\\*\\*:\\s*\`([^\`]+)\``),
    );
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

function firstNonEmptyLine(promptText: string): string | null {
  for (const line of promptText.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) return trimmed;
  }
  return null;
}

function stripProtocolHeader(body: string): string {
  const firstLineEnd = body.indexOf("\n");
  const firstLine = (firstLineEnd === -1 ? body : body.slice(0, firstLineEnd)).trim();
  if (firstLine.startsWith(AI_CONTEXT_PROTOCOL_PREFIX) || firstLine.startsWith("atmos://")) {
    return firstLineEnd === -1 ? "" : body.slice(firstLineEnd + 1).trimEnd();
  }
  return body;
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function createOpaqueId(): string {
  const globalCrypto = globalThis.crypto;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID().replace(/-/g, "").slice(0, 16);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function truncateLabel(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
