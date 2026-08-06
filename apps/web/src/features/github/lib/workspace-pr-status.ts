import type { GithubPrPayload } from "@/api/ws/github-api";
import type { StatusCheck } from "@/features/github/lib/pr-detail-parts";

/**
 * PR lifecycle for leading icons — matches GitHub’s four states
 * (open / draft / closed / merged).
 */
export type WorkspacePrLifecycleState = "open" | "draft" | "closed" | "merged";

/**
 * Icon color driven by checks (applied mainly to open PRs):
 * - success → green
 * - failure → red
 * - running → yellow/amber
 * - neutral → use lifecycle default (open green / draft gray / …)
 */
export type WorkspacePrChecksTone = "success" | "failure" | "running" | "neutral";

export type WorkspacePrPresentation = {
  owner: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  state: WorkspacePrLifecycleState;
  isDraft: boolean;
  checks: StatusCheck[];
  checksTone: WorkspacePrChecksTone;
  checksRunning: boolean;
};

type BranchPrLike = {
  number?: number;
  state?: string;
  title?: string;
  url?: string;
  isDraft?: boolean;
};

type PrDetailLike = {
  state?: string;
  title?: string;
  url?: string;
  isDraft?: boolean;
  statusCheckRollup?: StatusCheck[] | null;
};

/**
 * Normalize GitHub PR state + draft flag into the four UI lifecycle icons.
 * Draft only applies while the PR is still open (GitHub’s model).
 */
export function normalizePrLifecycleState(
  state: string | null | undefined,
  isDraft?: boolean,
): WorkspacePrLifecycleState {
  const normalized = String(state ?? "").toUpperCase();
  if (normalized === "MERGED") return "merged";
  if (normalized === "CLOSED") return "closed";
  if (isDraft) return "draft";
  return "open";
}

/** Map a single GitHub status check to ring/icon buckets. */
export function toneForStatusCheck(check: StatusCheck): "success" | "running" | "neutral" | "failure" {
  const state = (check.state || "").toUpperCase();
  const conclusion = (check.conclusion || "").toUpperCase();
  const status = (check.status || "").toUpperCase();

  if (
    state === "FAILURE" ||
    state === "ERROR" ||
    conclusion === "FAILURE" ||
    conclusion === "ERROR" ||
    conclusion === "ACTION_REQUIRED" ||
    conclusion === "TIMED_OUT" ||
    conclusion === "STARTUP_FAILURE"
  ) {
    return "failure";
  }
  if (state === "SUCCESS" || conclusion === "SUCCESS") {
    return "success";
  }
  if (
    state === "PENDING" ||
    state === "IN_PROGRESS" ||
    state === "EXPECTED" ||
    state === "QUEUED" ||
    (status && status !== "COMPLETED")
  ) {
    return "running";
  }
  return "neutral";
}

export function extractStatusChecks(detail: unknown): StatusCheck[] {
  if (!detail || typeof detail !== "object") return [];
  const rollup = (detail as PrDetailLike).statusCheckRollup;
  return Array.isArray(rollup) ? (rollup as StatusCheck[]) : [];
}

export function hasRunningChecks(checks: readonly StatusCheck[]): boolean {
  return checks.some((check) => toneForStatusCheck(check) === "running");
}

export type ChecksToneCounts = {
  success: number;
  running: number;
  failure: number;
  neutral: number;
};

/** Count checks by ring/icon tone for compact tooltips. */
export function countChecksByTone(checks: readonly StatusCheck[]): ChecksToneCounts {
  const counts: ChecksToneCounts = {
    success: 0,
    running: 0,
    failure: 0,
    neutral: 0,
  };
  for (const check of checks) {
    counts[toneForStatusCheck(check)] += 1;
  }
  return counts;
}

/**
 * Leading-icon color from check rollup.
 * Priority: failure (red) → running (yellow) → all-pass (green) → neutral.
 */
export function getChecksIconTone(checks: readonly StatusCheck[]): WorkspacePrChecksTone {
  if (checks.length === 0) return "neutral";

  let hasFailure = false;
  let hasRunning = false;
  let hasSuccess = false;

  for (const check of checks) {
    const tone = toneForStatusCheck(check);
    if (tone === "failure") hasFailure = true;
    else if (tone === "running") hasRunning = true;
    else if (tone === "success") hasSuccess = true;
  }

  if (hasFailure) return "failure";
  if (hasRunning) return "running";
  if (hasSuccess) return "success";
  return "neutral";
}

export function resolveWorkspacePrPresentation(input: {
  managed: GithubPrPayload;
  branchPr?: BranchPrLike | null;
  detail?: PrDetailLike | null;
}): WorkspacePrPresentation {
  const { managed, branchPr, detail } = input;
  const checks = extractStatusChecks(detail);
  const stateSource = detail?.state ?? branchPr?.state ?? managed.state;
  const titleSource = detail?.title ?? branchPr?.title ?? managed.title;
  const urlSource = detail?.url ?? branchPr?.url ?? managed.url;
  const draftSource =
    detail?.isDraft ?? branchPr?.isDraft ?? managed.is_draft ?? false;
  const isDraft = Boolean(draftSource);

  return {
    owner: managed.owner,
    repo: managed.repo,
    number: managed.number,
    title: String(titleSource ?? "").trim() || `Pull request #${managed.number}`,
    url: String(urlSource ?? managed.url ?? ""),
    state: normalizePrLifecycleState(stateSource, isDraft),
    isDraft,
    checks,
    checksTone: getChecksIconTone(checks),
    checksRunning: hasRunningChecks(checks),
  };
}

/**
 * Final icon color matching GitHub’s PR state palette, with checks overlay
 * on open PRs only:
 * - open → green / checks (red / yellow / green)
 * - draft → gray
 * - merged → purple
 * - closed → red
 */
export function resolvePrIconColorClass(
  state: WorkspacePrLifecycleState,
  checksTone: WorkspacePrChecksTone,
  fallback = "text-muted-foreground",
): string {
  if (state === "draft") return "text-muted-foreground";
  if (state === "merged") return "text-purple-500";
  if (state === "closed") return "text-red-500";

  // open — checks win when present; otherwise GitHub open green
  if (checksTone === "failure") return "text-red-500";
  if (checksTone === "running") return "text-amber-500";
  if (checksTone === "success") return "text-emerald-500";
  return "text-emerald-500";
}

/**
 * Chip styles for PR lifecycle text (GitHub state colors, not checks overlay).
 * Matches the leading icon’s lifecycle palette: open green / draft gray /
 * merged purple / closed red.
 */
export function resolvePrStateChipClassName(state: WorkspacePrLifecycleState): string {
  switch (state) {
    case "merged":
      return "bg-purple-500/10 text-purple-500 border-purple-500/20";
    case "closed":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    case "draft":
      return "bg-muted text-muted-foreground border-border/60";
    case "open":
    default:
      return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
  }
}

/** @deprecated Prefer resolvePrIconColorClass for lifecycle-aware colors. */
export function checksToneClassName(
  tone: WorkspacePrChecksTone,
  fallback: string,
): string {
  return resolvePrIconColorClass("open", tone, fallback);
}
