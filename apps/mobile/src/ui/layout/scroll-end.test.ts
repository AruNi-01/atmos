// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { sessionListDistanceFromEnd, sessionListShouldRequestNextPage } from "./scroll-end";

function decide(input: {
  contentHeight: number;
  offsetY: number;
  viewportHeight: number;
  armed: boolean;
  fillWhenShort?: boolean;
  insetBottom?: number;
}) {
  return sessionListShouldRequestNextPage({
    armed: input.armed,
    contentHeight: input.contentHeight,
    distanceFromEnd: sessionListDistanceFromEnd(input),
    fillWhenShort: input.fillWhenShort,
    viewportHeight: input.viewportHeight,
  });
}

describe("session list scroll end", () => {
  test("a short list does not ask until its total says more rows exist", () => {
    const idle = decide({
      armed: true,
      contentHeight: 420,
      offsetY: -140,
      viewportHeight: 700,
    });
    expect(idle).toEqual({ armed: true, request: false });

    const first = decide({
      armed: true,
      contentHeight: 420,
      fillWhenShort: true,
      offsetY: -140,
      viewportHeight: 700,
    });
    expect(first).toEqual({ armed: false, request: true });

    const stillShort = decide({
      armed: first.armed,
      contentHeight: 420,
      fillWhenShort: true,
      offsetY: -140,
      viewportHeight: 700,
    });
    expect(stillShort).toEqual({ armed: false, request: false });
  });

  test("a long list at rest does not ask", () => {
    const decision = decide({
      armed: true,
      contentHeight: 1800,
      offsetY: -140,
      viewportHeight: 700,
    });
    expect(decision).toEqual({ armed: true, request: false });
  });

  test("stopping short of the end does not ask", () => {
    const decision = decide({
      armed: true,
      contentHeight: 1800,
      offsetY: 1000,
      viewportHeight: 700,
    });
    expect(decision.request).toBe(false);
  });

  test("scrolling to the end asks once, and staying there does not ask again", () => {
    const first = decide({
      armed: true,
      contentHeight: 1800,
      insetBottom: 80,
      offsetY: 1100,
      viewportHeight: 700,
    });
    expect(first).toEqual({ armed: false, request: true });

    const stillThere = decide({
      armed: first.armed,
      contentHeight: 1800,
      insetBottom: 80,
      offsetY: 1100,
      viewportHeight: 700,
    });
    expect(stillThere).toEqual({ armed: false, request: false });
  });

  test("scrolling away arms the next visit to the end", () => {
    const away = decide({
      armed: false,
      contentHeight: 2200,
      offsetY: 400,
      viewportHeight: 700,
    });
    expect(away).toEqual({ armed: true, request: false });

    const back = decide({
      armed: away.armed,
      contentHeight: 2200,
      offsetY: 1500,
      viewportHeight: 700,
    });
    expect(back).toEqual({ armed: false, request: true });
  });

  test("an unmeasured list does not ask and does not arm", () => {
    expect(sessionListDistanceFromEnd({ contentHeight: 0, offsetY: 0, viewportHeight: 700 })).toBeNull();
    const decision = sessionListShouldRequestNextPage({
      armed: false,
      contentHeight: 0,
      distanceFromEnd: null,
      viewportHeight: 700,
    });
    expect(decision).toEqual({ armed: false, request: false });
  });
});
