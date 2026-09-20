import { describe, expect, it } from "bun:test";
import {
  __resetUrlDisplaysForTests,
  displayTextWithUrlTokens,
  expandUrlTokens,
  formatUrlToken,
  hostnameFromUrl,
  COMPOSER_HTTP_TEXT_CLASSNAME,
  HTTP_TEXT_LINK_CLASSNAME,
  isCompletePreviewUrl,
  parsePastedHttpUrl,
  parseUrlToken,
  splitTextWithHttpUrls,
  splitTextWithUrlTokens,
} from "@/shared/lib/link-preview";

describe("link preview tokens", () => {
  it("chips a standalone http(s) paste and expands back to the URL", () => {
    __resetUrlDisplaysForTests();
    const url = "https://payloadcms.com/docs/components";
    expect(parsePastedHttpUrl(`  ${url}  \n`)).toBe(url);
    const token = formatUrlToken(url);
    expect(parseUrlToken(token)).toBe(url);
    expect(expandUrlTokens(`see ${token} please`)).toBe(`see ${url} please`);
    expect(displayTextWithUrlTokens(`see ${url} please`)).toBe(`see ${token} please`);
    expect(splitTextWithUrlTokens(`see ${token} please`)).toEqual([
      { type: "text", value: "see " },
      { type: "url-chip", url },
      { type: "text", value: " please" },
    ]);
  });

  it("does not treat typed or incomplete URLs as chips", () => {
    expect(isCompletePreviewUrl("https://ex")).toBe(false);
    expect(isCompletePreviewUrl("streamdown:incomplete-link")).toBe(false);
    expect(isCompletePreviewUrl("https://payloadcms.com/docs")).toBe(true);
    expect(splitTextWithUrlTokens("see https://example.com")).toEqual([
      { type: "text", value: "see https://example.com" },
    ]);
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

  it("marks restored http links with a dashed underline", () => {
    expect(HTTP_TEXT_LINK_CLASSNAME).toContain("decoration-dashed");
    expect(HTTP_TEXT_LINK_CLASSNAME).toContain("hover:bg-muted");
    expect(COMPOSER_HTTP_TEXT_CLASSNAME).toContain("decoration-dashed");
    expect(COMPOSER_HTTP_TEXT_CLASSNAME).toContain("cursor-text");
    expect(COMPOSER_HTTP_TEXT_CLASSNAME).not.toContain("cursor-pointer");
  });
});
