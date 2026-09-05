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
    expect(hits[0]?.startNode.textContent).toContain("Hello markdown");
    expect(hits[1]?.startNode.textContent).toContain("hello again");
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
    expect(hits[0]?.startNode.textContent).toContain("visible");
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
    expect(hits.map((hit) => hit.startNode.textContent)).toEqual([
      "zebra",
      "apple",
    ]);
  });

  test("matches a query that spans inline markup", () => {
    const win = new Window({ url: "https://app.atmos.local/" });
    const root = win.document.createElement("div");
    root.innerHTML = "<p>hello <strong>world</strong></p>";
    const { hits } = findMarkdownHits(root, {
      search: "hello world",
      caseSensitive: false,
      wholeWord: false,
      regexp: false,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.startNode.textContent).toBe("hello ");
    expect(hits[0]?.endNode.textContent).toBe("world");
  });

  test("does not join separate block elements into one match", () => {
    const win = new Window({ url: "https://app.atmos.local/" });
    const root = win.document.createElement("div");
    root.innerHTML = "<p>hello</p><p>world</p>";
    expect(findMarkdownHits(root, {
      search: "helloworld",
      caseSensitive: false,
      wholeWord: false,
      regexp: false,
    }).hits).toHaveLength(0);
    expect(findMarkdownHits(root, {
      search: "hello",
      caseSensitive: false,
      wholeWord: false,
      regexp: false,
    }).hits).toHaveLength(1);
    expect(findMarkdownHits(root, {
      search: String.raw`hello\s+world`,
      caseSensitive: false,
      wholeWord: false,
      regexp: true,
    }).hits).toHaveLength(0);
  });

  test("still matches real newlines inside a pre block", () => {
    const win = new Window({ url: "https://app.atmos.local/" });
    const root = win.document.createElement("div");
    root.innerHTML = "<pre>hello\nworld</pre>";
    expect(findMarkdownHits(root, {
      search: String.raw`hello\s+world`,
      caseSensitive: false,
      wholeWord: false,
      regexp: true,
    }).hits).toHaveLength(1);
  });

  test("does not match across a pre that already ends with a newline", () => {
    const win = new Window({ url: "https://app.atmos.local/" });
    const root = win.document.createElement("div");
    root.innerHTML = "<pre>hello\n</pre><p>world</p>";
    expect(findMarkdownHits(root, {
      search: String.raw`hello\s+world`,
      caseSensitive: false,
      wholeWord: false,
      regexp: true,
    }).hits).toHaveLength(0);
  });

  test("matches a regexp across a line break inside one paragraph", () => {
    const win = new Window({ url: "https://app.atmos.local/" });
    const root = win.document.createElement("div");
    root.innerHTML = "<p>hello<br>world</p>";
    expect(findMarkdownHits(root, {
      search: String.raw`hello\s+world`,
      caseSensitive: false,
      wholeWord: false,
      regexp: true,
    }).hits).toHaveLength(1);
  });
});
