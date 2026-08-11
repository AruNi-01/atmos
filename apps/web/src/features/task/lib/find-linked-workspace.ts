import type { Project, Workspace } from "@/shared/types/domain";

export type LinkedWorkspaceReason =
  | "github_issue"
  | "github_pr"
  | "branch"
  | "linear_issue";

export type LinkedWorkspaceMatch = {
  workspace: Workspace;
  projectId: string;
  reason: LinkedWorkspaceReason;
};

export type GithubLinkTarget = {
  kind: "issue" | "pr";
  owner: string;
  repo: string;
  number: number;
  /** PR head branch — used for implicit workspace association. */
  headRef?: string | null;
  /** Prefer workspaces in this project when matching by branch. */
  projectId?: string | null;
};

type ScoredMatch = LinkedWorkspaceMatch & { score: number };

function sameRepo(
  a: { owner?: string | null; repo?: string | null },
  owner: string,
  repo: string,
): boolean {
  return (
    (a.owner ?? "").toLowerCase() === owner && (a.repo ?? "").toLowerCase() === repo
  );
}

function numbersEqual(a: unknown, b: unknown): boolean {
  const na = Number(a);
  const nb = Number(b);
  return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
}

/** Strip refs/heads/ and origin/ so worktree vs remote names still match. */
export function normalizeGitBranchName(branch: string | null | undefined): string {
  return (branch ?? "")
    .trim()
    .replace(/^refs\/heads\//i, "")
    .replace(/^origin\//i, "");
}

function pullNumberFromUrl(url: string | null | undefined): number | null {
  if (!url) return null;
  const match = url.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/i);
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function issueNumberFromUrl(url: string | null | undefined): number | null {
  if (!url) return null;
  const match = url.match(/github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/i);
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function ownerRepoFromGithubUrl(
  url: string | null | undefined,
): { owner: string; repo: string } | null {
  if (!url) return null;
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/i);
  if (!match?.[1] || !match[2]) return null;
  return {
    owner: match[1].toLowerCase(),
    repo: match[2].replace(/\.git$/i, "").toLowerCase(),
  };
}

/**
 * True when this workspace is explicitly linked to the given PR.
 * Handles:
 * - `workspace.githubPr` (preferred)
 * - PR stored only as `githubIssue` (create path synthesizes issue metadata from PR)
 * - URL-only linkage (`…/pull/N`)
 */
function workspaceMatchesPr(
  workspace: Workspace,
  owner: string,
  repo: string,
  number: number,
): boolean {
  const pr = workspace.githubPr;
  if (pr && sameRepo(pr, owner, repo) && numbersEqual(pr.number, number)) {
    return true;
  }

  // Create-from-PR also writes a synthesized githubIssue with the PR number/url.
  const issue = workspace.githubIssue;
  if (issue) {
    const issueUrl = issue.url ?? "";
    const looksLikePull =
      /\/pull\//i.test(issueUrl) || pullNumberFromUrl(issueUrl) != null;
    if (looksLikePull && sameRepo(issue, owner, repo) && numbersEqual(issue.number, number)) {
      return true;
    }
    const fromUrl = pullNumberFromUrl(issueUrl);
    const urlRepo = ownerRepoFromGithubUrl(issueUrl);
    if (
      fromUrl != null &&
      numbersEqual(fromUrl, number) &&
      urlRepo &&
      urlRepo.owner === owner &&
      urlRepo.repo === repo
    ) {
      return true;
    }
  }

  // githubPr with only URL populated (partial payloads)
  if (pr?.url) {
    const fromUrl = pullNumberFromUrl(pr.url);
    const urlRepo = ownerRepoFromGithubUrl(pr.url);
    if (
      fromUrl != null &&
      numbersEqual(fromUrl, number) &&
      urlRepo &&
      urlRepo.owner === owner &&
      urlRepo.repo === repo
    ) {
      return true;
    }
  }

  return false;
}

/**
 * True when this workspace is explicitly linked to the given Issue
 * (not a PR mis-stored as issue metadata).
 */
function workspaceMatchesIssue(
  workspace: Workspace,
  owner: string,
  repo: string,
  number: number,
): boolean {
  const issue = workspace.githubIssue;
  if (!issue) return false;

  const issueUrl = issue.url ?? "";
  // PR create path stores a synthetic issue payload with the PR url — never treat as Issue link.
  if (/\/pull\//i.test(issueUrl) || pullNumberFromUrl(issueUrl) != null) {
    return false;
  }

  if (sameRepo(issue, owner, repo) && numbersEqual(issue.number, number)) {
    return true;
  }

  const fromUrl = issueNumberFromUrl(issueUrl);
  const urlRepo = ownerRepoFromGithubUrl(issueUrl);
  if (
    fromUrl != null &&
    numbersEqual(fromUrl, number) &&
    urlRepo &&
    urlRepo.owner === owner &&
    urlRepo.repo === repo
  ) {
    return true;
  }

  return false;
}

/**
 * Find an existing Atmos workspace linked to a GitHub issue/PR.
 *
 * - Issue: explicit `workspace.githubIssue` (must be a real issue URL, not a PR).
 * - PR: explicit `workspace.githubPr`, synthetic issue-from-PR metadata, or
 *   implicit via branch === head_ref (normalized).
 */
export function findLinkedWorkspaceForGithubItem(
  projects: Project[],
  target: GithubLinkTarget,
): LinkedWorkspaceMatch | null {
  const owner = target.owner.trim().toLowerCase();
  const repo = target.repo.trim().toLowerCase();
  const headRef = normalizeGitBranchName(target.headRef);
  const preferredProjectId = target.projectId?.trim() || null;
  const number = Number(target.number);

  if (!owner || !repo || !Number.isFinite(number)) {
    return null;
  }

  const candidates: ScoredMatch[] = [];

  for (const project of projects) {
    for (const workspace of project.workspaces) {
      const sameProjectBoost = preferredProjectId && project.id === preferredProjectId ? 10 : 0;
      const activeBoost = workspace.isArchived ? 0 : 5;

      if (target.kind === "issue") {
        if (workspaceMatchesIssue(workspace, owner, repo, number)) {
          candidates.push({
            workspace,
            projectId: project.id,
            reason: "github_issue",
            score: 100 + sameProjectBoost + activeBoost,
          });
        }
        continue;
      }

      // PR: explicit link (githubPr or synthetic issue-from-PR).
      if (workspaceMatchesPr(workspace, owner, repo, number)) {
        candidates.push({
          workspace,
          projectId: project.id,
          reason: "github_pr",
          score: 100 + sameProjectBoost + activeBoost,
        });
        continue;
      }

      // PR: implicit — workspace branch (or stored PR head) matches PR head ref.
      if (headRef) {
        const wsBranch = normalizeGitBranchName(workspace.branch);
        const storedHead = normalizeGitBranchName(workspace.githubPr?.head_ref);
        if (wsBranch === headRef || (storedHead && storedHead === headRef)) {
          candidates.push({
            workspace,
            projectId: project.id,
            reason: "branch",
            score: 50 + sameProjectBoost + activeBoost,
          });
        }
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0]!;
  return {
    workspace: best.workspace,
    projectId: best.projectId,
    reason: best.reason,
  };
}

/**
 * Find an Atmos workspace linked to a Linear issue (via `workspace.linearLinks`).
 */
export function findLinkedWorkspaceForLinearIssue(
  projects: Project[],
  externalId: string,
): LinkedWorkspaceMatch | null {
  const id = externalId.trim();
  if (!id) return null;

  let best: ScoredMatch | null = null;
  for (const project of projects) {
    for (const workspace of project.workspaces) {
      const hit = (workspace.linearLinks ?? []).some(
        (link) => link.externalId === id,
      );
      if (!hit) continue;
      const score = 100 + (workspace.isArchived ? 0 : 5);
      if (!best || score > best.score) {
        best = {
          workspace,
          projectId: project.id,
          reason: "linear_issue",
          score,
        };
      }
    }
  }
  if (!best) return null;
  return {
    workspace: best.workspace,
    projectId: best.projectId,
    reason: best.reason,
  };
}
