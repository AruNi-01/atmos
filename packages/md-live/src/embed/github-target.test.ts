import { describe, expect, test } from "bun:test";
import { parseGithubResourceUrl, parseMdLiveGithubTarget } from "./github-target";

describe("github embed targets", () => {
  test("parses issue and pull URLs", () => {
    expect(parseGithubResourceUrl("https://github.com/acme/app/issues/128")).toEqual({
      kind: "issue",
      owner: "acme",
      repo: "app",
      number: 128,
      url: "https://github.com/acme/app/issues/128",
    });
    expect(parseGithubResourceUrl("https://github.com/acme/app/pull/9#discussion")).toEqual({
      kind: "pr",
      owner: "acme",
      repo: "app",
      number: 9,
      url: "https://github.com/acme/app/pull/9",
    });
    expect(parseGithubResourceUrl("https://example.com/issues/1")).toBeNull();
  });

  test("reads owner/repo/n attrs on a github-issue card", () => {
    expect(
      parseMdLiveGithubTarget({
        kind: "github-issue",
        layout: "card",
        title: "GitHub #128",
        attrs: { owner: "acme", repo: "app", n: "128" },
      }),
    ).toEqual({
      kind: "issue",
      owner: "acme",
      repo: "app",
      number: 128,
      url: "https://github.com/acme/app/issues/128",
    });
  });
});
