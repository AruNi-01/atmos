import { describe, expect, test } from "bun:test";
import BananaSlug from "github-slugger";
import { extractTocHeadings } from "@/shared/components/markdown/MarkdownToc";
import { slugMdLiveHeading } from "@atmos/md-live/ui";

describe("md-live heading ids", () => {
  test("match MarkdownToc github-slugger ids including CJK punctuation", () => {
    const markdown = "## 后续优化:\n\n### CI 缓存策略很关键\n";
    const headings = extractTocHeadings(markdown);
    expect(headings.map((h) => h.id)).toEqual([
      slugMdLiveHeading("后续优化:"),
      slugMdLiveHeading("CI 缓存策略很关键"),
    ]);
    expect(headings[0]?.id).toBe(new BananaSlug().slug("后续优化:"));
    expect(headings[0]?.id).not.toBe("后续优化:");
  });
});
