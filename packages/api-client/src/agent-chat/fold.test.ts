import { describe, expect, test } from "bun:test";
import { applyPartClosed, applyTextChunk, applyToolCall, byteLength, createPartStore, mergeToolCallState, mergeToolStatus } from "./fold";
import type { TextChunk } from "./types";

function chunk(
  offset: number,
  text: string,
  overrides: Partial<Omit<TextChunk, "type" | "offset" | "text">> = {},
): TextChunk {
  return {
    type: "text_chunk",
    part_id: "p1",
    message_id: "m1",
    ordinal: 0,
    kind: "answer",
    offset,
    text,
    ...overrides,
  };
}

function partText(store: ReturnType<typeof createPartStore>, partId = "p1"): string {
  return store.parts.get(partId)?.text ?? "";
}

describe("agent-chat text fold", () => {
  test("S4 identical consecutive chunks both apply", () => {
    const draft = createPartStore();
    expect(applyTextChunk(draft, chunk(0, "hello"))).toBeNull();
    expect(applyTextChunk(draft, chunk(5, "hello"))).toBeNull();
    expect(partText(draft)).toBe("hellohello");
  });

  test("S5 overlapping and contained chunks keep the tail", () => {
    const draft = createPartStore();
    expect(applyTextChunk(draft, chunk(0, "abcd"))).toBeNull();
    expect(partText(draft)).toBe("abcd");
    expect(applyTextChunk(draft, chunk(2, "cdef"))).toBeNull();
    expect(partText(draft)).toBe("abcdef");
    expect(applyTextChunk(draft, chunk(2, "cdef"))).toBeNull();
    expect(partText(draft)).toBe("abcdef");
    expect(applyTextChunk(draft, chunk(0, "ab"))).toBeNull();
    expect(partText(draft)).toBe("abcdef");
  });

  test("replay from offset 0 is a no-op", () => {
    const draft = createPartStore();
    expect(applyTextChunk(draft, chunk(0, "hello"))).toBeNull();
    expect(applyTextChunk(draft, chunk(0, "hello"))).toBeNull();
    expect(partText(draft)).toBe("hello");
  });

  test("gap returns a backfill request", () => {
    const draft = createPartStore();
    expect(applyTextChunk(draft, chunk(0, "ab"))).toBeNull();
    expect(applyTextChunk(draft, chunk(8, "cd"))).toEqual({
      partId: "p1",
      fromOffset: 2,
    });
    expect(partText(draft)).toBe("ab");
  });

  test("S18 gap at 300 with len 100 requests backfill from 100", () => {
    const draft = createPartStore();
    expect(applyTextChunk(draft, chunk(0, "x".repeat(100)))).toBeNull();
    expect(applyTextChunk(draft, chunk(300, "z".repeat(20)))).toEqual({
      partId: "p1",
      fromOffset: 100,
    });
    expect(partText(draft)).toBe("x".repeat(100));
    expect(applyTextChunk(draft, chunk(100, "y".repeat(250)))).toBeNull();
    expect(partText(draft)).toBe(`${"x".repeat(100)}${"y".repeat(250)}`);
    expect(applyTextChunk(draft, chunk(300, "z".repeat(20)))).toBeNull();
    expect(partText(draft)).toBe(`${"x".repeat(100)}${"y".repeat(250)}`);
  });

  test("a chunk for an unknown part creates it from chunk metadata", () => {
    const draft = createPartStore();
    const e = chunk(0, "hi", {
      part_id: "think-1",
      message_id: "msg-9",
      parent_part_id: "parent-a",
      ordinal: 3,
      kind: "thinking",
    });
    expect(applyTextChunk(draft, e)).toBeNull();
    const part = draft.parts.get("think-1");
    expect(part).toBeDefined();
    expect(part?.id).toBe("think-1");
    expect(part?.message_id).toBe("msg-9");
    expect(part?.parent_part_id).toBe("parent-a");
    expect(part?.ordinal).toBe(3);
    expect(part?.body).toEqual({ type: "text", kind: "thinking", text: "hi" });
    expect(part?.closed_at).toBeNull();
  });

  test("applyPartClosed sets closed_at and is idempotent", () => {
    const draft = createPartStore();
    expect(applyTextChunk(draft, chunk(0, "ok"))).toBeNull();
    applyPartClosed(draft, { type: "part_closed", part_id: "p1", duration_ms: 12 });
    const first = draft.parts.get("p1")?.closed_at;
    expect(first).toBeTruthy();
    applyPartClosed(draft, { type: "part_closed", part_id: "p1" });
    expect(draft.parts.get("p1")?.closed_at).toBe(first);
  });

  test("offsets are UTF-8 byte offsets, not string.length", () => {
    const draft = createPartStore();
    expect(applyTextChunk(draft, chunk(0, "é"))).toBeNull();
    expect(byteLength("é")).toBe(2);
    expect("é".length).toBe(1);
    expect(applyTextChunk(draft, chunk(2, "x"))).toBeNull();
    expect(partText(draft)).toBe("éx");
    expect(applyTextChunk(draft, chunk(4, "z"))).toEqual({
      partId: "p1",
      fromOffset: 3,
    });
  });
});

describe("agent-chat tool fold", () => {
  test("completed status does not regress to running", () => {
    const draft = createPartStore();
    applyToolCall(draft, {
      tool_call_id: "t1",
      status: "completed",
      name: "Read",
      kind: "read",
      params: { type: "read", path: "a.rs" },
    });
    applyToolCall(draft, {
      tool_call_id: "t1",
      status: "running",
    });
    const tool = draft.parts.get("t1")?.body;
    expect(tool).toMatchObject({
      type: "tool_call",
      tool: {
        status: "completed",
        name: "Read",
        kind: "read",
        params: { type: "read", path: "a.rs" },
      },
    });
  });

  test("absent optional fields keep prior values", () => {
    const draft = createPartStore();
    applyToolCall(draft, {
      tool_call_id: "t1",
      status: "running",
      name: "Read",
      title: "Read file",
      kind: "read",
      params: { type: "read", path: "a.rs" },
      result: { type: "file_content", path: "a.rs", text: "fn main() {}" },
    });
    applyToolCall(draft, {
      tool_call_id: "t1",
      status: "completed",
    });
    expect(draft.parts.get("t1")?.body).toMatchObject({
      type: "tool_call",
      tool: {
        status: "completed",
        name: "Read",
        title: "Read file",
        kind: "read",
        params: { type: "read", path: "a.rs" },
        result: { type: "file_content", path: "a.rs", text: "fn main() {}" },
      },
    });
  });

  test("empty name overwrites and completed does not switch to failed", () => {
    expect(mergeToolStatus("completed", "failed")).toBe("completed");
    expect(mergeToolStatus("failed", "completed")).toBe("failed");
    const merged = mergeToolCallState(
      {
        tool_call_id: "t1",
        status: "completed",
        name: "Read",
      },
      {
        tool_call_id: "t1",
        status: "completed",
        name: "",
      },
    );
    expect(merged.name).toBe("");
  });
});
