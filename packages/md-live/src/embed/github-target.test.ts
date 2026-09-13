import { describe, expect, test } from "bun:test";
import {
  githubTargetToEmbedSpec,
  parseGithubRefInput,
  parseGithubResourceUrl,
  parseMdLiveGithubTarget,
} from "./github-target";

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

  test("parses shorthand and hash refs for insert", () => {
    expect(parseGithubRefInput("acme/app#128", "issue")).toEqual({
      kind: "issue",
      owner: "acme",
      repo: "app",
      number: 128,
      url: "https://github.com/acme/app/issues/128",
    });
    expect(parseGithubRefInput("#9", "pr", { owner: "acme", repo: "app" })).toEqual({
      kind: "pr",
      owner: "acme",
      repo: "app",
      number: 9,
      url: "https://github.com/acme/app/pull/9",
    });
    expect(parseGithubRefInput("https://github.com/acme/app/pull/9", "issue")).toBeNull();
    expect(parseGithubRefInput("https://github.com/acme/app/pull/9")).toEqual({
      kind: "pr",
      owner: "acme",
      repo: "app",
      number: 9,
      url: "https://github.com/acme/app/pull/9",
    });
    expect(parseGithubRefInput("acme/app#128")).toBeNull();
    expect(
      githubTargetToEmbedSpec({
        kind: "issue",
        owner: "acme",
        repo: "app",
        number: 128,
        url: "https://github.com/acme/app/issues/128",
      }, { title: "Fix pty" }),
    ).toEqual({
      kind: "github-issue",
      layout: "card",
      title: "Fix pty",
      attrs: {
        owner: "acme",
        repo: "app",
        n: "128",
        url: "https://github.com/acme/app/issues/128",
      },
    });
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
