import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import type {
  AgentActivity,
  AgentChildActivity,
  AgentToolType,
  AgentTurn,
} from "@atmos/api-types/ws/dto/events";
import { isLeakedChildTurn } from "@/features/agent/lib/observer-conversation";

/** Agent Sessions key prefix. Agents without a session source are omitted. */
const HOST_PROVIDER_BY_TOOL: Partial<Record<AgentToolType, string>> = {
  "claude-code": "claude",
  codex: "codex",
  cursor: "cursor",
  opencode: "opencode",
  pi: "pi",
  "grok-build": "grok",
};

const PREFIX_MATCH_CHARS = 40;

export type ObserverHistoryRequest =
  | { kind: "chat"; chatId: string }
  | { kind: "host"; key: string };

export function observerHistoryRequest(activity: AgentActivity): ObserverHistoryRequest | null {
  const sessionId = activity.session_id?.trim() ?? "";
  const chat = activity.surface === "chat" || sessionId.startsWith("chat:");
  if (chat) {
    const chatId = activity.surface_id?.trim()
      || (sessionId.startsWith("chat:") ? sessionId.slice("chat:".length).trim() : "");
    return chatId ? { kind: "chat", chatId } : null;
  }
  const native = activity.native_session_id?.trim() ?? "";
  if (!native) return null;
  const provider = activity.host_provider_id?.trim()
    || HOST_PROVIDER_BY_TOOL[activity.tool]
    || "";
  if (!provider || !Object.values(HOST_PROVIDER_BY_TOOL).includes(provider)) return null;
  return { kind: "host", key: `${provider}:${native}` };
}

/** Refetch when a turn opens or closes, not on every tool tick. */
export function historyRefreshKey(activity: AgentActivity): string {
  const turns = activity.turns ?? [];
  const latest = turns.at(-1);
  return [
    turns.length,
    activity.current_turn_id ?? "",
    latest?.turn_id ?? "",
    latest?.ended_at ?? "",
  ].join(":");
}

export function userMessageText(message: AgentMessage): string {
  if (message.role !== "user") return "";
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

/** Exact text, or a long / truncated prefix of the same prompt. */
export function promptsMatch(left: string, right: string): boolean {
  const a = left.trim();
  const b = right.trim();
  if (!a || !b) return false;
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  const clipped = shorter.endsWith("…") || shorter.endsWith("...");
  if (!clipped && shorter.length < PREFIX_MATCH_CHARS) return false;
  const head = shorter.replace(/(?:…|\.{3})$/, "");
  return head.length > 0 && longer.startsWith(head);
}

export type SessionHistorySplit = {
  /** Transcript rows to show. The live open turn is cut off when hooks still own it. */
  messages: AgentMessage[];
  /** Hook turns whose prompt is not already in `messages`. */
  hookTurnIds: number[];
};

/**
 * The saved transcript is the full session. Hook turns fill what it does not
 * have yet, and replace the open tail so a settled preview does not hide live tools.
 */
export function splitSessionHistory(
  messages: AgentMessage[],
  turns: AgentTurn[],
  children: AgentChildActivity[] = [],
): SessionHistorySplit {
  const visible = turns.filter((turn) => !isLeakedChildTurn(turn, children));
  if (messages.length === 0) {
    return { messages: [], hookTurnIds: visible.map((turn) => turn.turn_id) };
  }

  let history = messages;
  const latest = visible.at(-1);
  if (latest && !latest.ended_at) {
    const index = lastUserIndex(messages);
    const last = index >= 0 ? messages[index] : undefined;
    if (last && promptsMatch(latest.prompt, userMessageText(last))) {
      history = messages.slice(0, index);
    }
  }

  const hookTurnIds = visible
    .filter((turn) => !transcriptHasTurn(history, turn))
    .map((turn) => turn.turn_id);
  return { messages: history, hookTurnIds };
}

function transcriptHasTurn(messages: AgentMessage[], turn: AgentTurn): boolean {
  const prompt = turn.prompt.trim();
  if (!prompt) return Boolean(turn.ended_at) || turn.tools.length === 0;
  return messages.some((message) => promptsMatch(prompt, userMessageText(message)));
}

function lastUserIndex(messages: AgentMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}
