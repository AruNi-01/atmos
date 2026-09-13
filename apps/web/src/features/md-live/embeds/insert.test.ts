import { describe, expect, test } from "bun:test";
import {
  embedSpecFromGithubInput,
  embedSpecFromPath,
  markdownFromEmbedSpec,
} from "./insert";

describe("md-live embed insert", () => {
  test("builds github card markdown from a URL", () => {
    const spec = embedSpecFromGithubInput(
      "https://github.com/acme/app/issues/128",
    );
    expect(spec?.kind).toBe("github-issue");
    expect(spec?.layout).toBe("card");
    expect(markdownFromEmbedSpec(spec!)).toContain("::md-live[");
    expect(markdownFromEmbedSpec(spec!)).toContain("kind=github-issue");
  });

  test("builds inline file markdown from a worktree path", () => {
    const spec = embedSpecFromPath("src/auth/github.ts", "file");
    expect(spec).toEqual({
      kind: "file",
      layout: "inline",
      title: "github.ts",
      attrs: { path: "src/auth/github.ts" },
    });
    expect(markdownFromEmbedSpec(spec).startsWith(":md-live[")).toBe(true);
    expect(markdownFromEmbedSpec(spec).includes("\n")).toBe(false);
  });

  test("folder defaults to inline", () => {
    const spec = embedSpecFromPath("crates/core-engine/src/tmux", "folder");
    expect(spec.kind).toBe("folder");
    expect(spec.layout).toBe("inline");
    expect(spec.title).toBe("tmux");
  });
});
