import type { WorkspaceCreateSource } from "@/shared/types/domain";

export function normalizeWorkspaceCreateSource(
  source: string | null | undefined,
): WorkspaceCreateSource {
  return source === "automation" ? "automation" : "manual";
}
