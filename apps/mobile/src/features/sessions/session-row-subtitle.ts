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
  /** Inside a project or workspace, those names are already the page context. */
  omitPlace?: boolean;
}): string {
  const project = input.omitPlace ? null : clean(input.projectName);
  const workspace = input.omitPlace || input.projectScoped ? null : clean(input.workspaceName);
  return [project, workspace, clean(input.branch), prStateLabel(input.prState)]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}
