import type {
  BackfillRequest,
  Part,
  PartBody,
  PartClosed,
  PartStore,
  TextChunk,
  ToolCallState,
  ToolStatus,
} from "./types";

const utf8 = new TextEncoder();

export function byteLength(text: string): number {
  return utf8.encode(text).length;
}

export function sliceBytes(text: string, skip: number): string {
  if (skip <= 0) return text;
  const bytes = utf8.encode(text);
  if (skip >= bytes.length) return "";
  return new TextDecoder().decode(bytes.subarray(skip));
}

function textOf(part: Part): string {
  return part.body.type === "text" ? part.body.text : "";
}

function createTextPart(e: TextChunk): Part {
  const body: PartBody = { type: "text", kind: e.kind, text: "" };
  return {
    id: e.part_id,
    message_id: e.message_id,
    parent_part_id: e.parent_part_id ?? null,
    ordinal: e.ordinal,
    body,
    closed_at: null,
    get text() {
      return textOf(this);
    },
  };
}

function createToolPart(tool: ToolCallState): Part {
  const body: PartBody = { type: "tool_call", tool: { ...tool } };
  return {
    id: tool.tool_call_id,
    message_id: `tool-${tool.tool_call_id}`,
    parent_part_id: tool.parent_tool_call_id ?? null,
    ordinal: 0,
    body,
    closed_at: null,
    get text() {
      return textOf(this);
    },
  };
}

export function createPartStore(): PartStore {
  const parts = new Map<string, Part>();
  return {
    parts,
    createPart(e: TextChunk): Part {
      const part = createTextPart(e);
      parts.set(e.part_id, part);
      return part;
    },
    appendText(part: Part, chunk: string): void {
      if (chunk.length === 0 || part.body.type !== "text") return;
      part.body.text += chunk;
    },
  };
}

export function applyTextChunk(draft: PartStore, e: TextChunk): BackfillRequest | null {
  const part = draft.parts.get(e.part_id) ?? draft.createPart(e);
  const len = byteLength(part.text);
  if (e.offset > len) return { partId: e.part_id, fromOffset: len };
  const skip = len - e.offset;
  if (skip >= byteLength(e.text)) return null;
  draft.appendText(part, sliceBytes(e.text, skip));
  return null;
}

export function applyPartClosed(draft: PartStore, e: PartClosed): void {
  const part = draft.parts.get(e.part_id);
  if (!part || part.closed_at != null) return;
  part.closed_at = new Date().toISOString();
}

export function toolStatusRank(status: ToolStatus): number {
  switch (status) {
    case "pending":
      return 0;
    case "running":
      return 1;
    case "completed":
    case "failed":
      return 2;
  }
}

export function mergeToolStatus(existing: ToolStatus, incoming: ToolStatus): ToolStatus {
  if (incoming === existing) return incoming;
  return toolStatusRank(incoming) > toolStatusRank(existing) ? incoming : existing;
}

function keepOptional<T>(incoming: T | null | undefined, existing: T | null | undefined): T | null | undefined {
  return incoming != null ? incoming : existing;
}

export function mergeToolCallState(existing: ToolCallState, incoming: ToolCallState): ToolCallState {
  return {
    tool_call_id: incoming.tool_call_id || existing.tool_call_id,
    parent_tool_call_id: incoming.parent_tool_call_id ?? existing.parent_tool_call_id,
    status: mergeToolStatus(existing.status, incoming.status),
    name: keepOptional(incoming.name, existing.name),
    title: keepOptional(incoming.title, existing.title),
    kind: keepOptional(incoming.kind, existing.kind),
    params: keepOptional(incoming.params, existing.params),
    result: keepOptional(incoming.result, existing.result),
  };
}

export function applyToolCall(draft: PartStore, tool: ToolCallState): void {
  const existing = draft.parts.get(tool.tool_call_id);
  if (existing?.body.type === "tool_call") {
    existing.body.tool = mergeToolCallState(existing.body.tool, tool);
    return;
  }
  draft.parts.set(tool.tool_call_id, createToolPart(tool));
}
