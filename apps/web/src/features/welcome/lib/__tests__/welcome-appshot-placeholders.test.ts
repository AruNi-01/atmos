// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it, mock } from "bun:test";

import type { ComposerAttachment } from "../../components/AttachmentBar";

mock.module("next/font/local", () => ({
  default: () => ({ className: "", style: {}, variable: "" }),
}));

mock.module("@/shared/components/ui/AtmosWordmark", () => ({
  AtmosWordmark: () => null,
}));

const { formatAppshotPrompt } = await import("@/features/appshot/lib/appshot-protocol");
const { resolvePromptPlaceholders } = await import("../welcome-page-helpers");

const timestamp = "1760000000000";

describe("Welcome Appshot prompt placeholders", () => {
  it("expands Appshot chips while keeping existing placeholder behavior", () => {
    const attachments: ComposerAttachment[] = [
      {
        id: "img-1",
        number: 1,
        ext: "png",
        filename: "img-1.png",
        blob: new Blob(["x"], { type: "image/png" }),
        objectUrl: "blob:img-1",
      },
    ];

    expect(
      resolvePromptPlaceholders(
        `Fix @issue#123 with @file:src/app.ts [#img-1] [#appshot:${timestamp}]`,
        attachments,
      ),
    ).toBe(
      [
        "Fix .atmos/context/requirement.md with src/app.ts .atmos/attachments/img-1.png",
        formatAppshotPrompt(timestamp),
      ].join(" "),
    );
  });

  it("leaves malformed Appshot chips untouched", () => {
    expect(resolvePromptPlaceholders("[#appshot:123]", [])).toBe("[#appshot:123]");
  });

  it("can expand Appshot chips while preserving image tokens for backend attachment resolution", () => {
    expect(resolvePromptPlaceholders(`Analyze [#img-1] [#appshot:${timestamp}]`, [])).toBe(
      `Analyze [#img-1] ${formatAppshotPrompt(timestamp)}`,
    );
  });
});
