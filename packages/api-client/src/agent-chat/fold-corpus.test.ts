import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyPartClosed, applyTextChunk, applyToolCall, createPartStore } from "./fold";
import type { PartClosed, TextChunk, ToolCallState } from "./types";

type CorpusEvent =
  | TextChunk
  | PartClosed
  | (ToolCallState & { type: "tool_call" });

type CorpusPart = {
  id: string;
  message_id: string;
  ordinal: number;
  kind: string;
  text: string;
  closed: boolean;
  tool_status?: string | null;
  tool_name?: string | null;
};

type CorpusCase = {
  name: string;
  events: CorpusEvent[];
  expected: CorpusPart[];
};

type Corpus = {
  cases: CorpusCase[];
};

function loadCorpus(): Corpus {
  return JSON.parse(
    readFileSync(join(import.meta.dir, "fixtures/fold-corpus.json"), "utf8"),
  ) as Corpus;
}

function snapshot(store: ReturnType<typeof createPartStore>): CorpusPart[] {
  return [...store.parts.values()]
    .map((part) => {
      if (part.body.type === "tool_call") {
        return {
          id: part.id,
          message_id: part.message_id,
          ordinal: part.ordinal,
          kind: "tool",
          text: part.text,
          closed: part.closed_at != null,
          tool_status: part.body.tool.status,
          tool_name: part.body.tool.name ?? null,
        };
      }
      return {
        id: part.id,
        message_id: part.message_id,
        ordinal: part.ordinal,
        kind: part.body.type === "text" ? part.body.kind : part.body.type,
        text: part.text,
        closed: part.closed_at != null,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function foldCase(events: CorpusEvent[]): CorpusPart[] {
  const draft = createPartStore();
  for (const event of events) {
    if (event.type === "text_chunk") {
      applyTextChunk(draft, event);
    } else if (event.type === "part_closed") {
      applyPartClosed(draft, event);
    } else {
      const { type: _type, ...tool } = event;
      applyToolCall(draft, tool);
    }
  }
  return snapshot(draft);
}

describe("S11 shared fold corpus", () => {
  const corpus = loadCorpus();

  test("corpus is non-empty", () => {
    expect(corpus.cases.length).toBeGreaterThan(0);
  });

  for (const caseItem of corpus.cases) {
    test(caseItem.name, () => {
      expect(foldCase(caseItem.events)).toEqual(
        [...caseItem.expected].sort((a, b) => a.id.localeCompare(b.id)),
      );
    });
  }
});
