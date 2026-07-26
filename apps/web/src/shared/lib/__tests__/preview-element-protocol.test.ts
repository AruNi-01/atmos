// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, describe, expect, it } from "bun:test";

import {
  __resetPreviewElementPayloadsForTests,
  expandPreviewElementTokens,
  parsePreviewElementProtocol,
  parsePreviewElementToken,
  previewElementChipLabel,
  registerPreviewElementPrompt,
  resolvePreviewElementPrompt,
  wrapPreviewElementClipboardText,
} from "../preview-element-protocol";

afterEach(() => {
  __resetPreviewElementPayloadsForTests();
});

const sampleBody = [
  "## Preview element",
  "- **Page**: `http://localhost:3000`",
  "- **Selector**: `button.submit`",
  "- **Tag**: `button`",
  "",
  "### Element text",
  "Save",
].join("\n");

describe("preview-element protocol", () => {
  it("wraps and parses clipboard text while keeping the AI body intact", () => {
    const clipboard = wrapPreviewElementClipboardText(sampleBody);
    expect(clipboard.startsWith("atmos://preview-element\n")).toBe(true);

    const parsed = parsePreviewElementProtocol(clipboard);
    expect(parsed?.promptText).toBe(sampleBody);
  });

  it("does not double-wrap already protocol-prefixed text", () => {
    const once = wrapPreviewElementClipboardText(sampleBody);
    expect(wrapPreviewElementClipboardText(once)).toBe(once);
  });

  it("accepts legacy unwrapped desktop runtime clipboard text", () => {
    const legacy = [
      "## Preview Element",
      "- **Page**: `https://example.com`",
      "- **Selector**: `#root`",
    ].join("\n");

    const parsed = parsePreviewElementProtocol(legacy);
    expect(parsed?.promptText).toBe(legacy);
  });

  it("registers chip tokens that expand back to the original prompt body", () => {
    const token = registerPreviewElementPrompt(sampleBody);
    expect(parsePreviewElementToken(token)).not.toBeNull();
    expect(resolvePreviewElementPrompt(token)).toBe(sampleBody);
    expect(expandPreviewElementTokens(`Review ${token} please`)).toBe(
      `Review ${sampleBody} please`,
    );
  });

  it("uses selector for chip label when present", () => {
    expect(previewElementChipLabel(sampleBody)).toBe("button.submit");
  });

  it("rejects unrelated markdown", () => {
    expect(
      parsePreviewElementProtocol("## Code snippet\n- **File**: `src/a.ts`"),
    ).toBeNull();
  });
});
