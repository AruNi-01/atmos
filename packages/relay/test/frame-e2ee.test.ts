import { describe, expect, test } from "bun:test";
import { e2eeOpenEnvelope, parseClientFrameE2ee } from "../src/frame-e2ee";

describe("client frame E2EE handshake", () => {
  test("parses a valid offer and builds e2ee_open", () => {
    const eph = "A".repeat(43);
    const url = new URL(
      `https://relay.atmos.land/ws/client?e2ee=1&e2ee_alg=x25519-chacha20poly1305&eph_pk=${eph}`,
    );
    expect(parseClientFrameE2ee(url)).toEqual({ eph_pk: eph });
    expect(e2eeOpenEnvelope("sid-1", "terminal", eph)).toEqual({
      v: 1,
      stream: "terminal",
      kind: "e2ee_open",
      from: "client:sid-1",
      to: "server",
      body: JSON.stringify({
        v: 1,
        alg: "x25519-chacha20poly1305",
        eph_pk: eph,
      }),
    });
  });

  test("treats missing flag as plaintext and rejects a short eph", () => {
    expect(parseClientFrameE2ee(new URL("https://relay.atmos.land/ws/client"))).toBeNull();
    const bad = new URL(
      "https://relay.atmos.land/ws/terminal?e2ee=1&e2ee_alg=x25519-chacha20poly1305&eph_pk=short",
    );
    expect(parseClientFrameE2ee(bad)).toBe("invalid");
  });
});
