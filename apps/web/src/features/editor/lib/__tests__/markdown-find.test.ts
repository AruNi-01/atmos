import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import {
  compileMarkdownFindPattern,
  findMarkdownHits,
  markdownFindCounter,
} from "../markdown-find";

describe("markdown find", () => {
  test("compiles literal, case, word, and regexp queries", () => {
    expect(compileMarkdownFindPattern({
      search: "Hello.",
      caseSensitive: false,
      wholeWord: false,
      regexp: false,
    }).pattern?.source).toContain("Hello");

    const sensitive = compileMarkdownFindPattern({
      search: "Ab",
      caseSensitive: true,
      wholeWord: false,
      regexp: false,
    }).pattern!;
    sensitive.lastIndex = 0;
    expect(sensitive.test("Ab")).toBe(true);
    sensitive.lastIndex = 0;
    expect(sensitive.test("ab")).toBe(false);

    expect(compileMarkdownFindPattern({
      search: "(",
      caseSensitive: false,
      wholeWord: false,
      regexp: true,
    }).invalid).toBe(true);
  });

  test("finds matches across text nodes and formats the counter like CodeMirror", () => {
    const win = new Window({ url: "https://app.atmos.local/" });
    const root = win.document.createElement("div");
    root.innerHTML = "<p>Hello markdown</p><p>hello again</p>";
    const { hits } = findMarkdownHits(root, {
      search: "hello",
      caseSensitive: false,
      wholeWord: false,
      regexp: false,
    });
    expect(hits).toHaveLength(2);
    expect(hits[0]?.node.textContent).toContain("Hello markdown");
    expect(hits[1]?.node.textContent).toContain("hello again");
    expect(markdownFindCounter(0, 2)).toBe("1/2");
    expect(markdownFindCounter(-1, 2)).toBe("0/2");
    expect(markdownFindCounter(0, 0)).toBe("");
  });

  test("skips the find panel and highlight overlay", () => {
    const win = new Window({ url: "https://app.atmos.local/" });
    const root = win.document.createElement("div");
    root.innerHTML =
      '<p>visible hello</p><div data-markdown-find-panel=""><span>hello hidden</span></div>';
    const { hits } = findMarkdownHits(root, {
      search: "hello",
      caseSensitive: false,
      wholeWord: false,
      regexp: false,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.node.textContent).toContain("visible");
  });

  test("walks root sibling text nodes in document order", () => {
    const win = new Window({ url: "https://app.atmos.local/" });
    const root = win.document.createElement("div");
    root.append("zebra", "apple");
    const { hits } = findMarkdownHits(root, {
      search: "a",
      caseSensitive: false,
      wholeWord: false,
      regexp: false,
    });
    expect(hits.map((hit) => hit.node.textContent)).toEqual([
      "zebra",
      "apple",
    ]);
  });
});
