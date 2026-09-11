import { describe, expect, it } from "bun:test";
import {
  expandUrlTokens,
  formatUrlToken,
  hostnameFromUrl,
  parsePastedHttpUrl,
  parseUrlToken,
  splitTextWithHttpUrls,
} from "@/shared/lib/link-preview";

describe("link preview tokens", () => {
  it("chips a standalone http(s) paste and expands back to the URL", () => {
    const url = "https://payloadcms.com/docs/components";
    expect(parsePastedHttpUrl(`  ${url}  \n`)).toBe(url);
    const token = formatUrlToken(url);
    expect(parseUrlToken(token)).toBe(url);
    expect(expandUrlTokens(`see ${token} please`)).toBe(`see ${url} please`);
  });

  it("does not chip mixed text pastes", () => {
    expect(parsePastedHttpUrl("see https://example.com")).toBeNull();
    expect(parsePastedHttpUrl("https://example.com\nhttps://atmos.land")).toBeNull();
    expect(parsePastedHttpUrl("not a url")).toBeNull();
    expect(parsePastedHttpUrl("javascript:alert(1)")).toBeNull();
  });

  it("splits inline http URLs out of plaintext", () => {
    expect(splitTextWithHttpUrls("see https://example.com/a, thanks")).toEqual([
      { type: "text", value: "see " },
      { type: "url", url: "https://example.com/a" },
      { type: "text", value: ", thanks" },
    ]);
  });

  it("uses the hostname as a fallback label", () => {
    expect(hostnameFromUrl("https://www.payloadcms.com/docs")).toBe("payloadcms.com");
  });
});
