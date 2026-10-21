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

export function normalizePublishHandle(raw: string) {
  return raw.trim().replace(/^@+/, "");
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
  saved: PublishSaved;
}) {
  if (input.busy || !input.hasOverview) return true;
  const handle = normalizePublishHandle(input.draft.handle);
  if (!input.claimed && handle.length < 3) return true;
  if (!input.live) return false;

  const savedHandle = normalizePublishHandle(input.saved?.handle ?? "");
  const savedVisibility = input.saved?.visibility === "public" ? "public" : "unlisted";
  const handleDirty = !input.claimed && handle !== savedHandle;
  const visibilityDirty = input.draft.visibility !== savedVisibility;
  const githubDirty = input.draft.github.trim() !== (input.saved?.github ?? "").trim();
  const xDirty = input.draft.x.trim() !== (input.saved?.x ?? "").trim();
  return !(handleDirty || visibilityDirty || githubDirty || xDirty);
}
