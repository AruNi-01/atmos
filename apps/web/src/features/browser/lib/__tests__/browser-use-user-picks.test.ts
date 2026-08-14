import { describe, expect, it } from "bun:test";

import { selectionInfoToBrowserUsePick } from "../browser-use-user-picks";

describe("selectionInfoToBrowserUsePick", () => {
  it("drops picks without a selector", () => {
    expect(
      selectionInfoToBrowserUsePick({
        filePath: "",
        startLine: 0,
        endLine: 0,
        selectedText: "hello",
      }),
    ).toBeNull();
  });

  it("keeps selector, note, and rect for /v1/state refs", () => {
    const pick = selectionInfoToBrowserUsePick(
      {
        filePath: "",
        startLine: 0,
        endLine: 0,
        selectedText: "Sign in",
        selector: "button.login",
        tagName: "button",
        previewRect: { x: 10, y: 20, width: 80, height: 24 },
      },
      { id: "ann-1", note: "primary CTA" },
    );
    expect(pick).toEqual({
      id: "ann-1",
      selector: "button.login",
      name: "Sign in",
      note: "primary CTA",
      tag: "button",
      rect: { x: 10, y: 20, width: 80, height: 24 },
    });
  });
});
