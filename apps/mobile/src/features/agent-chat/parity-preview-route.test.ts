// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { parityPreviewHref } from "./parity-preview-route";

describe("parity preview route", () => {
  test("leaves production routes alone", () => {
    expect(parityPreviewHref(undefined, "/")).toBeNull();
    expect(parityPreviewHref("0", "/")).toBeNull();
    expect(parityPreviewHref("", "/sign-in")).toBeNull();
  });

  test("sends the pair screen to preview-chat", () => {
    expect(parityPreviewHref("1", "/")).toBe("/preview-chat");
    expect(parityPreviewHref("1", "")).toBe("/preview-chat");
    expect(parityPreviewHref("1", "/(home)")).toBe("/preview-chat");
    expect(parityPreviewHref("1", "/(home)/(workspace)")).toBe("/preview-chat");
    expect(parityPreviewHref("1", "/sign-in")).toBe("/preview-chat");
  });

  test("keeps a preview deep link on its fixture", () => {
    expect(parityPreviewHref("1", "/preview-chat")).toBeNull();
    expect(parityPreviewHref("1", "/preview-chat?fixture=F1&theme=light")).toBeNull();
  });
});
