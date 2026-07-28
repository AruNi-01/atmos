import { describe, expect, it } from "bun:test";
import {
  buildShareUrl,
  createGatewaySession,
  GATEWAY_URL,
  statusFieldsForSession,
} from "./gateway.ts";

describe("tunnel gateway share/session DTOs", () => {
  it("creates entry_token session with expires_at", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const s = createGatewaySession({
      provider: "cloudflare",
      mode: "public",
      ttlSecs: 3600,
      now,
    });
    expect(s.entryToken.length).toBeGreaterThan(8);
    expect(s.expiresAt).toBe("2026-01-01T01:00:00.000Z");
    expect(s.provider).toBe("cloudflare");
  });

  it("buildShareUrl appends entry_token query", () => {
    expect(buildShareUrl("https://abc.trycloudflare.com", "tok123")).toBe(
      "https://abc.trycloudflare.com?entry_token=tok123",
    );
    expect(
      buildShareUrl("https://abc.trycloudflare.com?x=1", "tok123"),
    ).toBe("https://abc.trycloudflare.com?x=1&entry_token=tok123");
  });

  it("statusFieldsForSession populates gateway/share (not null stubs)", () => {
    const s = createGatewaySession({
      provider: "ngrok",
      mode: "public",
      ttlSecs: 120,
    });
    const fields = statusFieldsForSession(s, "https://x.ngrok-free.app");
    expect(fields.gateway_url).toBe(GATEWAY_URL);
    expect(fields.entry_token).toBe(s.entryToken);
    expect(fields.expires_at).toBeTruthy();
    expect(fields.share_url).toContain("entry_token=");
    expect(fields.share_url).toContain("https://x.ngrok-free.app");
  });
});
