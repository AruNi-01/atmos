import { describe, expect, test } from "bun:test";
import {
  isAllowedOAuthCallbackURL,
  isAllowedOAuthMode,
  isAllowedOAuthProvider,
  oauthErrorCallbackURL,
  oauthStartAuthPath,
} from "../src/oauth-start";
import type { HubEnv } from "../src/env";

const env = {
  ALLOWED_ORIGINS:
    "http://localhost:3030,http://127.0.0.1:30303,https://app.atmos.land",
} as HubEnv;

describe("oauth-start allowlists", () => {
  test("providers", () => {
    expect(isAllowedOAuthProvider("github")).toBe(true);
    expect(isAllowedOAuthProvider("google")).toBe(true);
    expect(isAllowedOAuthProvider("facebook")).toBe(false);
  });

  test("modes", () => {
    expect(isAllowedOAuthMode("sign-in")).toBe(true);
    expect(isAllowedOAuthMode("link")).toBe(true);
    expect(isAllowedOAuthMode("")).toBe(true);
    expect(isAllowedOAuthMode("evil")).toBe(false);
    expect(oauthStartAuthPath("link")).toBe("/api/auth/link-social");
    expect(oauthStartAuthPath("sign-in")).toBe("/api/auth/sign-in/social");
    expect(oauthStartAuthPath("")).toBe("/api/auth/sign-in/social");
  });

  test("web callback origins", () => {
    expect(
      isAllowedOAuthCallbackURL(
        env,
        "https://app.atmos.land/settings",
        "https://hub.atmos.land",
      ),
    ).toBe(true);
    expect(
      isAllowedOAuthCallbackURL(
        env,
        "http://localhost:3030/",
        "https://hub.atmos.land",
      ),
    ).toBe(true);
    expect(
      isAllowedOAuthCallbackURL(
        env,
        "https://evil.example/",
        "https://hub.atmos.land",
      ),
    ).toBe(false);
  });

  test("desktop complete + loopback bridge", () => {
    const ok = isAllowedOAuthCallbackURL(
      env,
      "https://hub.atmos.land/v1/desktop-auth/complete?return_to=" +
        encodeURIComponent("http://127.0.0.1:30303/hub-auth/bridge"),
      "https://hub.atmos.land",
    );
    expect(ok).toBe(true);

    const badReturn = isAllowedOAuthCallbackURL(
      env,
      "https://hub.atmos.land/v1/desktop-auth/complete?return_to=" +
        encodeURIComponent("https://evil.example/"),
      "https://hub.atmos.land",
    );
    expect(badReturn).toBe(false);
  });

  test("error callback stays on app origin", () => {
    expect(
      oauthErrorCallbackURL(
        "https://app.atmos.land/hub-auth/done",
        "https://hub.atmos.land",
      ),
    ).toBe("https://app.atmos.land/hub-auth/error");
    expect(
      oauthErrorCallbackURL(
        "http://localhost:3030/hub-auth/done",
        "https://hub.atmos.land",
      ),
    ).toBe("http://localhost:3030/hub-auth/error");
    expect(
      oauthErrorCallbackURL(
        "https://hub.atmos.land/v1/desktop-auth/complete?return_to=" +
          encodeURIComponent("http://127.0.0.1:30303/hub-auth/bridge"),
        "https://hub.atmos.land",
      ),
    ).toBe("http://127.0.0.1:30303/hub-auth/error");
  });
});
