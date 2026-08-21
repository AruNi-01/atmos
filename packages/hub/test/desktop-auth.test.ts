import { describe, expect, test } from "bun:test";
import {
  appendCodeToReturnTo,
  isAllowedDesktopReturnTo,
} from "../src/desktop-auth";

describe("desktop-auth return_to allowlist", () => {
  test("allows local Atmos bridge URLs", () => {
    expect(
      isAllowedDesktopReturnTo("http://127.0.0.1:30303/hub-auth/bridge"),
    ).toBe(true);
    expect(
      isAllowedDesktopReturnTo("http://localhost:30303/hub-auth/bridge"),
    ).toBe(true);
    expect(
      isAllowedDesktopReturnTo(
        "http://127.0.0.1:30303/hub-auth/bridge?x=1",
      ),
    ).toBe(true);
  });

  test("rejects non-loopback and wrong paths", () => {
    expect(
      isAllowedDesktopReturnTo("https://evil.example/hub-auth/bridge"),
    ).toBe(false);
    expect(isAllowedDesktopReturnTo("http://127.0.0.1:30303/")).toBe(false);
    expect(
      isAllowedDesktopReturnTo("http://127.0.0.1:30303/settings"),
    ).toBe(false);
    expect(isAllowedDesktopReturnTo("not-a-url")).toBe(false);
  });

  test("appendCodeToReturnTo sets code query param", () => {
    const out = appendCodeToReturnTo(
      "http://127.0.0.1:30303/hub-auth/bridge",
      "abc123",
    );
    expect(out).toContain("code=abc123");
    expect(out.startsWith("http://127.0.0.1:30303/hub-auth/bridge")).toBe(
      true,
    );
  });
});
