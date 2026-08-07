/**
 * APP-055: Run log path resolution + short agent prompt for the View Run Logs chip.
 */

export const VIEW_RUN_LOGS_SLASH_COMMAND_ID = "view-run-logs";

export function buildRunLogLatestPath(projectRoot: string, windowName = "run-main"): string {
  const root = projectRoot.replace(/[\\/]+$/, "");
  return `${root}/.atmos/run-logs/${windowName}.latest.log`;
}

export function buildRunLogAvailablePrompt(path: string): string {
  return [
    "This is an Atmos Run log (output from the project's Run terminal).",
    "",
    `Log path: ${path}`,
    "",
    "Read this file with your file tools to diagnose issues. The log may be large — do not read the entire file at once. Start from the end (tail / last lines), or search for errors then read only the relevant sections.",
  ].join("\n");
}

export function buildRunLogMissingPrompt(expectedPath: string): string {
  return [
    "Atmos Run log is not available yet at:",
    expectedPath,
    "",
    "No log file was found. Ask the user to start the project from the Run tab, then try again.",
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
  resolveLatest: (root: string) => Promise<string | null>,
): Promise<string> {
  const root = projectRoot?.trim();
  if (!root) {
    return buildRunLogMissingPrompt(buildRunLogLatestPath("<project-root>"));
  }
  try {
    const latest = await resolveLatest(root);
    if (latest && latest.trim()) {
      return buildRunLogAvailablePrompt(latest.trim());
    }
  } catch {
    // fall through to expected path
  }
  return buildRunLogMissingPrompt(buildRunLogLatestPath(root));
}
