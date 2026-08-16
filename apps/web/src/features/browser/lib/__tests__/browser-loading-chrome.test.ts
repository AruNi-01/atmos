import { describe, expect, it } from "bun:test";
import { isMainFrameDocumentNavigation } from "../browser-loading-chrome";

describe("isMainFrameDocumentNavigation", () => {
  it("accepts a top-level document load", () => {
    expect(isMainFrameDocumentNavigation({ isMainFrame: true, isInPlace: false })).toBe(true);
  });

  it("treats missing flags as a top-level document load", () => {
    expect(isMainFrameDocumentNavigation({})).toBe(true);
  });

  it("ignores iframe / subframe starts", () => {
    expect(isMainFrameDocumentNavigation({ isMainFrame: false, isInPlace: false })).toBe(false);
  });

  it("ignores in-place SPA / hash navigations", () => {
    expect(isMainFrameDocumentNavigation({ isMainFrame: true, isInPlace: true })).toBe(false);
  });
});
