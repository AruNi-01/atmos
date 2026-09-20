// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, describe, expect, it } from "bun:test";
import {
  fetchPublicXUserCard,
  formatXCount,
  formatXJoinedDate,
  normalizeXUsername,
  parsePublicXUserCard,
  PUBLIC_X_USER_API,
  upgradeXAvatarUrl,
} from "@/features/x/lib/public-x-user-card";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const sampleBody = {
  code: 200,
  message: "OK",
  user: {
    screen_name: "srbh_here",
    name: "Saurabh Sharma",
    description: "Designer and Developer",
    location: "127.0.0.1",
    banner_url: "https://pbs.twimg.com/profile_banners/1/2",
    avatar_url:
      "https://pbs.twimg.com/profile_images/1/zsBLZA-__normal.jpg",
    joined: "Sat Jan 06 16:40:44 +0000 2024",
    following: 321,
    followers: 1_250_000,
    website: { url: "https://srbh.site", display_url: "srbh.site" },
  },
};

describe("normalizeXUsername", () => {
  it("strips @, URLs, and trailing slashes", () => {
    expect(normalizeXUsername(" @srbh_here ")).toBe("srbh_here");
    expect(normalizeXUsername("https://x.com/srbh_here")).toBe("srbh_here");
    expect(normalizeXUsername("twitter.com/srbh_here/")).toBe("srbh_here");
    expect(normalizeXUsername("https://x.com/srbh_here/status/1")).toBe(
      "srbh_here",
    );
    expect(normalizeXUsername("")).toBeNull();
    expect(normalizeXUsername("not valid")).toBeNull();
  });
});

describe("upgradeXAvatarUrl", () => {
  it("requests the larger Twitter avatar size", () => {
    expect(
      upgradeXAvatarUrl(
        "https://pbs.twimg.com/profile_images/1/photo_normal.jpg",
      ),
    ).toBe("https://pbs.twimg.com/profile_images/1/photo_400x400.jpg");
  });
});

describe("formatXJoinedDate", () => {
  it("formats Twitter joined timestamps in the app locale", () => {
    expect(formatXJoinedDate("Sat Jan 06 16:40:44 +0000 2024", "en")).toBe(
      "January 2024",
    );
    expect(formatXJoinedDate("not-a-date", "en")).toBeNull();
  });
});

describe("formatXCount", () => {
  it("uses compact notation", () => {
    expect(formatXCount(321, "en")).toBe("321");
    expect(formatXCount(1_250_000, "en")).toBe("1.3M");
  });
});

describe("parsePublicXUserCard", () => {
  it("maps the FxTwitter user payload", () => {
    const card = parsePublicXUserCard(sampleBody, "fallback");
    expect(card).toEqual({
      username: "srbh_here",
      name: "Saurabh Sharma",
      avatar_url:
        "https://pbs.twimg.com/profile_images/1/zsBLZA-__400x400.jpg",
      banner_url: "https://pbs.twimg.com/profile_banners/1/2",
      bio: "Designer and Developer",
      following: 321,
      followers: 1_250_000,
      joined: "Sat Jan 06 16:40:44 +0000 2024",
      location: "127.0.0.1",
      website: { url: "https://srbh.site", display_url: "srbh.site" },
    });
  });

  it("rejects missing or non-200 payloads", () => {
    expect(() => parsePublicXUserCard({ code: 404 }, "missing")).toThrow(
      "X user 'missing' not found",
    );
    expect(() => parsePublicXUserCard(null, "x")).toThrow(
      "Invalid X user payload",
    );
  });
});

describe("fetchPublicXUserCard", () => {
  it("calls FxTwitter, not api.x.com", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify(sampleBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const card = await fetchPublicXUserCard("@srbh_here");
    expect(calls).toEqual([`${PUBLIC_X_USER_API}/srbh_here`]);
    expect(card.username).toBe("srbh_here");
    expect(card.followers).toBe(1_250_000);
  });

  it("rejects blank or invalid usernames", async () => {
    await expect(fetchPublicXUserCard("")).rejects.toThrow(
      "X username is required",
    );
    await expect(fetchPublicXUserCard("not valid")).rejects.toThrow(
      "X username is required",
    );
  });
});
