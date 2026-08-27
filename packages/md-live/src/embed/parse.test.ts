import { describe, expect, test } from "bun:test";
import { formatEmbedDirective } from "./format";
import {
  parseAttributeBlob,
  parseEmbedDirective,
  parseEmbedDirectiveText,
} from "./parse";

describe("embed directives", () => {
  test("round-trips inline and card forms", () => {
    const inline = {
      kind: "file",
      layout: "inline" as const,
      title: "auth.ts",
      attrs: { path: "src/auth/github.ts" },
    };
    const card = {
      kind: "github-issue",
      layout: "card" as const,
      title: "GitHub #128",
      attrs: {
        owner: "acme",
        repo: "app",
        n: "128",
        url: "https://github.com/acme/app/issues/128",
      },
    };
    expect(parseEmbedDirectiveText(formatEmbedDirective(inline))).toEqual(inline);
    expect(parseEmbedDirectiveText(formatEmbedDirective(card))).toEqual(card);
    expect(formatEmbedDirective(inline).startsWith(":md-live[")).toBe(true);
    expect(formatEmbedDirective(card).startsWith("::md-live[")).toBe(true);
  });

  test("parses quoted, unquoted, and escaped attribute values", () => {
    expect(
      parseAttributeBlob('{kind=file path=src/auth.ts title="auth ts" note=\'a b\'}'),
    ).toEqual({
      kind: "file",
      path: "src/auth.ts",
      title: "auth ts",
      note: "a b",
    });
    expect(parseAttributeBlob('{msg="say \\"hi\\""}')).toEqual({
      msg: 'say "hi"',
    });
  });

  test("does not hang on a long unmatched identifier prefix", () => {
    const blob = `A${"A".repeat(5000)}`;
    expect(parseAttributeBlob(blob)).toEqual({});
  });

  test("rejects other directive names", () => {
    expect(
      parseEmbedDirective({
        type: "leafDirective",
        name: "youtube",
        attributes: { kind: "video" },
      }),
    ).toBeNull();
  });

  test("unknown kind still parses; missing layout infers from directive type", () => {
    const spec = parseEmbedDirective({
      type: "leafDirective",
      name: "md-live",
      label: "Later",
      attributes: { kind: "future-kind", foo: "bar" },
    });
    expect(spec).toEqual({
      kind: "future-kind",
      layout: "card",
      title: "Later",
      attrs: { foo: "bar" },
    });
  });
});
