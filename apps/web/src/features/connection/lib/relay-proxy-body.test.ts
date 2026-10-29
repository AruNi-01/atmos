import { describe, expect, it } from "bun:test";

import { parseRelayJsonBody, responseNeverReachedRelay } from "./relay-proxy-body";

describe("parseRelayJsonBody", () => {
  it("keeps Relay JSON errors", () => {
    expect(parseRelayJsonBody('{"error":"bad_client_token"}')).toEqual({
      error: "bad_client_token",
    });
  });

  it("treats an empty body as an empty object", () => {
    expect(parseRelayJsonBody("  ")).toEqual({});
  });

  it("rejects a Cloudflare challenge page", () => {
    const html = "<!DOCTYPE html><html><title>Just a moment...</title></html>";
    expect(parseRelayJsonBody(html)).toBeNull();
    expect(responseNeverReachedRelay(`relay register failed (403 Forbidden): ${html}`)).toBe(true);
  });

  it("does not treat a Relay JSON failure as an edge block", () => {
    expect(responseNeverReachedRelay('{"error":"invalid_register_token"}')).toBe(false);
  });
});
