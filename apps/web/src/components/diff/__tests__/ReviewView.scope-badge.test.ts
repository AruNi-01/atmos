/**
 * S11 — N2: scope badge in session header
 *
 * Verifies that ReviewSessionDto.workspace_guid drives the "Project" / "Workspace"
 * badge text. This is a pure logic test — no DOM rendering required.
 */

// @ts-ignore bun:test is available at runtime but not in tsconfig types
import { describe, it, expect } from "bun:test";
import type { ReviewSessionDto } from "@/api/ws-api";

/** Mirrors the badge logic in ReviewView.tsx */
function getScopeBadgeText(session: Pick<ReviewSessionDto, "workspace_guid">): string {
  return session.workspace_guid ? "Workspace" : "Project";
}

const baseSession: Omit<ReviewSessionDto, "workspace_guid"> = {
  guid: "sess-1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  is_deleted: false,
  project_guid: "pj-1",
  repo_path: "/tmp/repo",
  storage_root_rel_path: "/tmp/storage",
  base_ref: "main",
  base_commit: null,
  head_commit: "abc123",
  current_revision_guid: "rev-1",
  status: "active",
  title: null,
  created_by: null,
  closed_at: null,
  archived_at: null,
  revisions: [],
  runs: [],
  open_comment_count: 0,
  reviewed_file_count: 0,
  reviewed_then_changed_count: 0,
};

describe("S11 — N2 scope badge", () => {
  it("shows 'Project' badge when workspace_guid is null", () => {
    const session: ReviewSessionDto = { ...baseSession, workspace_guid: null };
    expect(getScopeBadgeText(session)).toBe("Project");
  });

  it("shows 'Workspace' badge when workspace_guid is set", () => {
    const session: ReviewSessionDto = { ...baseSession, workspace_guid: "ws-1" };
    expect(getScopeBadgeText(session)).toBe("Workspace");
  });
});
