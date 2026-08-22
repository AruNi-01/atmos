import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hubProfileImageUrl,
  hubProfileUser,
} from "./hub-profile-user";

const settingsRoot = join(import.meta.dir, "..");

describe("hubProfileImageUrl", () => {
  test("keeps https GitHub and Google avatars", () => {
    expect(
      hubProfileImageUrl("https://avatars.githubusercontent.com/u/76934779?v=4"),
    ).toBe("https://avatars.githubusercontent.com/u/76934779?v=4");
    expect(
      hubProfileImageUrl(
        "https://lh3.googleusercontent.com/a/ACg8ocKexample",
      ),
    ).toBe("https://lh3.googleusercontent.com/a/ACg8ocKexample");
  });

  test("rejects empty, non-https, and invalid values", () => {
    expect(hubProfileImageUrl(null)).toBeUndefined();
    expect(hubProfileImageUrl("")).toBeUndefined();
    expect(hubProfileImageUrl("  ")).toBeUndefined();
    expect(hubProfileImageUrl("http://avatars.githubusercontent.com/u/1")).toBeUndefined();
    expect(hubProfileImageUrl("javascript:alert(1)")).toBeUndefined();
    expect(hubProfileImageUrl("not a url")).toBeUndefined();
  });
});

describe("hubProfileUser", () => {
  test("uses /v1/me avatar when there is no cookie session", () => {
    expect(
      hubProfileUser({
        cookieUser: null,
        me: {
          user_id: "u1",
          name: "AruNi_Lu",
          email: "hello@0x3f4.run",
          handle: "aarynlu",
          image: "https://avatars.githubusercontent.com/u/76934779?v=4",
        },
        fallbackName: "Signed in",
      }),
    ).toEqual({
      id: "u1",
      name: "AruNi_Lu",
      email: "hello@0x3f4.run",
      image: "https://avatars.githubusercontent.com/u/76934779?v=4",
    });
  });

  test("fills a missing cookie image from /v1/me", () => {
    expect(
      hubProfileUser({
        cookieUser: {
          id: "u1",
          name: "AruNi_Lu",
          email: "hello@0x3f4.run",
          image: null,
        },
        me: {
          user_id: "u1",
          image: "https://lh3.googleusercontent.com/a/photo",
        },
        fallbackName: "Signed in",
      })?.image,
    ).toBe("https://lh3.googleusercontent.com/a/photo");
  });

  test("prefers the cookie session image when both exist", () => {
    expect(
      hubProfileUser({
        cookieUser: {
          id: "u1",
          name: "AruNi_Lu",
          image: "https://avatars.githubusercontent.com/u/1?v=4",
        },
        me: {
          user_id: "u1",
          image: "https://lh3.googleusercontent.com/a/other",
        },
        fallbackName: "Signed in",
      })?.image,
    ).toBe("https://avatars.githubusercontent.com/u/1?v=4");
  });

  test("returns null when neither identity is present", () => {
    expect(
      hubProfileUser({
        cookieUser: null,
        me: null,
        fallbackName: "Signed in",
      }),
    ).toBeNull();
  });
});

describe("account profile avatar wiring", () => {
  test("Account settings pass /v1/me image into UserView", () => {
    const source = readFileSync(
      join(settingsRoot, "components/AccountSettingsSection.tsx"),
      "utf8",
    );
    expect(source).toContain("hubProfileUser");
    expect(source).not.toContain("image: undefined as string | undefined");
  });

  test("Auth UI renders OAuth avatars as no-referrer imgs", () => {
    const source = readFileSync(
      join(settingsRoot, "components/HubAuthUIProvider.tsx"),
      "utf8",
    );
    expect(source).toContain("referrerPolicy=\"no-referrer\"");
    expect(source).toContain("avatar={{ Image: HubAvatarImage }}");
  });
});
