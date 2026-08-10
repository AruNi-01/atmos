import { describe, expect, test } from "bun:test";
import {
  DEFAULT_RELAY_URL,
  normalizeRelayUrl,
  redactRelayUrl,
} from "./url";
import { isPlausibleDeviceCredential } from "./credential";

describe("normalizeRelayUrl", () => {
  test("defaults empty to production origin", () => {
    expect(normalizeRelayUrl("")).toBe(DEFAULT_RELAY_URL);
    expect(normalizeRelayUrl(null)).toBe(DEFAULT_RELAY_URL);
  });

  test("adds https and strips trailing slash", () => {
    expect(normalizeRelayUrl("relay.example/")).toBe("https://relay.example");
    expect(normalizeRelayUrl("http://localhost:8788/")).toBe(
      "http://localhost:8788",
    );
  });
});

describe("redactRelayUrl", () => {
  test("redacts token query params", () => {
    expect(
      redactRelayUrl("wss://relay.example/ws/client?server_id=s&token=secret"),
    ).toBe("wss://relay.example/ws/client?server_id=s&token=<redacted>");
  });
});

describe("isPlausibleDeviceCredential", () => {
  test("requires minimum length", () => {
    expect(isPlausibleDeviceCredential("short")).toBe(false);
    expect(isPlausibleDeviceCredential("x".repeat(32))).toBe(true);
  });
});
