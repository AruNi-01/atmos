import { describe, expect, test } from "bun:test";

import { measureStickyFadeInsets } from "./scroll-area-fade";

const view = { top: 100, bottom: 500, left: 20, right: 320 };

describe("measureStickyFadeInsets", () => {
  test("ignores content that has not reached its sticky edge", () => {
    expect(
      measureStickyFadeInsets(view, [
        {
          top: 180,
          bottom: 220,
          left: 20,
          right: 320,
          stickyTop: 0,
          stickyBottom: null,
          stickyLeft: null,
          stickyRight: null,
        },
      ]),
    ).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });

  test("starts the top fade below a stuck toolbar", () => {
    expect(
      measureStickyFadeInsets(view, [
        {
          top: 100,
          bottom: 176,
          left: 20,
          right: 320,
          stickyTop: 0,
          stickyBottom: null,
          stickyLeft: null,
          stickyRight: null,
        },
      ]),
    ).toEqual({ top: 76, bottom: 0, left: 0, right: 0 });
  });

  test("starts the top fade below stacked sticky search + group headers", () => {
    expect(
      measureStickyFadeInsets(view, [
        {
          top: 100,
          bottom: 176,
          left: 20,
          right: 320,
          stickyTop: 0,
          stickyBottom: null,
          stickyLeft: null,
          stickyRight: null,
        },
        {
          top: 176,
          bottom: 216,
          left: 20,
          right: 320,
          stickyTop: 76,
          stickyBottom: null,
          stickyLeft: null,
          stickyRight: null,
        },
      ]),
    ).toEqual({ top: 116, bottom: 0, left: 0, right: 0 });
  });

  test("ignores a sticky header that has been pushed out", () => {
    expect(
      measureStickyFadeInsets(view, [
        {
          top: 60,
          bottom: 100,
          left: 20,
          right: 320,
          stickyTop: 0,
          stickyBottom: null,
          stickyLeft: null,
          stickyRight: null,
        },
      ]),
    ).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });

  test("starts the bottom fade above a stuck footer", () => {
    expect(
      measureStickyFadeInsets(view, [
        {
          top: 460,
          bottom: 500,
          left: 20,
          right: 320,
          stickyTop: null,
          stickyBottom: 0,
          stickyLeft: null,
          stickyRight: null,
        },
      ]),
    ).toEqual({ top: 0, bottom: 40, left: 0, right: 0 });
  });
});
