// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  normalizePublishHandle,
  publishPrimaryDisabled,
  publishPrimaryLabel,
  type PublishDraft,
  type PublishSaved,
} from "./publish-form";

const draft: PublishDraft = {
  github: "",
  handle: "builder",
  visibility: "unlisted",
  x: "",
};

const saved: PublishSaved = {
  github: "",
  handle: "builder",
  handleClaimed: true,
  visibility: "unlisted",
  x: "",
};

describe("publishPrimaryDisabled", () => {
  test("normalizes a typed handle", () => {
    expect(normalizePublishHandle("  @builder  ")).toBe("builder");
  });

  test("blocks publish until the handle is long enough", () => {
    expect(
      publishPrimaryDisabled({
        busy: false,
        claimed: false,
        draft: { ...draft, handle: "ab" },
        hasOverview: true,
        live: false,
        saved: null,
      }),
    ).toBe(true);
    expect(
      publishPrimaryDisabled({
        busy: false,
        claimed: false,
        draft: { ...draft, handle: "@abc" },
        hasOverview: true,
        live: false,
        saved: null,
      }),
    ).toBe(false);
    expect(publishPrimaryLabel(false)).toBe("Publish");
  });

  test("disables update when nothing changed", () => {
    expect(
      publishPrimaryDisabled({
        busy: false,
        claimed: true,
        draft,
        hasOverview: true,
        live: true,
        saved,
      }),
    ).toBe(true);
    expect(publishPrimaryLabel(true)).toBe("Update");
  });

  test("enables update when visibility, github, x, or an unclaimed handle changes", () => {
    expect(
      publishPrimaryDisabled({
        busy: false,
        claimed: true,
        draft: { ...draft, visibility: "public" },
        hasOverview: true,
        live: true,
        saved,
      }),
    ).toBe(false);
    expect(
      publishPrimaryDisabled({
        busy: false,
        claimed: true,
        draft: { ...draft, github: "atmos" },
        hasOverview: true,
        live: true,
        saved,
      }),
    ).toBe(false);
    expect(
      publishPrimaryDisabled({
        busy: false,
        claimed: true,
        draft: { ...draft, x: "atmos" },
        hasOverview: true,
        live: true,
        saved,
      }),
    ).toBe(false);
    expect(
      publishPrimaryDisabled({
        busy: false,
        claimed: false,
        draft: { ...draft, handle: "other" },
        hasOverview: true,
        live: true,
        saved: { ...saved!, handleClaimed: false },
      }),
    ).toBe(false);
  });

  test("ignores handle edits after the handle is claimed", () => {
    expect(
      publishPrimaryDisabled({
        busy: false,
        claimed: true,
        draft: { ...draft, handle: "other" },
        hasOverview: true,
        live: true,
        saved,
      }),
    ).toBe(true);
  });

  test("stays disabled while busy or without an overview", () => {
    expect(
      publishPrimaryDisabled({
        busy: true,
        claimed: false,
        draft,
        hasOverview: true,
        live: false,
        saved: null,
      }),
    ).toBe(true);
    expect(
      publishPrimaryDisabled({
        busy: false,
        claimed: false,
        draft,
        hasOverview: false,
        live: false,
        saved: null,
      }),
    ).toBe(true);
  });
});
