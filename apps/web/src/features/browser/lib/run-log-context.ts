/**
 * APP-055: Run log path resolution + short agent prompt for the View Run Logs chip.
 */

export const VIEW_RUN_LOGS_SLASH_COMMAND_ID = "view-run-logs";

export const RUN_LOG_RESOLVE_REASONS = [
  "last_start",
  "preferred_window",
  "run_main",
  "fallback",
] as const;

export type RunLogResolveReason = (typeof RUN_LOG_RESOLVE_REASONS)[number];

export type ResolvedRunLogLatest = {
  latestPath: string;
  reason?: RunLogResolveReason | null;
  otherLatestPaths?: string[];
};

export function buildRunLogLatestPath(projectRoot: string, windowName = "run-main"): string {
  const root = projectRoot.replace(/[\\/]+$/, "");
  return `${root}/.atmos/run-logs/${windowName}.latest.log`;
}

/** `run-main` or `run-{tabId}` from a `*.latest.log` path. */
export function runLogWindowNameFromLatestPath(path: string): string | null {
  const base = path.replace(/\\/g, "/").split("/").pop() ?? "";
  if (!base.endsWith(".latest.log")) return null;
  const name = base.slice(0, -".latest.log".length);
  return name.startsWith("run-") ? name : null;
}

function isRunLogResolveReason(value: string | null | undefined): value is RunLogResolveReason {
  return RUN_LOG_RESOLVE_REASONS.includes(value as RunLogResolveReason);
}

function selectionReasonLine(reason: RunLogResolveReason): string {
  switch (reason) {
    case "last_start":
      return "This file was selected because it was the last Run you started.";
    case "preferred_window":
      return "This file was selected because it is the Run tab currently open.";
    case "run_main":
      return "This file was selected because it is the default Run tab.";
    case "fallback":
      return "This file was selected as the available Run log.";
  }
}

function otherLogsLine(path: string, otherLatestPaths: string[] | undefined): string | null {
  const others = (otherLatestPaths ?? [])
    .map((item) => item.trim())
    .filter((item) => item && item !== path);
  if (others.length === 0) return null;
  return `Other latest Run logs: ${others
    .map((item) => {
      const name = runLogWindowNameFromLatestPath(item);
      return name ? `\`${item}\` (\`${name}\`)` : `\`${item}\``;
    })
    .join(", ")}.`;
}

export function buildRunLogAvailablePrompt(
  path: string,
  options?: {
    reason?: string | null;
    otherLatestPaths?: string[];
  },
): string {
  const windowName = runLogWindowNameFromLatestPath(path);
  const source = windowName
    ? `This is an Atmos Run log (output from Run window \`${windowName}\`; \`run-main\` is the default Run tab, other \`run-*\` windows are extra Run terminals).`
    : "This is an Atmos Run log (output from the project's Run terminal).";
  const reason = isRunLogResolveReason(options?.reason) ? selectionReasonLine(options.reason) : null;
  return [
    source,
    reason,
    otherLogsLine(path, options?.otherLatestPaths),
    "",
    `Log path: ${path}`,
    "",
    "Read this file with your file tools to diagnose issues. The log may be large — do not read the entire file at once. Start from the end (tail / last lines), or search for errors then read only the relevant sections.",
    "",
    "If this is the wrong Run tab, the user can name the correct window (`run-main` or another `run-*`) in their prompt. If you are not sure this log matches the failure, ask which Run tab to read.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function buildRunLogMissingPrompt(expectedPath: string): string {
  return [
    "Atmos Run log is not available yet at:",
    expectedPath,
    "",
    "No log file was found. Ask the user to start the project from the Run tab, then try again.",
    "If they already ran a different Run tab, they can name that window (`run-main` or another `run-*`) in their prompt.",
  ].join("\n");
}

export function matchesViewRunLogsSlashQuery(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    "view run logs".includes(q) ||
    "view-run-logs".includes(q) ||
    "run log".includes(q) ||
    "run logs".includes(q) ||
    "runlog".includes(q) ||
    "logs".includes(q) ||
    "log".includes(q)
  );
}

export function buildViewRunLogsSlashCommand(opts: {
  label: string;
  description: string;
}): { id: string; label: string; description: string } {
  return {
    id: VIEW_RUN_LOGS_SLASH_COMMAND_ID,
    label: opts.label,
    description: opts.description,
  };
}

/**
 * Resolve the prompt text stored in the AI context chip for View Run Logs.
 * Never inlines log body — only path + short reading tip (or missing guidance).
 */
export async function resolveViewRunLogsPromptText(
  projectRoot: string | null | undefined,
  resolveLatest: (root: string) => Promise<ResolvedRunLogLatest | null>,
): Promise<string> {
  const root = projectRoot?.trim();
  if (!root) {
    return buildRunLogMissingPrompt(buildRunLogLatestPath("<project-root>"));
  }
  try {
    const latest = await resolveLatest(root);
    if (latest?.latestPath.trim()) {
      return buildRunLogAvailablePrompt(latest.latestPath.trim(), {
        reason: latest.reason,
        otherLatestPaths: latest.otherLatestPaths,
      });
    }
  } catch {
    // fall through to expected path
  }
  return buildRunLogMissingPrompt(buildRunLogLatestPath(root));
}
