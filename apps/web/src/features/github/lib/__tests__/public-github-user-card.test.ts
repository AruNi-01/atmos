// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, describe, expect, it } from "bun:test";
import {
  fetchPublicGithubUserCard,
  normalizeGithubLogin,
  parsePublicGithubUserCard,
  resolveGithubUserCardSources,
} from "@/features/github/lib/public-github-user-card";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("normalizeGithubLogin", () => {
  it("strips @ and [bot] suffix", () => {
    expect(normalizeGithubLogin(" @octocat ")).toBe("octocat");
    expect(normalizeGithubLogin("dependabot[bot]")).toBe("dependabot");
    expect(normalizeGithubLogin("")).toBeNull();
    expect(normalizeGithubLogin(null)).toBeNull();
  });
});

describe("resolveGithubUserCardSources", () => {
  it("uses public REST on share pages and when WS is down", () => {
    expect(resolveGithubUserCardSources("public", false, false)).toEqual({
      useWs: false,
      usePublic: true,
    });
    expect(resolveGithubUserCardSources("auto", false, false)).toEqual({
      useWs: false,
      usePublic: true,
    });
  });

  it("prefers WS when connected, then falls back after a WS error", () => {
    expect(resolveGithubUserCardSources("auto", true, false)).toEqual({
      useWs: true,
      usePublic: false,
    });
    expect(resolveGithubUserCardSources("auto", true, true)).toEqual({
      useWs: true,
      usePublic: true,
    });
    expect(resolveGithubUserCardSources("ws", true, true)).toEqual({
      useWs: true,
      usePublic: false,
    });
  });
});

describe("parsePublicGithubUserCard", () => {
  it("maps public REST profile fields and leaves the calendar empty", () => {
    const card = parsePublicGithubUserCard(
      {
        login: "octocat",
        name: "The Octocat",
        avatar_url: "https://avatars.githubusercontent.com/u/583231?v=4",
      },
      "fallback",
    );
    expect(card).toEqual({
      login: "octocat",
      name: "The Octocat",
      avatar_url: "https://avatars.githubusercontent.com/u/583231?v=4",
      total_contributions: 0,
      contributions: [],
    });
  });

  it("falls back to the requested login when the payload omits it", () => {
    expect(parsePublicGithubUserCard({}, "builder").login).toBe("builder");
  });
});

describe("fetchPublicGithubUserCard", () => {
  it("calls GitHub's public users API", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          login: "octocat",
          name: "The Octocat",
          avatar_url: "https://avatars.githubusercontent.com/u/583231?v=4",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const card = await fetchPublicGithubUserCard("@octocat");
    expect(calls).toEqual(["https://api.github.com/users/octocat"]);
    expect(card.login).toBe("octocat");
    expect(card.contributions).toEqual([]);
  });

  it("rejects blank or path-like logins", async () => {
    await expect(fetchPublicGithubUserCard("")).rejects.toThrow(
      "GitHub username is required",
    );
    await expect(fetchPublicGithubUserCard("foo/bar")).rejects.toThrow(
      "GitHub username is required",
    );
  });
});
