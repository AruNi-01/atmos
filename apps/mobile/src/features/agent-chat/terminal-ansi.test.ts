// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { terminalAnsiPieces } from "./terminal-ansi";

describe("terminal ansi", () => {
  test("matches ansi-to-react colors, the last decoration, and carriage cleanup", () => {
    expect(terminalAnsiPieces("plain")).toEqual([{ text: "plain" }]);
    expect(terminalAnsiPieces("\u001b[31mred\u001b[0m")).toEqual([
      { text: "red", style: { color: "rgb(187, 0, 0)" } },
    ]);
    expect(terminalAnsiPieces("\u001b[1;32mbold green\u001b[0m")).toEqual([
      { text: "bold green", style: { color: "rgb(0, 187, 0)", fontWeight: "bold" } },
    ]);
    expect(terminalAnsiPieces("\u001b[2mdim\u001b[0m")).toEqual([
      { text: "dim", style: { opacity: 0.5 } },
    ]);
    expect(terminalAnsiPieces("\u001b[3mslant\u001b[0m")).toEqual([
      { text: "slant", style: { fontStyle: "italic" } },
    ]);
    expect(terminalAnsiPieces("\u001b[4;9mboth\u001b[0m")).toEqual([
      { text: "both", style: { textDecorationLine: "line-through" } },
    ]);
    expect(terminalAnsiPieces("\u001b[8mhidden\u001b[0m")).toEqual([
      { text: "hidden", style: { opacity: 0 } },
    ]);
    expect(terminalAnsiPieces("\u001b[38;2;10;20;30mtrue\u001b[0m")).toEqual([
      { text: "true", style: { color: "rgb(10, 20, 30)" } },
    ]);
    expect(terminalAnsiPieces("\u001b[48;5;196m bg \u001b[0m")).toEqual([
      { text: " bg ", style: { backgroundColor: "rgb(255, 0, 0)" } },
    ]);
    expect(terminalAnsiPieces("\u001b[31mred\u001b[1m bold\u001b[0m")).toEqual([
      { text: "red", style: { color: "rgb(187, 0, 0)" } },
      { text: " bold", style: { color: "rgb(187, 0, 0)", fontWeight: "bold" } },
    ]);
    expect(terminalAnsiPieces("a\rb")).toEqual([{ text: "b" }]);
    expect(terminalAnsiPieces("hi\bX")).toEqual([{ text: "hX" }]);
  });
});
