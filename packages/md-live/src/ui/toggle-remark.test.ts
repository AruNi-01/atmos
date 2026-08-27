import { describe, expect, test } from "bun:test";
import { detailsHasOpenAttr, htmlToPlainText, remarkMdLiveDetails } from "./toggle-remark";

function apply(children: unknown[]) {
  const tree = { type: "root", children };
  remarkMdLiveDetails()(tree);
  return tree.children;
}

describe("remarkMdLiveDetails", () => {
  test("lifts split details/summary html around markdown blocks", () => {
    const children = apply([
      { type: "html", value: "<details>\n<summary>hello</summary>" },
      { type: "paragraph", children: [{ type: "text", value: "哦好" }] },
      { type: "paragraph", children: [{ type: "text", value: "你好" }] },
      { type: "html", value: "</details>" },
    ]);
    expect(children).toHaveLength(1);
    const details = children[0] as {
      type: string;
      children: Array<{ type: string; children?: Array<{ value?: string }> }>;
    };
    expect(details.type).toBe("details");
    expect(details.children[0]?.type).toBe("detailsSummary");
    expect(details.children[0]?.children?.[0]?.value).toBe("hello");
    expect(details.children[1]?.children?.[0]?.value).toBe("哦好");
    expect(details.children[2]?.children?.[0]?.value).toBe("你好");
  });

  test("lifts a complete html details block", () => {
    const children = apply([
      {
        type: "html",
        value: "<details>\n<summary>Title</summary>\n\nHidden\n</details>",
      },
    ]);
    const details = children[0] as {
      type: string;
      children: Array<{ type: string; children?: Array<{ value?: string }> }>;
    };
    expect(details.type).toBe("details");
    expect(details.children[0]?.children?.[0]?.value).toBe("Title");
    expect(details.children[1]?.children?.[0]?.value).toBe("Hidden");
  });

  test("unwraps paragraph-wrapped html sentinels", () => {
    const children = apply([
      { type: "paragraph", children: [{ type: "html", value: "<details>" }] },
      { type: "paragraph", children: [{ type: "html", value: "<summary>Fold</summary>" }] },
      { type: "paragraph", children: [{ type: "text", value: "inner" }] },
      { type: "paragraph", children: [{ type: "html", value: "</details>" }] },
    ]);
    const details = children[0] as {
      type: string;
      children: Array<{ type: string; children?: Array<{ value?: string }> }>;
    };
    expect(details.type).toBe("details");
    expect(details.children[0]?.children?.[0]?.value).toBe("Fold");
    expect(details.children.some((child) => child.children?.[0]?.value === "inner")).toBe(true);
  });

  test("summary html collapses to plain text and cannot re-form tags", () => {
    expect(htmlToPlainText("<b>hello</b>")).toBe("hello");
    expect(htmlToPlainText("<script>alert(1)</script>hi")).toBe("alert(1)hi");
    expect(htmlToPlainText("<<script>alert(1)")).toBe("alert(1)");
    expect(htmlToPlainText("<script")).toBe("");
    expect(htmlToPlainText("&lt;script&gt;")).toBe("script");
    const children = apply([
      {
        type: "html",
        value: "<details>\n<summary><script>x</script>hello</summary>\n</details>",
      },
    ]);
    const details = children[0] as {
      children: Array<{ children?: Array<{ value?: string }> }>;
    };
    expect(details.children[0]?.children?.[0]?.value).toBe("xhello");
    expect(details.children[0]?.children?.[0]?.value).not.toMatch(/<script/i);
  });

  test("reads the html open attribute without matching class names", () => {
    expect(detailsHasOpenAttr("<details>")).toBe(false);
    expect(detailsHasOpenAttr("<details open>")).toBe(true);
    expect(detailsHasOpenAttr('<details open="">')).toBe(true);
    expect(detailsHasOpenAttr("<details class=\"opened\">")).toBe(false);
    const children = apply([
      { type: "html", value: "<details open>\n<summary>hello</summary>\n</details>" },
    ]);
    expect((children[0] as { open?: boolean }).open).toBe(true);
  });
});
