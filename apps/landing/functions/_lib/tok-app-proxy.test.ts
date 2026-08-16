// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import {
  APP_ORIGIN,
  appUpstreamUrl,
  handleLandingRequest,
  isProxiedAppAssetPath,
  isTokPath,
  rewriteTokHtml,
} from "./tok-app-proxy";

describe("tok path matching", () => {
  it("matches vanity, leaderboard, and the bare /tok route", () => {
    expect(isTokPath("/tok")).toBe(true);
    expect(isTokPath("/tok/")).toBe(true);
    expect(isTokPath("/tok/leaderboard")).toBe(true);
    expect(isTokPath("/tok/@builder")).toBe(true);
    expect(isTokPath("/tok/@builder/")).toBe(true);
    expect(isTokPath("/token-usage")).toBe(false);
    expect(isTokPath("/")).toBe(false);
    expect(isTokPath("/changelog")).toBe(false);
  });

  it("only proxies Next and brand-icon prefixes as app assets", () => {
    expect(isProxiedAppAssetPath("/_next/static/chunks/app.js")).toBe(true);
    expect(isProxiedAppAssetPath("/ai-provider/grok.svg")).toBe(true);
    expect(isProxiedAppAssetPath("/agents/claude-code.svg")).toBe(true);
    expect(isProxiedAppAssetPath("/icon.svg")).toBe(false);
    expect(isProxiedAppAssetPath("/videos/demo.mp4")).toBe(false);
  });
});

describe("rewriteTokHtml", () => {
  it("rewrites script, stylesheet, and RSC /_next URLs to the app origin", () => {
    const html = [
      `<link href="/_next/static/chunks/a.css"/>`,
      `<script src="/_next/static/chunks/b.js"></script>`,
      `self.__next_f.push([1,"I[1,[\\"/_next/static/chunks/c.js\\"]]"])`,
    ].join("");
    const rewritten = rewriteTokHtml(html);
    expect(rewritten).toContain(`${APP_ORIGIN}/_next/static/chunks/a.css`);
    expect(rewritten).toContain(`${APP_ORIGIN}/_next/static/chunks/b.js`);
    expect(rewritten).toContain(`${APP_ORIGIN}/_next/static/chunks/c.js`);
    expect(rewritten).not.toContain('href="/_next/');
    expect(rewritten).not.toContain('src="/_next/');
    expect(rewritten).not.toContain('["/_next/');
  });
});

describe("appUpstreamUrl", () => {
  it("keeps the path, query, and unlisted secret on the app origin", () => {
    const request = new Request(
      "https://atmos.land/tok/@builder?k=secret&tab=cost",
    );
    expect(appUpstreamUrl(request).href).toBe(
      "https://app.atmos.land/tok/@builder?k=secret&tab=cost",
    );
  });
});

describe("handleLandingRequest", () => {
  it("proxies /tok HTML, rewrites assets, and does not 302", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = String(input);
      expect(url).toBe("https://app.atmos.land/tok/@builder?k=abc");
      return new Response(
        `<html><script src="/_next/static/x.js"></script></html>`,
        { headers: { "content-type": "text/html; charset=utf-8" } },
      );
    };
    try {
      const response = await handleLandingRequest({
        request: new Request("https://atmos.land/tok/@builder?k=abc"),
        next: async () => new Response("landing", { status: 200 }),
        env: { ASSETS: { fetch: async () => new Response("no", { status: 404 }) } },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      const body = await response.text();
      expect(body).toContain(`${APP_ORIGIN}/_next/static/x.js`);
      expect(body).not.toContain('src="/_next/');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("serves landing /_next assets locally and falls back to the app origin", async () => {
    const originalFetch = globalThis.fetch;
    let fetchedApp = false;
    globalThis.fetch = async () => {
      fetchedApp = true;
      return new Response("from-app", {
        status: 200,
        headers: { "content-type": "application/javascript" },
      });
    };
    try {
      const local = await handleLandingRequest({
        request: new Request("https://atmos.land/_next/static/landing.js"),
        next: async () => new Response("should-not-run"),
        env: {
          ASSETS: {
            fetch: async () =>
              new Response("landing-chunk", {
                status: 200,
                headers: { "content-type": "application/javascript" },
              }),
          },
        },
      });
      expect(await local.text()).toBe("landing-chunk");
      expect(fetchedApp).toBe(false);

      const missing = await handleLandingRequest({
        request: new Request("https://atmos.land/_next/static/web.js"),
        next: async () => new Response("should-not-run"),
        env: {
          ASSETS: { fetch: async () => new Response("no", { status: 404 }) },
        },
      });
      expect(fetchedApp).toBe(true);
      expect(await missing.text()).toBe("from-app");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("leaves marketing routes on the static landing site", async () => {
    const response = await handleLandingRequest({
      request: new Request("https://atmos.land/changelog"),
      next: async () => new Response("changelog", { status: 200 }),
      env: { ASSETS: { fetch: async () => new Response("no", { status: 404 }) } },
    });
    expect(await response.text()).toBe("changelog");
  });
});
