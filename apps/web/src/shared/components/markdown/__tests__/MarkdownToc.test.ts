import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { extractTocHeadings, findTocHeadingElement } from "../MarkdownToc";

describe("MarkdownToc heading lookup", () => {
  test("finds headings by github-slugger id and by text fallback", () => {
    const win = new Window({ url: "https://app.atmos.local/" });
    const root = win.document.createElement("div");
    const headings = extractTocHeadings("## 后续优化:\n\n### Hello");
    expect(headings).toHaveLength(2);

    const h2 = win.document.createElement("h2");
    h2.id = headings[0]!.id;
    h2.textContent = "后续优化:";
    root.appendChild(h2);

    const h3 = win.document.createElement("h3");
    h3.textContent = "Hello";
    root.appendChild(h3);

    expect(findTocHeadingElement(root, headings[0]!)?.id).toBe(headings[0]!.id);
    expect(findTocHeadingElement(root, headings[1]!)?.textContent).toBe("Hello");
  });
});
