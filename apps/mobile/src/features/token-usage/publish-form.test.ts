// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  normalizePublishHandle,
  publishBaselineFromPage,
  publishDraftDirty,
  publishFormAfterPage,
  publishFormAfterSave,
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

  test("blocks publish until the handle matches the hub charset", () => {
    expect(
      publishPrimaryDisabled({
        busy: false,
        claimed: false,
        draft: { ...draft, handle: "ab" },
        hasOverview: true,
        pageLoaded: true,
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
        pageLoaded: true,
        live: false,
        saved: null,
      }),
    ).toBe(false);
    expect(
      publishPrimaryDisabled({
        busy: false,
        claimed: false,
        draft: { ...draft, handle: "bad-name" },
        hasOverview: true,
        pageLoaded: true,
        live: false,
        saved: null,
      }),
    ).toBe(true);
    expect(
      publishPrimaryDisabled({
        busy: false,
        claimed: false,
        draft: { ...draft, handle: "has space" },
        hasOverview: true,
        pageLoaded: true,
        live: false,
        saved: null,
      }),
    ).toBe(true);
    expect(
      publishPrimaryDisabled({
        busy: false,
        claimed: false,
        draft: { ...draft, handle: "a".repeat(25) },
        hasOverview: true,
        pageLoaded: true,
        live: false,
        saved: null,
      }),
    ).toBe(true);
    expect(
      publishPrimaryDisabled({
        busy: false,
        claimed: false,
        draft: { ...draft, handle: "a".repeat(24) },
        hasOverview: true,
        pageLoaded: true,
        live: false,
        saved: null,
      }),
    ).toBe(false);
    expect(publishPrimaryLabel(false)).toBe("Publish");
  });

  test("stays disabled until the saved page request succeeds", () => {
    expect(
      publishPrimaryDisabled({
        busy: false,
        claimed: false,
        draft,
        hasOverview: true,
        pageLoaded: false,
        live: false,
        saved: null,
      }),
    ).toBe(true);
  });

  test("disables update when nothing changed", () => {
    expect(
      publishPrimaryDisabled({
        busy: false,
        claimed: true,
        draft,
        hasOverview: true,
        pageLoaded: true,
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
        pageLoaded: true,
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
        pageLoaded: true,
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
        pageLoaded: true,
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
        pageLoaded: true,
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
        pageLoaded: true,
        live: true,
        saved,
      }),
    ).toBe(true);
  });

  test("keeps an edited draft when a later page arrives", () => {
    const baseline = publishBaselineFromPage({
      github_username: "atmos",
      handle: "builder",
      handle_claimed: false,
      visibility: "unlisted",
      x_username: "atmos",
    });
    const edited = { ...baseline.draft, x: "changed" };
    const refetched = publishFormAfterPage(
      { baseline, draft: edited },
      {
        github_username: "someone-else",
        handle: "builder",
        handle_claimed: false,
        visibility: "public",
        x_username: "atmos",
      },
    );
    expect(refetched.draft).toEqual(edited);
    expect(refetched.baseline).toBe(baseline);
  });

  test("copies a refetched page when nothing was edited", () => {
    const baseline = publishBaselineFromPage({
      github_username: "",
      handle: "builder",
      handle_claimed: true,
      visibility: "unlisted",
      x_username: "",
    });
    const refetched = publishFormAfterPage(
      { baseline, draft: baseline.draft },
      {
        github_username: "atmos",
        handle: "builder",
        handle_claimed: true,
        visibility: "public",
        x_username: "atmos",
      },
    );
    expect(refetched.draft).toEqual({
      github: "atmos",
      handle: "builder",
      visibility: "public",
      x: "atmos",
    });
  });

  test("treats a saved draft as clean so the next page can replace it", () => {
    const baseline = publishBaselineFromPage(null);
    const submitted: PublishDraft = {
      github: "atmos",
      handle: "builder",
      visibility: "public",
      x: "",
    };
    const saved = publishFormAfterSave({ baseline, draft: submitted }, submitted);
    expect(publishDraftDirty(saved.draft, saved.baseline)).toBe(false);
    const replaced = publishFormAfterPage(saved, {
      github_username: "next",
      handle: "builder",
      handle_claimed: false,
      visibility: "unlisted",
      x_username: "next",
    });
    expect(replaced.draft).toEqual({
      github: "next",
      handle: "builder",
      visibility: "unlisted",
      x: "next",
    });
    const edited = publishFormAfterSave(
      { baseline, draft: { ...submitted, x: "later" } },
      submitted,
    );
    expect(edited.draft.x).toBe("later");
    expect(edited.baseline).toBe(baseline);
  });

  test("stays disabled while busy or without an overview", () => {
    expect(
      publishPrimaryDisabled({
        busy: true,
        claimed: false,
        draft,
        hasOverview: true,
        pageLoaded: true,
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
        pageLoaded: true,
        live: false,
        saved: null,
      }),
    ).toBe(true);
  });
});
