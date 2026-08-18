// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, describe, expect, it } from "bun:test";
import {
  fetchPublicGithubUserCard,
  formatContributionDate,
  normalizeGithubLogin,
  parsePublicGithubUserCard,
  PUBLIC_GITHUB_CONTRIBUTIONS_API,
  resolveGithubUserCardSources,
} from "@/features/github/lib/public-github-user-card";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("formatContributionDate", () => {
  it("formats calendar days in the app locale, not the browser locale", () => {
    expect(formatContributionDate("2026-06-28", "en")).toBe("Jun 28, 2026");
    expect(formatContributionDate("2026-06-28", "zh")).toMatch(/2026/);
    expect(formatContributionDate("2026-06-28", "zh")).not.toBe(
      "Jun 28, 2026",
    );
  });
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
  it("uses the public contributions API on share pages and when WS is down", () => {
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
  it("maps the public contributions calendar and last-year total", () => {
    const card = parsePublicGithubUserCard(
      {
        total: { lastYear: 42 },
        contributions: [
          { date: "2026-01-01", count: 2, level: 1 },
          { date: "2026-01-02", count: 5, level: 3 },
        ],
      },
      "octocat",
    );
    expect(card).toEqual({
      login: "octocat",
      name: null,
      avatar_url: "https://github.com/octocat.png",
      total_contributions: 42,
      contributions: [
        { date: "2026-01-01", count: 2, level: 1 },
        { date: "2026-01-02", count: 5, level: 3 },
      ],
    });
  });

  it("keeps the last 119 days and ignores future dates", () => {
    const today = new Date();
    const future = new Date(today);
    future.setUTCDate(future.getUTCDate() + 3);
    const contributions = Array.from({ length: 130 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 0, 1));
      date.setUTCDate(date.getUTCDate() + index);
      return {
        date: date.toISOString().slice(0, 10),
        count: 1,
        level: 1,
      };
    });
    contributions.push({
      date: future.toISOString().slice(0, 10),
      count: 9,
      level: 4,
    });

    const card = parsePublicGithubUserCard(
      { total: { lastYear: 130 }, contributions },
      "builder",
    );
    expect(card.login).toBe("builder");
    expect(card.contributions).toHaveLength(119);
    expect(card.contributions[0]?.date).toBe("2026-01-12");
    expect(
      card.contributions.some(
        (day) => day.date === future.toISOString().slice(0, 10),
      ),
    ).toBe(false);
  });
});

describe("fetchPublicGithubUserCard", () => {
  it("calls the public contributions API, not api.github.com", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          total: { lastYear: 7 },
          contributions: [{ date: "2026-08-01", count: 7, level: 2 }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const card = await fetchPublicGithubUserCard("@octocat");
    expect(calls).toEqual([
      `${PUBLIC_GITHUB_CONTRIBUTIONS_API}/octocat?y=last`,
    ]);
    expect(card.login).toBe("octocat");
    expect(card.total_contributions).toBe(7);
    expect(card.contributions).toEqual([
      { date: "2026-08-01", count: 7, level: 2 },
    ]);
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
