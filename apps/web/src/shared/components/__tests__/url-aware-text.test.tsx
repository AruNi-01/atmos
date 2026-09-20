// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@/shared/components/follow-hover-card", () => ({
  FollowHoverCard: ({ children }: { children: React.ReactNode }) => children,
}));

mock.module("@/shared/components/composer-link-og-preview", () => ({
  ComposerLinkOgPreview: () => null,
}));

mock.module("@/shared/lib/link-preview-query", () => ({
  fetchLinkPreview: async () => {
    throw new Error("offline");
  },
  peekLinkPreview: () => null,
}));

const {
  UrlAwareText,
  linkifyReactChildren,
  withLinkifiedMarkdownComponents,
} = await import("@/shared/components/url-aware-text");

describe("UrlAwareText", () => {
  it("keeps typed user URLs as links instead of chips", () => {
    const html = renderToStaticMarkup(
      <UrlAwareText text="see https://example.com/a please" />,
    );
    expect(html).not.toContain("data-url-chip");
    expect(html).toContain("data-http-text-link");
    expect(html).toContain("https://example.com/a");
    expect(html).toContain("see ");
    expect(html).toContain(" please");
  });

  it("chips complete URLs in agent output", () => {
    const html = renderToStaticMarkup(
      <UrlAwareText chipCompleteUrls text="see https://example.com/a please" />,
    );
    expect(html).toContain("data-url-chip");
    expect(html).toContain("example.com");
    expect(html).not.toContain("data-http-text-link");
  });

  it("leaves plain text unchanged", () => {
    expect(renderToStaticMarkup(<UrlAwareText text="no links here" />)).toBe(
      "no links here",
    );
  });
});

describe("linkifyReactChildren", () => {
  it("chips nested complete markdown URLs and skips code", () => {
    const html = renderToStaticMarkup(
      <>
        {linkifyReactChildren(
          <p>
            go https://atmos.land
            <code>https://example.com/secret</code>
          </p>,
        )}
      </>,
    );
    expect(html).toContain("data-url-chip");
    expect(html).toContain("atmos.land");
    expect(html).toContain("<code>https://example.com/secret</code>");
    expect(html.match(/data-url-chip/g)?.length).toBe(1);
  });
});

describe("withLinkifiedMarkdownComponents", () => {
  it("wraps paragraph components so bare URLs become chips", () => {
    const components = withLinkifiedMarkdownComponents({});
    const Paragraph = components.p;
    const html = renderToStaticMarkup(
      <Paragraph>read https://payloadcms.com/docs</Paragraph>,
    );
    expect(html).toContain("<p>");
    expect(html).toContain("data-url-chip");
    expect(html).toContain("payloadcms.com");
  });
});
