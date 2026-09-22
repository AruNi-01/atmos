export type SessionPrState = "open" | "draft" | "merged" | "closed";

export type BranchPrLike = {
  number: number;
  head_ref?: string | null;
  headRefName?: string | null;
  state?: string | null;
  is_draft?: boolean | null;
  isDraft?: boolean | null;
};

export type BranchPrPick = {
  number: number;
  prState: SessionPrState;
};

export type BranchPrLookup = {
  prs?: BranchPrLike[] | null;
  error?: unknown;
};

function nonempty(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Strip refs/heads/ and origin/ so worktree and remote names still match. */
export function normalizeGitBranchName(branch: string | null | undefined): string {
  return (branch ?? "")
    .trim()
    .replace(/^refs\/heads\//i, "")
    .replace(/^origin\//i, "");
}

function headNameOf(pr: BranchPrLike): string {
  return normalizeGitBranchName(pr.head_ref || pr.headRefName);
}

function displayPrState(pr: BranchPrLike): SessionPrState | null {
  if (pr.is_draft === true || pr.isDraft === true) return "draft";
  const state = (pr.state ?? "").trim().toLowerCase();
  if (state === "open" || state === "merged" || state === "closed") return state;
  return null;
}

/**
 * Highest PR number whose head ref equals `branch`.
 * Draft is the displayed state when that winning PR is a draft.
 */
export function pickBranchPr(
  prs: BranchPrLike[] | null | undefined,
  branch: string | null | undefined,
): BranchPrPick | null {
  const head = normalizeGitBranchName(branch);
  if (!head || !Array.isArray(prs) || prs.length === 0) return null;

  const matches = prs.filter((pr) => headNameOf(pr) === head);
  if (matches.length === 0) return null;

  let best = matches[0]!;
  for (const pr of matches.slice(1)) {
    if (Number(pr.number) > Number(best.number)) best = pr;
  }

  const prState = displayPrState(best);
  if (!prState) return null;
  const number = Number(best.number);
  if (!Number.isFinite(number)) return null;
  return { number, prState };
}

/** Accepts the snake_case DTO and the camelCase `gh pr list` payload. */
export function branchPrsFromPayload(value: unknown): BranchPrLike[] | null {
  if (!Array.isArray(value)) return null;
  const prs: BranchPrLike[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const number = Number(record.number);
    if (!Number.isFinite(number)) continue;
    prs.push({
      number,
      head_ref: stringField(record.head_ref),
      headRefName: stringField(record.headRefName),
      state: stringField(record.state),
      is_draft: booleanField(record.is_draft),
      isDraft: booleanField(record.isDraft),
    });
  }
  return prs;
}

function stringField(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function booleanField(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** Empty list and a failed lookup both omit the PR. */
export function pickBranchPrFromLookup(
  lookup: BranchPrLookup | null | undefined,
  branch: string | null | undefined,
): BranchPrPick | null {
  if (lookup == null || lookup.error != null) return null;
  return pickBranchPr(lookup.prs, branch);
}

/**
 * Owner and repo come from the stored GitHub link when those fields are set,
 * otherwise from git status. The stored PR state is not an input.
 */
export function branchPrTarget(input: {
  branch?: string | null;
  storedOwner?: string | null;
  storedRepo?: string | null;
  gitOwner?: string | null;
  gitRepo?: string | null;
}): { owner: string; repo: string; branch: string } | null {
  const branch = normalizeGitBranchName(input.branch);
  if (!branch) return null;
  const owner = nonempty(input.storedOwner) ?? nonempty(input.gitOwner);
  const repo = nonempty(input.storedRepo) ?? nonempty(input.gitRepo);
  if (!owner || !repo) return null;
  return { owner, repo, branch };
}
