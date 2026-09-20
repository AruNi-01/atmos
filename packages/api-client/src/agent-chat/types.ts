import type { AgentChatPayload } from "@atmos/api-types/ws/dto/agent-chat";
import type {
  AgentToolKind,
  AgentToolParams,
  AgentToolResult,
  AgentToolStatus,
} from "@atmos/api-types/ws/dto/agent-chat";

export type TextKind = "answer" | "thinking";

export type TextChunk = Extract<AgentChatPayload, { type: "text_chunk" }>;

export type PartClosed = Extract<AgentChatPayload, { type: "part_closed" }>;

export type BackfillRequest = {
  partId: string;
  fromOffset: number;
};

export type ToolStatus = AgentToolStatus;

/** `null` / omitted means no opinion, keep prior. Empty string overwrites. */
export type ToolCallState = {
  tool_call_id: string;
  parent_tool_call_id?: string | null;
  status: ToolStatus;
  name?: string | null;
  title?: string | null;
  kind?: AgentToolKind | null;
  params?: AgentToolParams | null;
  result?: AgentToolResult | null;
};

export type SessionChrome =
  | {
      chrome: "lifecycle";
      action: "create" | "resume";
      status: "running" | "completed" | "failed";
      duration_ms?: number | null;
      error?: string | null;
    }
  | {
      chrome: "config_change";
      model?: { from?: string | null; to: string } | null;
      mode?: { from?: string | null; to: string } | null;
    }
  | {
      chrome: "hint";
      tone: "info" | "warning" | "error";
      kind: string;
    };

export type PartBody =
  | { type: "text"; kind: TextKind; text: string }
  | { type: "tool_call"; tool: ToolCallState }
  | { type: "plan"; plan: unknown }
  | { type: "attachment"; path: string; name?: string | null }
  | { type: "error"; message: string }
  | { type: "session_chrome"; chrome: SessionChrome };

export type Part = {
  id: string;
  message_id: string;
  parent_part_id: string | null;
  ordinal: number;
  body: PartBody;
  closed_at: string | null;
  readonly text: string;
};

export type PartStore = {
  readonly parts: Map<string, Part>;
  createPart(e: TextChunk): Part;
  appendText(part: Part, chunk: string): void;
};
