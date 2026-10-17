// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import {
  nextWebSearchShown,
  webSearchFaviconCandidates,
  webSearchHost,
  webSearchOverflow,
  webSearchResultMeta,
  webSearchRowVisible,
  webSearchStackWidth,
} from "./web-search-stack";

const here = dirname(fileURLToPath(import.meta.url));

describe("web search sources", () => {
  test("keeps www on the host and walks site, Google, then DuckDuckGo", () => {
    expect(webSearchHost("https://www.example.com/docs")).toBe("www.example.com");
    expect(webSearchFaviconCandidates("https://www.example.com/docs")).toEqual([
      "https://www.example.com/favicon.ico",
      "https://www.google.com/s2/favicons?domain=www.example.com&sz=64",
      "https://icons.duckduckgo.com/ip3/www.example.com.ico",
    ]);
    expect(webSearchFaviconCandidates("javascript:alert(1)")).toEqual([]);
    expect(webSearchFaviconCandidates("not a url")).toEqual([]);
  });

  test("reveals the last source first and sizes the collapsed stack", () => {
    expect(webSearchOverflow(8)).toBe(2);
    expect(webSearchOverflow(6)).toBe(0);
    expect(webSearchRowVisible(2, 1, 3)).toBe(true);
    expect(webSearchRowVisible(0, 1, 3)).toBe(false);
    expect(nextWebSearchShown(true, 2, 3)).toBe(3);
    expect(nextWebSearchShown(false, 0, 3)).toBe(0);
    expect(webSearchStackWidth(0)).toBe(0);
    expect(webSearchStackWidth(1)).toBe(20);
    expect(webSearchStackWidth(6)).toBe(90);
  });

  test("counts results with the web plural and hides an empty search", () => {
    expect(webSearchResultMeta(0)).toBeNull();
    expect(webSearchResultMeta(1)).toBe("1 result");
    expect(webSearchResultMeta(2)).toBe("2 results");
  });

  test("the web search body is the sources stack, and file search is not", () => {
    const source = readFileSync(join(here, "tool-body.tsx"), "utf8");
    const body = source.slice(source.indexOf("// @view"));
    expect(body).toContain("return <WebSearchSources links={model.links} />;");
    expect(body).toContain("webSearchResultMeta");
    const fileSearch = body.slice(body.lastIndexOf('case "search":'));
    expect(fileSearch.startsWith('case "search":')).toBe(true);
    expect(fileSearch.slice(0, 500)).not.toContain("WebSearchSources");
  });
});
