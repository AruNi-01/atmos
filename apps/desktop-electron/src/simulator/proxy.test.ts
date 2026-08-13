import { describe, expect, it } from "bun:test";
import {
  authorizeControlBearer,
  authorizeSessionToken,
  isAllowedUpstreamPath,
  parseProxyPath,
} from "./proxy.ts";

describe("simulator proxy allow-list", () => {
  it("parses session and invoke paths", () => {
    expect(parseProxyPath("/v1/health")).toEqual({ kind: "health" });
    expect(parseProxyPath("/v1/invoke")).toEqual({ kind: "invoke" });
    expect(parseProxyPath("/s/tok123/stream.avcc")).toEqual({
      kind: "session",
      token: "tok123",
      upstreamPath: "/stream.avcc",
    });
    expect(parseProxyPath("/forward?port=9")).toBeNull();
  });

  it("allows only listed upstream paths", () => {
    expect(isAllowedUpstreamPath("/stream.avcc")).toBe(true);
    expect(isAllowedUpstreamPath("/ws")).toBe(true);
    expect(isAllowedUpstreamPath("/health")).toBe(true);
    expect(isAllowedUpstreamPath("/exec")).toBe(false);
    expect(isAllowedUpstreamPath("/inspect-webkit")).toBe(false);
    expect(isAllowedUpstreamPath("/preview")).toBe(false);
  });

  it("refuses a wrong or absent session token", () => {
    expect(authorizeSessionToken("abc", "abc")).toBe(true);
    expect(authorizeSessionToken("abc", "zzz")).toBe(false);
    expect(authorizeSessionToken("", "abc")).toBe(false);
  });

  it("requires a Bearer control token", () => {
    expect(authorizeControlBearer("Bearer secret", "secret")).toBe(true);
    expect(authorizeControlBearer("Bearer nope", "secret")).toBe(false);
    expect(authorizeControlBearer(undefined, "secret")).toBe(false);
  });
});
