import { afterEach, describe, expect, test } from "bun:test";

import {
  __resetBrowserContextUrlFocusForTests,
  clearBrowserContextUrlFocus,
  hasBrowserContextUrlFocus,
  requestBrowserContextUrlFocus,
} from "../browser-url-focus";

afterEach(() => {
  __resetBrowserContextUrlFocusForTests();
});

describe("browser-url-focus", () => {
  test("request stays until cleared so remounts can still focus", () => {
    requestBrowserContextUrlFocus("center-browser:abc");
    expect(hasBrowserContextUrlFocus("center-browser:abc")).toBe(true);
    expect(hasBrowserContextUrlFocus("center-browser:abc")).toBe(true);

    clearBrowserContextUrlFocus("center-browser:abc");
    expect(hasBrowserContextUrlFocus("center-browser:abc")).toBe(false);
  });

  test("ignores blank context ids", () => {
    requestBrowserContextUrlFocus("   ");
    expect(hasBrowserContextUrlFocus("")).toBe(false);
  });
});
