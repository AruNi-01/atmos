import type { TerminalSelectionSnapshot } from "@/features/terminal/types";

export const TERMINAL_SELECTION_PROTOCOL_PREFIX = "atmos://terminal-selection/";
export const SIDE_CHAT_PROTOCOL_PREFIX = "atmos://side-chat/";
export const TERMINAL_SELECTION_MAX_BYTES = 64 * 1024;

const PROTOCOL_ID_PATTERN = /^[a-zA-Z0-9_.:-]+$/;
const ANSI_ESCAPE_PATTERN = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\)|[PX^_][\s\S]*?\x1b\\|[@-Z\\-_])/g;
const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const textEncoder = new TextEncoder();

export type TerminalPromptContext =
  | {
      kind: "terminal_selection";
      contextId: string;
      text: string;
      sourceSessionId?: string | null;
      sourceTmuxWindowName?: string | null;
      selectedAtMs: number;
      lineCount: number;
      byteCount: number;
      truncated: boolean;
    }
  | {
      kind: "terminal_capture";
      contextId: string;
      sourceTmuxWindowName?: string | null;
    };

export function formatTerminalSelectionProtocol(contextId: string): string {
  assertValidContextId(contextId);
  return `${TERMINAL_SELECTION_PROTOCOL_PREFIX}${contextId}`;
}

export function formatSideChatProtocol(contextId: string): string {
  assertValidContextId(contextId);
  return `${SIDE_CHAT_PROTOCOL_PREFIX}${contextId}`;
}

export function parseTerminalSelectionProtocolToken(token: string): { contextId: string } | null {
  return parseProtocolToken(token, TERMINAL_SELECTION_PROTOCOL_PREFIX);
}

export function parseSideChatProtocolToken(token: string): { contextId: string } | null {
  return parseProtocolToken(token, SIDE_CHAT_PROTOCOL_PREFIX);
}

export function createTerminalCaptureContextId(): string {
  return `capture-${createOpaqueId()}`;
}

export function createTerminalSelectionContextFromSnapshot(
  snapshot: TerminalSelectionSnapshot,
): TerminalPromptContext & { kind: "terminal_selection" } {
  const normalized = normalizeTerminalSelectionText(snapshot.text);
  return {
    kind: "terminal_selection",
    contextId: snapshot.id,
    text: normalized.text,
    sourceSessionId: snapshot.sourceSessionId,
    sourceTmuxWindowName: snapshot.sourceTmuxWindowName,
    selectedAtMs: snapshot.selectedAtMs,
    lineCount: normalized.lineCount,
    byteCount: normalized.byteCount,
    truncated: snapshot.truncated || normalized.truncated,
  };
}

export function normalizeTerminalSelectionText(
  value: string,
  maxBytes = TERMINAL_SELECTION_MAX_BYTES,
): {
  text: string;
  lineCount: number;
  byteCount: number;
  truncated: boolean;
} {
  const plain = value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(ANSI_ESCAPE_PATTERN, "")
    .replace(CONTROL_CHAR_PATTERN, "")
    .replace(/^\n+|\n+$/g, "");
  const byteCount = utf8ByteLength(plain);
  const truncatedText = byteCount > maxBytes ? truncateMiddleUtf8(plain, maxBytes) : plain;
  return {
    text: truncatedText,
    lineCount: truncatedText ? truncatedText.split("\n").length : 0,
    byteCount: utf8ByteLength(truncatedText),
    truncated: byteCount > maxBytes,
  };
}

export function extractTerminalSelectionContextIds(text: string): string[] {
  return extractContextIds(text, TERMINAL_SELECTION_PROTOCOL_PREFIX);
}

export function extractSideChatContextIds(text: string): string[] {
  return extractContextIds(text, SIDE_CHAT_PROTOCOL_PREFIX);
}

export function stripTerminalAiProtocolTokens(text: string): string {
  return stripTerminalAiProtocolTokensMatching(text, () => true);
}

export function stripResolvedTerminalAiProtocolTokens(
  text: string,
  contexts: TerminalPromptContext[],
): string {
  const knownContextIds = new Set(contexts.map((context) => context.contextId));
  const knownSelectionContextIds = new Set(
    contexts
      .filter(
        (context): context is TerminalPromptContext & { kind: "terminal_selection" } =>
          context.kind === "terminal_selection",
      )
      .map((context) => context.contextId),
  );

  return stripTerminalAiProtocolTokensMatching(text, (token, prefix) => {
    const parsed = parseProtocolToken(token, prefix);
    if (!parsed) return false;
    if (prefix === TERMINAL_SELECTION_PROTOCOL_PREFIX) {
      return knownSelectionContextIds.has(parsed.contextId);
    }
    return knownContextIds.has(parsed.contextId);
  });
}

export function expandPromptWithTerminalSelectionContexts({
  contexts,
  text,
}: {
  contexts: TerminalPromptContext[];
  text: string;
}): string {
  const selectedContexts = resolveSelectionContextsForText(text, contexts);
  const userPrompt = stripResolvedTerminalAiProtocolTokens(text, contexts);
  if (selectedContexts.length === 0) return userPrompt;

  const contextBlocks = selectedContexts.map(formatSelectedContextBlock);
  if (!userPrompt) return contextBlocks.join("\n\n");
  return [
    ...contextBlocks,
    "User prompt:",
    userPrompt,
  ].join("\n\n");
}

export function resolveSelectionContextsForText(
  text: string,
  contexts: TerminalPromptContext[],
): Array<TerminalPromptContext & { kind: "terminal_selection" }> {
  const ids = new Set(extractTerminalSelectionContextIds(text));
  if (ids.size === 0) return [];
  return contexts.filter(
    (context): context is TerminalPromptContext & { kind: "terminal_selection" } =>
      context.kind === "terminal_selection" && ids.has(context.contextId),
  );
}

export function formatSelectedContextBlock(
  context: TerminalPromptContext & { kind: "terminal_selection" },
): string {
  const source = context.sourceTmuxWindowName?.trim() || "unknown";
  return [
    "The user selected this terminal text as context:",
    "",
    `Source terminal: ${source}`,
    `Selected lines: ${context.lineCount}`,
    `Selected bytes: ${context.byteCount}`,
    `Selection was truncated: ${context.truncated ? "yes" : "no"}`,
    "",
    "```text",
    context.text,
    "```",
  ].join("\n");
}

export function hasKnownSideChatCommand(
  text: string,
  contexts: TerminalPromptContext[],
): boolean {
  const knownContextIds = new Set(contexts.map((context) => context.contextId));
  return extractSideChatContextIds(text).some((id) => knownContextIds.has(id));
}

export function createOpaqueId(): string {
  const globalCrypto = globalThis.crypto;
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseProtocolToken(token: string, prefix: string): { contextId: string } | null {
  if (!token.startsWith(prefix)) return null;
  const contextId = token.slice(prefix.length);
  if (!isValidContextId(contextId)) return null;
  return { contextId };
}

function extractContextIds(text: string, prefix: string): string[] {
  const matches = text.match(protocolTokenRegex(prefix)) ?? [];
  const ids: string[] = [];
  for (const token of matches) {
    const parsed = parseProtocolToken(token, prefix);
    if (parsed) ids.push(parsed.contextId);
  }
  return ids;
}

function stripTerminalAiProtocolTokensMatching(
  text: string,
  shouldStrip: (token: string, prefix: string) => boolean,
): string {
  return text
    .replace(protocolTokenRegex(TERMINAL_SELECTION_PROTOCOL_PREFIX), (token) =>
      shouldStrip(token, TERMINAL_SELECTION_PROTOCOL_PREFIX) ? " " : token,
    )
    .replace(protocolTokenRegex(SIDE_CHAT_PROTOCOL_PREFIX), (token) =>
      shouldStrip(token, SIDE_CHAT_PROTOCOL_PREFIX) ? " " : token,
    )
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function protocolTokenRegex(prefix: string): RegExp {
  return new RegExp(`${escapeRegExp(prefix)}[a-zA-Z0-9_.:-]+`, "g");
}

function assertValidContextId(contextId: string): void {
  if (!isValidContextId(contextId)) {
    throw new Error("Invalid terminal AI context id");
  }
}

function isValidContextId(contextId: string): boolean {
  return contextId.length > 0 && contextId.length <= 120 && PROTOCOL_ID_PATTERN.test(contextId);
}

function utf8ByteLength(value: string): number {
  return textEncoder.encode(value).length;
}

function truncateMiddleUtf8(value: string, maxBytes: number): string {
  const marker = "\n\n[... selected terminal text omitted ...]\n\n";
  const markerBytes = utf8ByteLength(marker);
  if (maxBytes <= markerBytes + 2) {
    return takeStartByBytes(value, maxBytes);
  }

  const contentBudget = maxBytes - markerBytes;
  const headBudget = Math.floor(contentBudget / 2);
  const tailBudget = contentBudget - headBudget;
  return `${takeStartByBytes(value, headBudget)}${marker}${takeEndByBytes(value, tailBudget)}`;
}

function takeStartByBytes(value: string, maxBytes: number): string {
  let low = 0;
  let high = value.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (utf8ByteLength(value.slice(0, mid)) <= maxBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return value.slice(0, low);
}

function takeEndByBytes(value: string, maxBytes: number): string {
  let low = 0;
  let high = value.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (utf8ByteLength(value.slice(value.length - mid)) <= maxBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return value.slice(value.length - low);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
