import { afterEach, describe, expect, test } from "bun:test";
import {
  __resetOAuthReturnContextForTests,
  buildHubOAuthCallbackURL,
  buildOAuthLandingQuery,
  inferOAuthCallbackClient,
  isOAuthCallbackPath,
  oauthCallbackActionHref,
  parseOAuthCallbackClient,
  readOAuthReturnContext,
  resolveOAuthCallbackReturn,
  sanitizeOAuthReturnTo,
  storeOAuthReturnContext,
} from "../oauth-callback-return";

const ORIGIN = "https://app.atmos.land";

afterEach(() => {
  __resetOAuthReturnContextForTests();
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("oauth callback return helpers", () => {
  test("parses client and rejects unknown values", () => {
    expect(parseOAuthCallbackClient("desktop")).toBe("desktop");
    expect(parseOAuthCallbackClient("WEB")).toBe("web");
    expect(parseOAuthCallbackClient("mobile")).toBeNull();
  });

  test("sanitizes same-origin return paths and full URLs", () => {
    expect(sanitizeOAuthReturnTo("/settings?activeSettingTab=account", ORIGIN)).toBe(
      "/settings?activeSettingTab=account",
    );
    expect(
      sanitizeOAuthReturnTo("https://app.atmos.land/project?id=p1#files", ORIGIN),
    ).toBe("/project?id=p1#files");
  });

  test("rejects open redirects and callback landings as return_to", () => {
    expect(sanitizeOAuthReturnTo("https://evil.example/", ORIGIN)).toBeNull();
    expect(sanitizeOAuthReturnTo("//evil.example/phish", ORIGIN)).toBeNull();
    expect(sanitizeOAuthReturnTo("/hub-auth/done?provider=github", ORIGIN)).toBeNull();
    expect(
      sanitizeOAuthReturnTo("/integrations/linear/callback", ORIGIN),
    ).toBeNull();
    expect(isOAuthCallbackPath("/hub-auth/error/")).toBe(true);
  });

  test("infers desktop from the loopback bridge path or desktop build", () => {
    expect(
      inferOAuthCallbackClient({
        origin: "http://127.0.0.1:30303",
        pathname: "/hub-auth/bridge",
        desktopBuild: false,
      }),
    ).toBe("desktop");
    expect(
      inferOAuthCallbackClient({
        origin: ORIGIN,
        pathname: "/hub-auth/done",
        desktopBuild: false,
      }),
    ).toBe("web");
    expect(
      inferOAuthCallbackClient({
        origin: "http://127.0.0.1:30303",
        pathname: "/hub-auth/done",
        desktopBuild: true,
      }),
    ).toBe("desktop");
    expect(
      inferOAuthCallbackClient({
        origin: "http://127.0.0.1:39217",
        pathname: "/integrations/linear/callback",
        desktopBuild: false,
      }),
    ).toBe("desktop");
  });

  test("prefers explicit client/return_to over stored and inferred values", () => {
    expect(
      resolveOAuthCallbackReturn({
        clientParam: "web",
        returnToParam: "/settings",
        stored: { client: "desktop", returnTo: "/project" },
        origin: ORIGIN,
        pathname: "/hub-auth/done",
        desktopBuild: false,
      }),
    ).toEqual({ client: "web", returnTo: "/settings" });
  });

  test("falls back to stored context then home", () => {
    expect(
      resolveOAuthCallbackReturn({
        stored: { client: "web", returnTo: "/welcome" },
        origin: ORIGIN,
        pathname: "/integrations/linear/callback",
        desktopBuild: false,
      }),
    ).toEqual({ client: "web", returnTo: "/welcome" });
    expect(
      resolveOAuthCallbackReturn({
        origin: ORIGIN,
        pathname: "/hub-auth/done",
        desktopBuild: false,
      }),
    ).toEqual({ client: "web", returnTo: "/" });
  });

  test("desktop action uses atmos://open; web uses the return path", () => {
    expect(oauthCallbackActionHref({ client: "desktop", returnTo: "/x" })).toBe(
      "atmos://open",
    );
    expect(oauthCallbackActionHref({ client: "web", returnTo: "/settings" })).toBe(
      "/settings",
    );
  });

  test("landing query stamps client and web return_to", () => {
    expect(
      buildOAuthLandingQuery({
        provider: "github",
        client: "desktop",
        returnTo: "/settings",
      }),
    ).toBe("provider=github&client=desktop");
    expect(
      buildOAuthLandingQuery({
        provider: "google",
        client: "web",
        returnTo: "/settings?activeSettingTab=account",
      }),
    ).toBe(
      "provider=google&client=web&return_to=%2Fsettings%3FactiveSettingTab%3Daccount",
    );
  });

  test("desktop sign-in callback goes through Hub complete + loopback bridge", () => {
    const url = buildHubOAuthCallbackURL({
      origin: "http://127.0.0.1:30303",
      hub: "https://hub.atmos.land",
      provider: "github",
      mode: "sign-in",
      desktop: true,
    });
    expect(url.startsWith("https://hub.atmos.land/v1/desktop-auth/complete?")).toBe(
      true,
    );
    const returnTo = new URL(url).searchParams.get("return_to") ?? "";
    const landing = new URL(returnTo);
    expect(landing.origin).toBe("http://127.0.0.1:30303");
    expect(landing.pathname).toBe("/hub-auth/bridge");
    expect(landing.searchParams.get("provider")).toBe("github");
    expect(landing.searchParams.get("client")).toBe("desktop");
    expect(landing.searchParams.get("return_to")).toBeNull();
  });

  test("web sign-in and desktop link land on /hub-auth/done", () => {
    const web = buildHubOAuthCallbackURL({
      origin: "https://app.atmos.land",
      hub: "https://hub.atmos.land",
      provider: "google",
      mode: "sign-in",
      desktop: false,
      returnTo: "/settings?activeSettingTab=account",
    });
    const webUrl = new URL(web);
    expect(webUrl.pathname).toBe("/hub-auth/done");
    expect(webUrl.searchParams.get("client")).toBe("web");
    expect(webUrl.searchParams.get("return_to")).toBe(
      "/settings?activeSettingTab=account",
    );

    const desktopLink = buildHubOAuthCallbackURL({
      origin: "http://127.0.0.1:30303",
      hub: "https://hub.atmos.land",
      provider: "github",
      mode: "link",
      desktop: true,
    });
    const linkUrl = new URL(desktopLink);
    expect(linkUrl.pathname).toBe("/hub-auth/done");
    expect(linkUrl.searchParams.get("client")).toBe("desktop");
  });

  test("stores and reads Linear-style return context by state", () => {
    storeOAuthReturnContext("state-1", {
      client: "web",
      returnTo: "/settings",
    });
    expect(readOAuthReturnContext("state-1")).toEqual({
      client: "web",
      returnTo: "/settings",
    });
    expect(readOAuthReturnContext("missing")).toBeNull();
  });
});
