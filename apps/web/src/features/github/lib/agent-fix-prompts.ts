import type {
  ReviewCommentThread,
} from "@/features/github/lib/pr-detail-parts";

export interface PullRequestFixPromptContext {
  owner: string;
  repo: string;
  prNumber: number;
  title?: string | null;
  headRefName?: string | null;
  baseRefName?: string | null;
  url?: string | null;
}

export interface ActionStepPromptInfo {
  name?: string;
  status?: string;
  conclusion?: string;
  number?: number;
}

export interface ActionJobPromptInfo {
  name?: string;
  status?: string;
  conclusion?: string;
  url?: string;
  html_url?: string;
  steps?: ActionStepPromptInfo[];
}

export interface ActionRunPromptInfo {
  databaseId: number;
  workflowName: string;
  displayTitle?: string;
  status?: string;
  conclusion?: string;
  url?: string;
  event?: string;
  headBranch?: string;
  headSha?: string;
}

export interface ActionAnnotationPromptInfo {
  annotation_level?: string;
  annotationLevel?: string;
  message?: string;
  title?: string;
  path?: string;
  start_line?: number;
  startLine?: number;
  end_line?: number;
  endLine?: number;
  job_name?: string;
  jobName?: string;
}

export interface PullRequestReviewFixPromptInfo {
  author?: string | null;
  body?: string | null;
  createdAt?: string | null;
  state?: string | null;
  threads: ReviewCommentThread[];
}

function compactLines(lines: Array<string | null | undefined>) {
  return lines
    .map((line) => line?.trimEnd())
    .filter((line): line is string => !!line)
    .join("\n");
}

function commentAuthor(comment: ReviewCommentThread["comments"][number]) {
  return comment.user?.login || "unknown reviewer";
}

export function buildPrReviewThreadFixPrompt(
  pr: PullRequestFixPromptContext,
  thread: ReviewCommentThread,
): string {
  const lineLabel = thread.line != null ? `line ${thread.line}` : "the referenced line";
  const comments = thread.comments
    .map((comment, index) =>
      compactLines([
        `Comment ${index + 1} by ${commentAuthor(comment)}:`,
        comment.body || "(empty comment)",
      ]),
    )
    .join("\n\n");

  return compactLines([
    "Fix the pull request review feedback below. Make the smallest code change that addresses the reviewer comments.",
    "",
    "Scope:",
    `- Repository: ${pr.owner}/${pr.repo}`,
    `- Pull request: #${pr.prNumber}${pr.title ? ` — ${pr.title}` : ""}`,
    pr.headRefName || pr.baseRefName
      ? `- Branches: ${pr.headRefName || "head unknown"} -> ${pr.baseRefName || "base unknown"}`
      : null,
    pr.url ? `- PR URL: ${pr.url}` : null,
    `- File: ${thread.path}`,
    `- Location: ${lineLabel}`,
    "",
    thread.diffHunk
      ? compactLines([
          "Relevant diff hunk:",
          "```diff",
          thread.diffHunk,
          "```",
        ])
      : "Relevant diff hunk: unavailable",
    "",
    "Reviewer comments:",
    comments,
    "",
    "Instructions:",
    "- Address only the feedback above.",
    "- Keep unrelated files and behavior unchanged.",
    "- If the comment is already satisfied, verify and explain briefly instead of making noisy edits.",
  ]);
}

export function buildPrReviewFixPrompt(
  pr: PullRequestFixPromptContext,
  review: PullRequestReviewFixPromptInfo,
): string {
  const reviewSummary = review.body?.trim()
    ? compactLines([
        `Review summary by ${review.author || "unknown reviewer"}:`,
        review.body,
      ])
    : `Review summary by ${review.author || "unknown reviewer"}: (none)`;
  const threadSections = review.threads.length > 0
    ? review.threads
        .map((thread, threadIndex) => {
          const lineLabel = thread.line != null ? `line ${thread.line}` : "the referenced line";
          const comments = thread.comments
            .map((comment, commentIndex) =>
              compactLines([
                `Comment ${commentIndex + 1} by ${commentAuthor(comment)}:`,
                comment.body || "(empty comment)",
              ]),
            )
            .join("\n\n");
          return compactLines([
            `Thread ${threadIndex + 1}: ${thread.path} (${lineLabel})`,
            thread.diffHunk
              ? compactLines([
                  "Relevant diff hunk:",
                  "```diff",
                  thread.diffHunk,
                  "```",
                ])
              : "Relevant diff hunk: unavailable",
            "Reviewer comments:",
            comments,
          ]);
        })
        .join("\n\n")
    : "No inline review comments were available for this review.";

  return compactLines([
    "Fix the pull request review feedback below. Treat the review summary and all inline comments as one combined review.",
    "",
    "Scope:",
    `- Repository: ${pr.owner}/${pr.repo}`,
    `- Pull request: #${pr.prNumber}${pr.title ? ` — ${pr.title}` : ""}`,
    pr.headRefName || pr.baseRefName
      ? `- Branches: ${pr.headRefName || "head unknown"} -> ${pr.baseRefName || "base unknown"}`
      : null,
    pr.url ? `- PR URL: ${pr.url}` : null,
    review.state ? `- Review state: ${review.state}` : null,
    review.createdAt ? `- Review created at: ${review.createdAt}` : null,
    "",
    reviewSummary,
    "",
    "Inline review comments:",
    threadSections,
    "",
    "Instructions:",
    "- Address only the feedback in this review.",
    "- Consider all inline comments together before editing.",
    "- Keep unrelated files and behavior unchanged.",
    "- If some comments are already satisfied, verify and explain briefly instead of making noisy edits.",
  ]);
}

/** Fix prompt for PR merge conflicts listed on the Checks tab. */
export function buildPrMergeConflictsFixPrompt(args: {
  owner: string;
  repo: string;
  pr: {
    number: number;
    title?: string | null;
    headRefName?: string | null;
    baseRefName?: string | null;
    url?: string | null;
  };
  conflictFiles: string[];
}): string {
  const fileLines =
    args.conflictFiles.length > 0
      ? args.conflictFiles.map((path, index) => `${index + 1}. ${path}`)
      : ["- Conflict file list was not available in Atmos. Inspect the merge against the base branch."];

  return compactLines([
    "Resolve the merge conflicts for this pull request. Make the smallest relevant changes so the PR can merge cleanly into the base branch.",
    "",
    "Scope:",
    `- Repository: ${args.owner}/${args.repo}`,
    `- Pull request: #${args.pr.number}${args.pr.title ? ` — ${args.pr.title}` : ""}`,
    args.pr.url ? `- PR URL: ${args.pr.url}` : null,
    args.pr.headRefName ? `- Head branch: ${args.pr.headRefName}` : null,
    args.pr.baseRefName ? `- Base branch: ${args.pr.baseRefName}` : null,
    "",
    "Conflicted files:",
    ...fileLines,
    "",
    "Instructions:",
    "- Resolve conflicts only; do not rewrite unrelated code.",
    "- Prefer keeping intentional PR changes while integrating base-branch updates.",
    "- After resolving, ensure the result builds/tests when practical.",
  ]);
}

/** Fix prompt for a single failed PR status check (from Checks tab). */
export function buildGithubActionsCheckFixPrompt(args: {
  owner: string;
  repo: string;
  check: {
    name: string;
    workflowName?: string;
    conclusion?: string;
    status?: string;
    detailsUrl?: string;
  };
  runId?: number | null;
  pr?: {
    number: number;
    title?: string | null;
    headRefName?: string | null;
    baseRefName?: string | null;
    url?: string | null;
  };
}): string {
  return compactLines([
    "Fix the failing GitHub Actions / status check below. Make the smallest relevant code or configuration change.",
    "",
    "Scope:",
    `- Repository: ${args.owner}/${args.repo}`,
    args.pr
      ? `- Pull request: #${args.pr.number}${args.pr.title ? ` — ${args.pr.title}` : ""}`
      : null,
    args.pr?.url ? `- PR URL: ${args.pr.url}` : null,
    args.pr?.headRefName ? `- Head branch: ${args.pr.headRefName}` : null,
    args.pr?.baseRefName ? `- Base branch: ${args.pr.baseRefName}` : null,
    args.check.workflowName ? `- Workflow: ${args.check.workflowName}` : null,
    `- Check: ${args.check.name}`,
    args.check.status ? `- Status: ${args.check.status}` : null,
    args.check.conclusion ? `- Conclusion: ${args.check.conclusion}` : null,
    args.runId != null ? `- Run ID: ${args.runId}` : null,
    args.check.detailsUrl ? `- Check URL: ${args.check.detailsUrl}` : null,
    "",
    "Instructions:",
    "- Focus on this check failure only.",
    "- Do not rewrite unrelated code or chase unrelated warnings.",
    "- If logs are needed, inspect the check URL or run the relevant local command.",
  ]);
}

export function buildGithubActionsJobFixPrompt(args: {
  owner: string;
  repo: string;
  run: ActionRunPromptInfo;
  job: ActionJobPromptInfo;
}): string {
  const failedSteps = (args.job.steps ?? []).filter(
    (step) => step.conclusion === "failure" || step.status === "failure",
  );
  const stepLines = failedSteps.length > 0
    ? failedSteps.map((step, index) =>
        `- ${step.name || `Step ${step.number ?? index + 1}`}${step.number ? ` (#${step.number})` : ""}: ${step.conclusion || step.status || "failed"}`,
      )
    : ["- No failed step metadata was available in Atmos. Use the job name and workflow context."];
  const jobUrl =
    args.job.html_url ||
    (args.job.url && !args.job.url.includes("api.github.com") ? args.job.url : null);

  return compactLines([
    "Fix the GitHub Actions failure below. Use the workflow/job context to identify the failing command and make the smallest relevant code or configuration change.",
    "",
    "Scope:",
    `- Repository: ${args.owner}/${args.repo}`,
    `- Workflow: ${args.run.workflowName}`,
    args.run.displayTitle ? `- Run title: ${args.run.displayTitle}` : null,
    `- Run ID: ${args.run.databaseId}`,
    args.run.event ? `- Event: ${args.run.event}` : null,
    args.run.headBranch ? `- Branch: ${args.run.headBranch}` : null,
    args.run.headSha ? `- Commit: ${args.run.headSha}` : null,
    args.run.url ? `- Run URL: ${args.run.url}` : null,
    "",
    "Failed job:",
    `- Name: ${args.job.name || "unknown job"}`,
    `- Status: ${args.job.status || "unknown"}`,
    `- Conclusion: ${args.job.conclusion || "unknown"}`,
    jobUrl ? `- Job URL: ${jobUrl}` : null,
    "",
    "Failed steps:",
    ...stepLines,
    "",
    "Instructions:",
    "- Focus on this workflow failure only.",
    "- Do not rewrite unrelated code or chase unrelated warnings.",
    "- If logs are needed, inspect the GitHub Actions job URL or run the relevant local test command.",
  ]);
}

export function buildGithubActionsAnnotationsFixPrompt(args: {
  annotations: ActionAnnotationPromptInfo[];
  owner: string;
  repo: string;
  run: ActionRunPromptInfo;
}): string {
  const annotationLines = args.annotations.map((annotation, index) => {
    const level = annotation.annotation_level ?? annotation.annotationLevel ?? "notice";
    const jobName = annotation.job_name ?? annotation.jobName;
    const line = annotation.start_line ?? annotation.startLine;
    const endLine = annotation.end_line ?? annotation.endLine;
    const location = annotation.path
      ? `${annotation.path}${line ? `:${line}${endLine && endLine !== line ? `-${endLine}` : ""}` : ""}`
      : null;

    return compactLines([
      `${index + 1}. [${level}] ${annotation.title || annotation.message || "Untitled annotation"}`,
      jobName ? `   Job: ${jobName}` : null,
      location ? `   Location: ${location}` : null,
      annotation.message && annotation.title
        ? `   Message: ${annotation.message}`
        : null,
    ]);
  });

  return compactLines([
    "Fix the GitHub Actions annotations below. Make the smallest relevant code or configuration change.",
    "",
    "Scope:",
    `- Repository: ${args.owner}/${args.repo}`,
    `- Workflow: ${args.run.workflowName}`,
    args.run.displayTitle ? `- Run title: ${args.run.displayTitle}` : null,
    `- Run ID: ${args.run.databaseId}`,
    args.run.event ? `- Event: ${args.run.event}` : null,
    args.run.headBranch ? `- Branch: ${args.run.headBranch}` : null,
    args.run.headSha ? `- Commit: ${args.run.headSha}` : null,
    args.run.url ? `- Run URL: ${args.run.url}` : null,
    "",
    "Annotations:",
    ...annotationLines,
    "",
    "Instructions:",
    "- Address the annotations above only.",
    "- Keep unrelated code and configuration unchanged.",
    "- If logs are needed, inspect the linked Actions run or run the relevant local command.",
  ]);
}
