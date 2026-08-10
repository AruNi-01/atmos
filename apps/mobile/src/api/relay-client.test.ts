// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { createRelayClient, normalizeRelayUrl } from "@/api/relay-client";

/** Smoke: mobile re-exports shared package surface. */
describe("mobile relay-client re-export", () => {
  test("exports createRelayClient and normalizeRelayUrl", () => {
    expect(typeof createRelayClient).toBe("function");
    expect(normalizeRelayUrl("relay.example/")).toBe("https://relay.example");
  });
});
