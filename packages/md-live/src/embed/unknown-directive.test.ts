import { describe, expect, test } from "bun:test";
import {
  formatDirectiveAttributes,
  formatUnknownDirectiveSource,
  isMdLiveDirectiveName,
  remarkUnknownDirectives,
  type DirectiveMdast,
} from "./unknown-directive";

function apply(tree: DirectiveMdast): DirectiveMdast {
  remarkUnknownDirectives()(tree);
  return tree;
}

describe("unknown directive fallback", () => {
  test("CJK colon prose is not a kept embed name", () => {
    expect(isMdLiveDirectiveName("每种")).toBe(false);
    expect(isMdLiveDirectiveName("md-live")).toBe(true);
  });

  test("reconstructs :每种 without empty brackets or attrs", () => {
    expect(
      formatUnknownDirectiveSource({
        type: "textDirective",
        name: "每种",
        attributes: {},
        children: [],
      }),
    ).toBe(":每种");
    expect(formatDirectiveAttributes({})).toBe("");
    expect(formatDirectiveAttributes({ year: "2020" })).toBe("{year=2020}");
  });

  test("turns CJK textDirective back into colon text", () => {
    const tree = apply({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            { type: "text", value: "这里已经看出关键点了" },
            { type: "textDirective", name: "每种", attributes: {}, children: [] },
            { type: "text", value: " tmux 操作都 spawn" },
          ],
        },
      ],
    });
    expect(tree.children).toEqual([
      {
        type: "paragraph",
        children: [
          { type: "text", value: "这里已经看出关键点了" },
          { type: "text", value: ":每种" },
          { type: "text", value: " tmux 操作都 spawn" },
        ],
      },
    ]);
  });

  test("keeps :md-live / ::md-live embeds", () => {
    const inline: DirectiveMdast = {
      type: "textDirective",
      name: "md-live",
      attributes: { kind: "file", layout: "inline" },
      children: [{ type: "text", value: "auth.ts" }],
    };
    const card: DirectiveMdast = {
      type: "leafDirective",
      name: "md-live",
      attributes: { kind: "github-issue", layout: "card" },
      children: [{ type: "text", value: "GitHub #128" }],
    };
    const tree = apply({
      type: "root",
      children: [
        { type: "paragraph", children: [inline] },
        card,
      ],
    });
    expect(tree.children?.[0]?.children?.[0]).toEqual(inline);
    expect(tree.children?.[1]).toEqual(card);
  });

  test("flattens unknown leaf and container directives", () => {
    const tree = apply({
      type: "root",
      children: [
        {
          type: "leafDirective",
          name: "youtube",
          attributes: { url: "https://youtu.be/a" },
          children: [],
        },
        {
          type: "containerDirective",
          name: "note",
          attributes: {},
          children: [
            { type: "paragraph", children: [{ type: "text", value: "body" }] },
          ],
        },
      ],
    });
    expect(tree.children?.[0]).toEqual({
      type: "paragraph",
      children: [{ type: "text", value: "::youtube{url=https://youtu.be/a}" }],
    });
    expect(tree.children?.slice(1)).toEqual([
      { type: "paragraph", children: [{ type: "text", value: ":::note" }] },
      { type: "paragraph", children: [{ type: "text", value: "body" }] },
      { type: "paragraph", children: [{ type: "text", value: ":::" }] },
    ]);
  });

  test("turns clock times and ratios back into colon text", () => {
    const tree = apply({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            { type: "text", value: "Meet at 12" },
            { type: "textDirective", name: "30", attributes: {}, children: [] },
            { type: "text", value: " in room 16" },
            { type: "textDirective", name: "9", attributes: {}, children: [] },
            { type: "text", value: "." },
          ],
        },
      ],
    });
    expect(tree.children?.[0]?.children).toEqual([
      { type: "text", value: "Meet at 12" },
      { type: "text", value: ":30" },
      { type: "text", value: " in room 16" },
      { type: "text", value: ":9" },
      { type: "text", value: "." },
    ]);
  });

  test("restores leftover link and image references as markdown text", () => {
    const tree = apply({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            { type: "text", value: "See " },
            {
              type: "linkReference",
              referenceType: "full",
              identifier: "missing-ref",
              label: "missing-ref",
              children: [{ type: "text", value: "the spec" }],
            },
            { type: "text", value: " and " },
            {
              type: "imageReference",
              referenceType: "full",
              identifier: "no-img",
              label: "no-img",
              alt: "alt",
            },
          ],
        },
        {
          type: "definition",
          identifier: "unused",
          label: "unused",
          url: "https://example.com/x",
          title: null,
        },
      ],
    });
    expect(tree.children?.[0]?.children).toEqual([
      { type: "text", value: "See " },
      { type: "text", value: "[" },
      { type: "text", value: "the spec" },
      { type: "text", value: "][missing-ref]" },
      { type: "text", value: " and " },
      { type: "text", value: "![alt][no-img]" },
    ]);
    expect(tree.children?.[1]).toEqual({
      type: "paragraph",
      children: [{ type: "text", value: "[unused]: https://example.com/x" }],
    });
  });

  test("preserves phrasing inside an unknown textDirective label", () => {
    const tree = apply({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "textDirective",
              name: "cite",
              attributes: { year: "2020" },
              children: [{ type: "emphasis", children: [{ type: "text", value: "Smith" }] }],
            },
          ],
        },
      ],
    });
    expect(tree.children?.[0]?.children).toEqual([
      { type: "text", value: ":cite[" },
      { type: "emphasis", children: [{ type: "text", value: "Smith" }] },
      { type: "text", value: "]{year=2020}" },
    ]);
  });
});
