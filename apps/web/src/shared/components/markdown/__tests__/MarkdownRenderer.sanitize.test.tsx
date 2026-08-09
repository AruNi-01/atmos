// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";

/**
 * Mirrors MarkdownRenderer rehype plugin order:
 * parse raw HTML → sanitize unknown/unsafe tags → slug headings.
 *
 * Without rehype-sanitize, agent/XML tags such as <file> / <violation> become
 * custom DOM elements and React 19 logs "unrecognized in this browser".
 */
const REHYPE_PLUGINS = [rehypeRaw, rehypeSanitize, rehypeSlug] as const;

function renderMarkdown(markdown: string): HTMLElement {
  const windowRef = new Window({ url: "https://app.atmos.local/" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
  };

  // happy-dom Window is not a full browser Window; cast via unknown for test globals.
  (globalThis as { window: unknown }).window = windowRef;
  (globalThis as { document: unknown }).document = windowRef.document;
  (globalThis as { HTMLElement: unknown }).HTMLElement = windowRef.HTMLElement;
  (globalThis as { Node: unknown }).Node = windowRef.Node;

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  act(() => {
    root.render(
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[...REHYPE_PLUGINS]}
      >
        {markdown}
      </ReactMarkdown>,
    );
  });

  // Snapshot HTML before teardown so callers can assert on a detached node tree.
  const snapshot = container.cloneNode(true) as HTMLElement;

  act(() => {
    root.unmount();
  });
  container.remove();
  windowRef.close();

  globalThis.window = previous.window;
  globalThis.document = previous.document;
  globalThis.HTMLElement = previous.HTMLElement;
  globalThis.Node = previous.Node;

  return snapshot;
}

describe("MarkdownRenderer HTML sanitization", () => {
  it("strips unknown agent tags like <file> and <violation>", () => {
    const markdown = [
      "Review notes:",
      "",
      "<file>src/app/layout.tsx</file>",
      "",
      '<violation severity="error">Missing null check</violation>',
      "",
      "Also see <details><summary>More</summary>Hidden</details>",
    ].join("\n");

    const container = renderMarkdown(markdown);

    expect(container.querySelector("file")).toBeNull();
    expect(container.querySelector("violation")).toBeNull();
    // Text content from stripped tags is preserved
    expect(container.textContent).toContain("src/app/layout.tsx");
    expect(container.textContent).toContain("Missing null check");
    // Allowed GitHub HTML still works
    expect(container.querySelector("details")).not.toBeNull();
    expect(container.querySelector("summary")).not.toBeNull();
  });
});
