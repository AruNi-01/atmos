// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { pngBase64FromDataUrl } from "./png-data-url";

describe("pngBase64FromDataUrl", () => {
  test("keeps the PNG payload", () => {
    expect(pngBase64FromDataUrl("data:image/png;base64,aGVsbG8=")).toBe("aGVsbG8=");
  });

  test("rejects a non-image payload", () => {
    expect(() => pngBase64FromDataUrl("https://example.test/card.png")).toThrow("Share card is not a PNG.");
  });
});
