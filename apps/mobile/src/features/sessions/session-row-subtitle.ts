import type { SessionPrState } from "./pick-branch-pr";

export function prStateLabel(state: SessionPrState | null | undefined): string | null {
  switch (state) {
    case "open":
      return "Open";
    case "draft":
      return "Draft";
    case "merged":
      return "Merged";
    case "closed":
      return "Closed";
    default:
      return null;
  }
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Project · workspace · branch · PR, dropping empty parts. Project-scoped rows omit the workspace. */
export function formatSessionRowSubtitle(input: {
  projectName?: string | null;
  workspaceName?: string | null;
  branch?: string | null;
  prState?: SessionPrState | null;
  projectScoped?: boolean;
}): string {
  const workspace = input.projectScoped ? null : clean(input.workspaceName);
  return [clean(input.projectName), workspace, clean(input.branch), prStateLabel(input.prState)]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}
