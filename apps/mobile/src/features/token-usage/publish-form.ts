export type PublishVisibility = "public" | "unlisted";

export type PublishDraft = {
  github: string;
  handle: string;
  visibility: PublishVisibility;
  x: string;
};

export type PublishSaved = {
  github: string | null;
  handle: string | null;
  handleClaimed: boolean;
  visibility: "off" | PublishVisibility;
  x: string | null;
} | null;

/** Server page fields the Publish form can copy. Null is the empty page. */
export type PublishPageSource = {
  github_username: string | null;
  handle: string | null;
  handle_claimed: boolean;
  visibility: string | null;
  x_username: string | null;
} | null;

export type PublishBaseline = {
  claimed: boolean;
  draft: PublishDraft;
};

export type PublishFormSync = {
  baseline: PublishBaseline;
  draft: PublishDraft;
};

export function normalizePublishHandle(raw: string) {
  return raw.trim().replace(/^@+/, "");
}

/** Hub `validateHandle`: lowercase, 3–24 chars, letters, digits, underscore. */
export function isPublishHandleValid(raw: string) {
  return /^[a-z0-9_]{3,24}$/.test(normalizePublishHandle(raw).toLowerCase());
}

export function isUsagePageLive(visibility: string | null | undefined) {
  return visibility === "public" || visibility === "unlisted";
}

export function publishPrimaryLabel(live: boolean) {
  return live ? "Update" : "Publish";
}

/** Update stays disabled until the draft differs from the saved page. */
export function publishPrimaryDisabled(input: {
  busy: boolean;
  claimed: boolean;
  draft: PublishDraft;
  hasOverview: boolean;
  live: boolean;
  /** False until the saved usage page request succeeds, including a null page. */
  pageLoaded: boolean;
  saved: PublishSaved;
}) {
  if (input.busy || !input.hasOverview || !input.pageLoaded) return true;
  if (!input.claimed && !isPublishHandleValid(input.draft.handle)) return true;
  if (!input.live) return false;

  const savedHandle = normalizePublishHandle(input.saved?.handle ?? "");
  const savedVisibility = input.saved?.visibility === "public" ? "public" : "unlisted";
  const handleDirty = !input.claimed && normalizePublishHandle(input.draft.handle) !== savedHandle;
  const visibilityDirty = input.draft.visibility !== savedVisibility;
  const githubDirty = input.draft.github.trim() !== (input.saved?.github ?? "").trim();
  const xDirty = input.draft.x.trim() !== (input.saved?.x ?? "").trim();
  return !(handleDirty || visibilityDirty || githubDirty || xDirty);
}

export function publishBaselineFromPage(page: PublishPageSource): PublishBaseline {
  return {
    claimed: Boolean(page?.handle_claimed && page.handle),
    draft: {
      github: page?.github_username ?? "",
      handle: page?.handle ?? "",
      visibility: page?.visibility === "public" ? "public" : "unlisted",
      x: page?.x_username ?? "",
    },
  };
}

/** True when the draft differs from the last snapshot copied into the form. */
export function publishDraftDirty(draft: PublishDraft, baseline: PublishBaseline) {
  const handleDirty =
    !baseline.claimed &&
    normalizePublishHandle(draft.handle) !== normalizePublishHandle(baseline.draft.handle);
  const visibilityDirty = draft.visibility !== baseline.draft.visibility;
  const githubDirty = draft.github.trim() !== baseline.draft.github.trim();
  const xDirty = draft.x.trim() !== baseline.draft.x.trim();
  return handleDirty || visibilityDirty || githubDirty || xDirty;
}

/**
 * Copy a refetched page into the form only when the user has not edited
 * since the last applied snapshot.
 */
export function publishFormAfterPage(
  form: PublishFormSync,
  page: PublishPageSource,
): PublishFormSync {
  if (publishDraftDirty(form.draft, form.baseline)) return form;
  const incoming = publishBaselineFromPage(page);
  return { baseline: incoming, draft: incoming.draft };
}

/** After a successful save, the submitted draft is the new clean snapshot. */
export function publishFormAfterSave(
  form: PublishFormSync,
  submitted: PublishDraft,
): PublishFormSync {
  const submittedBaseline: PublishBaseline = { claimed: form.baseline.claimed, draft: submitted };
  if (publishDraftDirty(form.draft, submittedBaseline)) return form;
  return { baseline: submittedBaseline, draft: form.draft };
}
