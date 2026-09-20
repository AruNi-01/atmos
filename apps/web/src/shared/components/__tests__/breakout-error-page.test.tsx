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

mock.module("@workspace/ui", () => ({
  cn: (...values: Array<string | false | null | undefined>) =>
    values.filter(Boolean).join(" "),
  Button: ({
    children,
    className,
    variant = "default",
    render,
    ...props
  }: {
    children?: React.ReactNode;
    className?: string;
    variant?: string;
    render?: React.ReactElement;
    [key: string]: unknown;
  }) => {
    const variantClass =
      variant === "default"
        ? "bg-primary"
        : variant === "ghost"
          ? "hover:bg-accent"
          : "";
    const mergedClass = [variantClass, className].filter(Boolean).join(" ");
    if (React.isValidElement(render)) {
      return React.cloneElement(
        render as React.ReactElement<Record<string, unknown>>,
        { className: mergedClass, ...props },
        children,
      );
    }
    return (
      <button type="button" className={mergedClass} {...props}>
        {children}
      </button>
    );
  },
}));

const {
  ATMOS_BRICK_COLS,
  ATMOS_BRICK_PATTERN,
  ATMOS_BRICK_ROWS,
  BALL_SPEED,
  BreakoutErrorPage,
} = await import("@/shared/components/breakout-error-page");

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
  it("uses a wide full-bleed ATMOS brick mask for 404 and 500 breakout art", () => {
    expect(ATMOS_BRICK_ROWS).toBe(9);
    expect(ATMOS_BRICK_COLS).toBe(43);
    expect(ATMOS_BRICK_PATTERN).toHaveLength(9);
    expect(ATMOS_BRICK_PATTERN.every((row) => row.length === 43)).toBe(true);
    expect(ATMOS_BRICK_PATTERN.every((row) => /^[.#]+$/.test(row))).toBe(true);

    // Letter slots: A(0-6) gap T(9-15) gap M(18-24) gap O(27-33) gap S(36-42)
    const letterSlices = (start: number) =>
      ATMOS_BRICK_PATTERN.map((row) => row.slice(start, start + 7));

    expect(letterSlices(0)).toEqual([
      "..###..",
      ".#...#.",
      "#.....#",
      "#.....#",
      "#######",
      "#.....#",
      "#.....#",
      "#.....#",
      "#.....#",
    ]);
    expect(letterSlices(9)).toEqual([
      "#######",
      "...#...",
      "...#...",
      "...#...",
      "...#...",
      "...#...",
      "...#...",
      "...#...",
      "...#...",
    ]);
    expect(letterSlices(18)).toEqual([
      "#.....#",
      "##...##",
      "#.#.#.#",
      "#..#..#",
      "#.....#",
      "#.....#",
      "#.....#",
      "#.....#",
      "#.....#",
    ]);
    expect(letterSlices(27)).toEqual([
      "..###..",
      ".#...#.",
      "#.....#",
      "#.....#",
      "#.....#",
      "#.....#",
      "#.....#",
      ".#...#.",
      "..###..",
    ]);
    expect(letterSlices(36)).toEqual([
      ".#####.",
      "#.....#",
      "#......",
      "#......",
      ".#####.",
      "......#",
      "......#",
      "#.....#",
      ".#####.",
    ]);
  });

  it("keeps a modestly faster initial ball speed", () => {
    expect(BALL_SPEED.wide.dx).toBeGreaterThan(5.2);
    expect(Math.abs(BALL_SPEED.wide.dy)).toBeGreaterThan(5.4);
    expect(BALL_SPEED.narrow.dx).toBeGreaterThan(4.1);
    expect(Math.abs(BALL_SPEED.narrow.dy)).toBeGreaterThan(4.7);
    // Not extreme — stay under arcade-chaos speeds.
    expect(BALL_SPEED.wide.dx).toBeLessThan(9);
    expect(Math.abs(BALL_SPEED.wide.dy)).toBeLessThan(10);
  });

  it("positions the overlay higher under the brick field (full opacity when ready)", () => {
    const container = renderErrorPage(<BreakoutErrorPage kind="notFound" />);
    const overlay = container.querySelector("[data-breakout-overlay]");

    expect(overlay?.getAttribute("data-playing")).toBe("false");
    expect(overlay?.className).toContain("top-[44%]");
    expect(overlay?.className).toContain("sm:top-[58%]");
    expect(overlay?.className).toContain("transition-opacity");
    expect(overlay?.className.includes("opacity-[0.18]")).toBe(false);
  });

  it("wires playing-state fade classes for button hover restore", async () => {
    // Static markup cannot drive the canvas loop; assert the dimming contract
    // is present so hover-on-action can restore opacity while playing.
    const source = await Bun.file(
      new URL("../breakout-error-page.tsx", import.meta.url),
    ).text();

    expect(source).toContain('status === "playing"');
    expect(source).toContain("opacity-[0.18]");
    expect(source).toContain("has-[[data-error-action]:hover]:opacity-100");
    expect(source).toContain('data-playing={isPlaying ? "true" : "false"}');
  });

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
