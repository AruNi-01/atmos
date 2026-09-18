import type { HostSessionResumeTuiResponse } from "@atmos/api-types/ws/dto/host-session";
import type { Project } from "@/shared/types/domain";

export type HostSessionCwdTarget = {
  workspaceId: string | null;
  projectId: string | null;
};

export function normalizeHostSessionPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "";
  const slashNormalized = trimmed.replace(/\\/g, "/").replace(/\/+/g, "/");
  const withoutTrailingSlash = slashNormalized.replace(/\/+$/, "");
  if (!withoutTrailingSlash) return slashNormalized.startsWith("/") ? "/" : slashNormalized;
  if (/^[A-Za-z]:$/.test(withoutTrailingSlash)) return `${withoutTrailingSlash}/`;
  return withoutTrailingSlash;
}

/** Cursor slugs drop the Unix root slash (`Users/foo` → `/Users/foo`). */
export function ensureAbsoluteHostSessionCwd(path: string): string {
  const normalized = normalizeHostSessionPath(path);
  if (!normalized) return "";
  if (normalized.startsWith("/")) return normalized;
  if (/^[A-Za-z]:\//.test(normalized)) return normalized;
  return `/${normalized}`;
}

function comparablePath(path: string): string {
  return /^[A-Za-z]:\//.test(path) ? path.toLowerCase() : path;
}

function matchLen(cwd: string, root: string): number | null {
  const normalizedCwd = comparablePath(ensureAbsoluteHostSessionCwd(cwd));
  const normalizedRoot = comparablePath(normalizeHostSessionPath(root));
  if (!normalizedCwd || !normalizedRoot) return null;
  if (normalizedCwd === normalizedRoot) return normalizedRoot.length;
  if (normalizedCwd.startsWith(`${normalizedRoot}/`)) return normalizedRoot.length;
  return null;
}

export function matchHostSessionCwd(
  cwd: string,
  projects: readonly Project[],
): HostSessionCwdTarget {
  let bestWorkspace: { len: number; workspaceId: string; projectId: string } | null = null;
  let bestProject: { len: number; projectId: string } | null = null;

  for (const project of projects) {
    for (const workspace of project.workspaces) {
      if (workspace.isArchived) continue;
      const len = matchLen(cwd, workspace.localPath);
      if (len === null) continue;
      if (!bestWorkspace || len > bestWorkspace.len) {
        bestWorkspace = { len, workspaceId: workspace.id, projectId: project.id };
      }
    }
    const projectLen = matchLen(cwd, project.mainFilePath);
    if (projectLen === null) continue;
    if (!bestProject || projectLen > bestProject.len) {
      bestProject = { len: projectLen, projectId: project.id };
    }
  }

  if (bestWorkspace) {
    return { workspaceId: bestWorkspace.workspaceId, projectId: bestWorkspace.projectId };
  }
  if (bestProject) {
    return { workspaceId: null, projectId: bestProject.projectId };
  }
  return { workspaceId: null, projectId: null };
}

export function resolveHostSessionTuiTarget(
  result: Pick<HostSessionResumeTuiResponse, "workspace_id" | "project_id" | "cwd">,
  projects: readonly Project[],
): HostSessionCwdTarget {
  const serverWorkspaceId = result.workspace_id?.trim() || null;
  const serverProjectId = result.project_id?.trim() || null;
  if (serverWorkspaceId || serverProjectId) {
    return { workspaceId: serverWorkspaceId, projectId: serverProjectId };
  }
  return matchHostSessionCwd(result.cwd, projects);
}

export function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function formatHostSessionTuiCommand(
  result: Pick<HostSessionResumeTuiResponse, "bin" | "args">,
): string {
  return [result.bin, ...result.args].filter(Boolean).join(" ");
}

export function formatHostSessionTuiLaunch(
  result: Pick<HostSessionResumeTuiResponse, "cwd" | "bin" | "args">,
): string {
  const command = [result.bin, ...result.args]
    .filter(Boolean)
    .map((part) => shellSingleQuote(part))
    .join(" ");
  const cwd = ensureAbsoluteHostSessionCwd(result.cwd);
  if (!cwd) return command;
  return `cd ${shellSingleQuote(cwd)} && ${command}`;
}

export function hostSessionTuiHref(target: HostSessionCwdTarget): string | null {
  const params = new URLSearchParams();
  params.set("tab", "terminal");
  if (target.workspaceId) {
    params.set("id", target.workspaceId);
    return `/workspace?${params.toString()}`;
  }
  if (target.projectId) {
    params.set("id", target.projectId);
    return `/project?${params.toString()}`;
  }
  return null;
}
