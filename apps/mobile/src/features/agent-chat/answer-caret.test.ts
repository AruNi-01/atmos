// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { answerShowsBlockCaret } from "./answer-caret";
import { copy } from "./copy";

const show = (text: string, extra?: { reduced?: boolean; tail?: boolean }) =>
  answerShowsBlockCaret({
    reduced: extra?.reduced ?? false,
    tail: extra?.tail ?? true,
    text,
  });

describe("answer block caret", () => {
  test("uses Streamdown's block caret", () => {
    expect(copy.answerCaret).toBe("\u258d");
  });

  test("shows on the animating prose tail", () => {
    expect(show("Hello")).toBe(true);
    expect(show("Hello", { tail: false })).toBe(false);
    expect(show("Hello", { reduced: true })).toBe(false);
    expect(show("")).toBe(false);
  });

  test("hides inside an unclosed fence and returns after it closes", () => {
    expect(show("```\nconst x = 1")).toBe(false);
    expect(show("~~~\nconst x = 1")).toBe(false);
    expect(show("```\nconst x = 1\n```\n\nDone")).toBe(true);
  });

  test("hides when the last block is a table and stays for prose after one", () => {
    expect(show("| a | b |\n| --- | --- |\n| 1 | 2 |")).toBe(false);
    expect(show("| a | b |\n| --- | --- |\n| 1 | 2 |\n\nDone")).toBe(true);
    expect(show("---")).toBe(true);
  });
});
