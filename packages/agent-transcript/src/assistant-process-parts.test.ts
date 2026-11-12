import { describe, expect, it } from "bun:test";
import { layoutAssistantAnswer, splitTrailingAnswer } from "./assistant-process-parts";

describe("assistant answer layout order", () => {
  const isAnswer = (item: string) => item.startsWith("text");
  const isSoftProcess = (item: string) => item === "thinking" || item === "plan";

  it("preserves every prefix of interleaved streamed content", () => {
    const items = ["text1", "thinking", "tool1", "text2", "tool2", "thinking", "text3"];
    for (let count = 0; count <= items.length; count += 1) {
      const prefix = items.slice(0, count);
      const layout = layoutAssistantAnswer(prefix, isAnswer, isSoftProcess);
      expect([...layout.process, ...layout.tail]).toEqual(prefix);
      const split = splitTrailingAnswer(prefix, isAnswer);
      expect([...split.process, ...split.answer]).toEqual(prefix);
    }
  });

  it("keeps soft process after closing text in order even without another text", () => {
    expect(
      layoutAssistantAnswer(
        ["tool", "thinking", "text1", "thinking", "plan"],
        isAnswer,
        isSoftProcess,
      ),
    ).toEqual({
      process: ["tool", "thinking"],
      tail: ["text1", "thinking", "plan"],
    });
    expect(layoutAssistantAnswer(["text1", "thinking"], isAnswer, isSoftProcess)).toEqual({
      process: [],
      tail: ["text1", "thinking"],
    });
  });
});
