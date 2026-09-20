import { describe, expect, it } from "bun:test";
import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderInlineMarkdown } from "./approval-inline-markdown";

describe("renderInlineMarkdown", () => {
  it("renders bold and inline code without HTML injection", () => {
    const html = renderToStaticMarkup(
      <>
        {renderInlineMarkdown("Ship **context fill** via `context_window`", {
          strong: "s",
          code: "c",
        })}
      </>,
    );
    expect(html).toContain('<strong class="s">context fill</strong>');
    expect(html).toContain('<code class="c">context_window</code>');
    expect(html).not.toContain("<script");
  });

  it("passes through plain text unchanged", () => {
    expect(renderInlineMarkdown("plain step")).toBe("plain step");
  });

  it("does not interpret raw angle brackets as HTML", () => {
    const html = renderToStaticMarkup(
      <>{renderInlineMarkdown("Use <script>alert(1)</script> carefully")}</>,
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("returns React elements for marked spans", () => {
    const nodes = renderInlineMarkdown("**bold** and `code`");
    expect(Array.isArray(nodes)).toBe(true);
    const elements = (nodes as unknown[]).filter(isValidElement) as ReactElement[];
    expect(elements.map((el) => el.type)).toEqual(["strong", "code"]);
  });
});
