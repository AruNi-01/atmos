// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";

mock.module("next/font/local", () => ({
  default: () => ({ className: "", style: {}, variable: "" }),
}));

mock.module("geist/font/pixel", () => ({
  GeistPixelSquare: { className: "geist-pixel" },
}));

const { BreakoutErrorPage } = await import("@/shared/components/breakout-error-page");

function renderErrorPage(node: React.ReactElement): HTMLElement {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );

  const doc = new Window({ url: "https://app.atmos.local/workspace" }).document;
  doc.body.innerHTML = html;
  return doc.body as unknown as HTMLElement;
}

function actionKinds(container: HTMLElement): string[] {
  return [...container.querySelectorAll("[data-error-action]")].map(
    (node) => node.getAttribute("data-error-action") ?? "",
  );
}

describe("BreakoutErrorPage", () => {
  it("keeps a home escape on server errors alongside retry", () => {
    const container = renderErrorPage(
      <BreakoutErrorPage kind="server" onRetry={() => {}} />,
    );

    expect(actionKinds(container)).toEqual(["retry", "home"]);
    expect(container.textContent).toContain("Try again");
    expect(container.textContent).toContain("Go back home");
    expect(container.querySelector("[data-error-action='home']")?.tagName).toBe(
      "A",
    );
    expect(
      container.querySelector("[data-error-action='home']")?.getAttribute("href"),
    ).toBe("/");

    const retryClass =
      container.querySelector("[data-error-action='retry']")?.className ?? "";
    const homeClass =
      container.querySelector("[data-error-action='home']")?.className ?? "";
    expect(retryClass).toContain("bg-primary");
    expect(homeClass).toContain("hover:bg-accent");
    expect(homeClass).not.toContain("bg-primary");

    const code = [...container.querySelectorAll("div")].find((node) =>
      (node.textContent ?? "").trim() === "500",
    );
    expect(code?.className).toContain("geist-pixel");
    expect(retryClass).not.toContain("geist-pixel");
    expect(homeClass).not.toContain("geist-pixel");
  });

  it("still offers home when retry is unavailable", () => {
    const container = renderErrorPage(<BreakoutErrorPage kind="server" />);

    expect(actionKinds(container)).toEqual(["home"]);
  });

  it("keeps Chinese retry copy on the UI font, not the pixel display font", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="zh" messages={zhMessages} timeZone="UTC">
        <BreakoutErrorPage kind="server" onRetry={() => {}} />
      </NextIntlClientProvider>,
    );
    const doc = new Window({ url: "https://app.atmos.local/workspace" }).document;
    doc.body.innerHTML = html;
    const container = doc.body as unknown as HTMLElement;

    expect(container.textContent).toContain("重试");
    expect(container.textContent).toContain("返回首页");

    const retryClass =
      container.querySelector("[data-error-action='retry']")?.className ?? "";
    const homeClass =
      container.querySelector("[data-error-action='home']")?.className ?? "";
    expect(retryClass).not.toContain("geist-pixel");
    expect(homeClass).not.toContain("geist-pixel");
    expect(container.querySelector("main")?.className).not.toContain("geist-pixel");
  });

  it("keeps the 404 home link", () => {
    const container = renderErrorPage(<BreakoutErrorPage kind="notFound" />);

    expect(actionKinds(container)).toEqual(["home"]);
    expect(container.querySelector("a[href='/']")).not.toBeNull();
  });
});
