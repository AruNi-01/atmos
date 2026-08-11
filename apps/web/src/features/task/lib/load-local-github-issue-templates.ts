/**
 * Load GitHub issue templates from a local Atmos project working tree.
 * Reads `.github/ISSUE_TEMPLATE/*` and SECURITY.md candidates via fs WS APIs
 * (not remote `gh api`).
 */

import { fsApi } from "@/api/ws-api";
import type {
  GithubIssueTemplateFilePayload,
  GithubIssueTemplatesPayload,
  GithubSecurityPolicyPayload,
} from "@/api/ws/github-api";
import { joinPath } from "@/features/files/lib/file-tree-utils";

/** GitHub discovery order for security policy files. */
const SECURITY_CANDIDATES = [
  "SECURITY.md",
  ".github/SECURITY.md",
  "docs/SECURITY.md",
  "security.md",
  ".github/security.md",
  "docs/security.md",
] as const;

function isTemplateFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".yml") || lower.endsWith(".yaml") || lower.endsWith(".md");
}

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/**
 * List + read issue templates under `{projectPath}/.github/ISSUE_TEMPLATE`.
 * Missing template dir → empty files (blank issue still available client-side).
 */
export async function loadLocalGithubIssueTemplates(
  projectPath: string,
  opts?: { owner?: string; repo?: string },
): Promise<GithubIssueTemplatesPayload> {
  const root = projectPath.replace(/\/+$/, "");
  if (!root) {
    return { files: [], security_policy: null };
  }

  const templateDir = joinPath(root, ".github/ISSUE_TEMPLATE");
  const listing = await fsApi.listDir(templateDir, {
    dirsOnly: false,
    showHidden: true,
    ignoreNotFound: true,
  });

  const templatePaths = listing.entries
    .filter((entry) => !entry.is_dir && isTemplateFilename(entry.name))
    .map((entry) => entry.path);

  const files: GithubIssueTemplateFilePayload[] = [];
  if (templatePaths.length > 0) {
    const batch = await fsApi.readFiles(templatePaths);
    for (const result of batch.results) {
      const content = result.file?.content;
      if (!content?.trim()) continue;
      files.push({
        name: basename(result.path),
        content,
      });
    }
  }
  files.sort((a, b) => a.name.localeCompare(b.name));

  const security_policy = await loadLocalSecurityPolicy(root, opts);
  return { files, security_policy };
}

async function loadLocalSecurityPolicy(
  projectRoot: string,
  opts?: { owner?: string; repo?: string },
): Promise<GithubSecurityPolicyPayload | null> {
  const candidatePaths = SECURITY_CANDIDATES.map((rel) => ({
    rel,
    path: joinPath(projectRoot, rel),
  }));
  const batch = await fsApi.readFiles(candidatePaths.map((c) => c.path));
  for (const candidate of candidatePaths) {
    const result = batch.results.find((r) => r.path === candidate.path);
    const content = result?.file?.content;
    if (!result?.file?.exists || !content?.trim()) continue;
    const owner = opts?.owner?.trim();
    const repo = opts?.repo?.trim();
    const html_url =
      owner && repo ? `https://github.com/${owner}/${repo}/security/policy` : null;
    return {
      path: candidate.rel,
      content,
      html_url,
    };
  }
  return null;
}
