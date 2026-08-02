/** Normalize GitHub Actions run/job status strings. */
export function normalizeActionStatus(
  value: string | null | undefined,
): string {
  return (value ?? "").trim().toLowerCase();
}

/** Actively executing (blue spinner). */
export function isActionInProgress(
  status: string | null | undefined,
): boolean {
  return normalizeActionStatus(status) === "in_progress";
}

/**
 * Waiting to start / waiting for a runner / approval — not running yet.
 * Visually distinct from in_progress (static clock, amber).
 */
export function isActionQueuedOrPending(
  status: string | null | undefined,
): boolean {
  const s = normalizeActionStatus(status);
  return (
    s === "queued" ||
    s === "pending" ||
    s === "waiting" ||
    s === "requested" ||
    s === "waiting_for_runner" ||
    s === "expected"
  );
}

export type ActionRunBadgeTone = "success" | "failure" | "neutral" | "progress" | "pending";

export function getActionRunBadgeTone(args: {
  status?: string | null;
  conclusion?: string | null;
}): ActionRunBadgeTone {
  const status = normalizeActionStatus(args.status);
  const conclusion = normalizeActionStatus(args.conclusion);
  const completed = status === "completed";

  if (completed) {
    if (conclusion === "success") return "success";
    if (
      conclusion === "failure" ||
      conclusion === "timed_out" ||
      conclusion === "startup_failure" ||
      conclusion === "action_required"
    ) {
      return "failure";
    }
    return "neutral";
  }

  if (isActionInProgress(status)) return "progress";
  if (isActionQueuedOrPending(status)) return "pending";
  return "pending";
}

export function actionRunBadgeClassName(tone: ActionRunBadgeTone): string {
  switch (tone) {
    case "success":
      return "bg-emerald-500/10 text-emerald-500";
    case "failure":
      return "bg-red-500/10 text-red-500";
    case "progress":
      return "bg-blue-500/10 text-blue-500";
    case "pending":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "neutral":
    default:
      return "bg-zinc-500/10 text-zinc-500";
  }
}
