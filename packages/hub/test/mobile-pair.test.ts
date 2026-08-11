import { describe, expect, test } from "bun:test";
import {
  buildMobilePairQrValue,
  parseMobilePairQrValue,
} from "../src/mobile-pair";
import { isAllowedMobileReturnTo } from "../src/desktop-auth";

describe("mobile pair QR payload", () => {
  test("round-trips JSON qr_value", () => {
    const qr = buildMobilePairQrValue({
      pairCode: "aabbccddeeff00112233445566778899",
      hubOrigin: "https://hub.atmos.land/",
      expiresAt: 1_700_000_000,
    });
    const parsed = parseMobilePairQrValue(qr);
    expect(parsed).toEqual({
      code: "aabbccddeeff00112233445566778899",
      hub: "https://hub.atmos.land",
    });
  });

  test("parses atmos deep link", () => {
    const parsed = parseMobilePairQrValue(
      "atmos://pair?code=aabbccddeeff00112233445566778899&hub=https%3A%2F%2Fhub.atmos.land",
    );
    expect(parsed?.code).toBe("aabbccddeeff00112233445566778899");
    expect(parsed?.hub).toBe("https://hub.atmos.land");
  });

  test("parses raw hex code", () => {
    const code = "aabbccddeeff00112233445566778899";
    expect(parseMobilePairQrValue(code)).toEqual({ code });
  });
});

describe("mobile OAuth return_to allowlist", () => {
  test("allows atmos hub-auth callback", () => {
    expect(isAllowedMobileReturnTo("atmos://hub-auth/callback")).toBe(true);
    expect(
      isAllowedMobileReturnTo("atmos://hub-auth/callback?state=1"),
    ).toBe(true);
  });

  test("rejects arbitrary deep links", () => {
    expect(isAllowedMobileReturnTo("atmos://evil")).toBe(false);
    expect(isAllowedMobileReturnTo("https://evil.example/callback")).toBe(
      false,
    );
  });
});
