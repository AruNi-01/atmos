import { describe, expect, test } from "bun:test";
import type { HostSessionListItem } from "@atmos/api-types/ws/dto/host-session";
import { hostSessionProjectLabel } from "@/features/agent-sessions/lib/host-session-filters";
import {
  filterHostSessionsByQuery,
  flattenHostSessionGroups,
  flattenHostSessionRows,
  groupHostSessions,
  hostSessionAgentLabel,
} from "@/features/agent-sessions/lib/host-session-groups";

function item(
  patch: Partial<HostSessionListItem> & Pick<HostSessionListItem, "key" | "provider_id">,
): HostSessionListItem {
  return {
    native_id: patch.native_id ?? patch.key,
    title: patch.title ?? patch.key,
    cwd: patch.cwd ?? "/tmp",
    project_name: patch.project_name ?? "",
    started_at: patch.started_at ?? "2026-01-01T00:00:00Z",
    updated_at: patch.updated_at ?? "2026-01-01T00:00:00Z",
    message_count: patch.message_count ?? 1,
    byte_size: patch.byte_size ?? null,
    model: patch.model ?? null,
    tags: patch.tags ?? [],
    atmos_chat_id: patch.atmos_chat_id ?? null,
    resume_chat: patch.resume_chat ?? "supported",
    resume_tui: patch.resume_tui ?? "supported",
    ...patch,
  };
}

describe("host session grouping", () => {
  test("project label is the last cwd directory, not adapter project_name", () => {
    expect(
      hostSessionProjectLabel({
        cwd: "/Users/me/code/atmos/crates/agent",
        project_name: "something-else",
      }),
    ).toBe("agent");
    expect(hostSessionProjectLabel({ cwd: "C:\\Users\\me\\notes\\", project_name: "" })).toBe(
      "notes",
    );
  });

  test("groups by agent or by cwd project folder", () => {
    const sessions = [
      item({
        key: "claude:a",
        provider_id: "claude",
        cwd: "/src/atmos",
        updated_at: "2026-02-02T00:00:00Z",
      }),
      item({
        key: "codex:b",
        provider_id: "codex",
        cwd: "/src/atmos/apps/web",
        updated_at: "2026-02-01T00:00:00Z",
      }),
      item({
        key: "claude:c",
        provider_id: "claude",
        cwd: "/src/notes",
        updated_at: "2026-01-01T00:00:00Z",
      }),
    ];

    const byAgent = groupHostSessions(sessions, "agent", "Unknown project");
    expect(byAgent.map((group) => group.key)).toEqual(["claude", "codex"]);
    expect(byAgent[0]?.sessions.map((row) => row.key)).toEqual(["claude:a", "claude:c"]);

    const byProject = groupHostSessions(sessions, "project", "Unknown project");
    expect(byProject.map((group) => group.label)).toEqual(["atmos", "web", "notes"]);
    expect(flattenHostSessionGroups(byProject, { "project:web": true }).map((row) =>
      row.kind === "header" ? row.group.label : row.session.key,
    )).toEqual(["atmos", "claude:a", "web", "notes", "claude:c"]);
  });

  test("sorts sessions by created or modified time", () => {
    const sessions = [
      item({
        key: "claude:old",
        provider_id: "claude",
        cwd: "/src/atmos",
        started_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-03-01T00:00:00Z",
      }),
      item({
        key: "claude:new",
        provider_id: "claude",
        cwd: "/src/atmos",
        started_at: "2026-02-01T00:00:00Z",
        updated_at: "2026-02-01T00:00:00Z",
      }),
    ];

    const byUpdatedDesc = groupHostSessions(sessions, "agent", "Unknown project");
    expect(byUpdatedDesc[0]?.sessions.map((row) => row.key)).toEqual(["claude:old", "claude:new"]);

    const byCreatedAsc = groupHostSessions(sessions, "agent", "Unknown project", {
      field: "started_at",
      order: "asc",
    });
    expect(byCreatedAsc[0]?.sessions.map((row) => row.key)).toEqual(["claude:old", "claude:new"]);

    const byCreatedDesc = groupHostSessions(sessions, "agent", "Unknown project", {
      field: "started_at",
      order: "desc",
    });
    expect(byCreatedDesc[0]?.sessions.map((row) => row.key)).toEqual(["claude:new", "claude:old"]);

    const byUpdatedAsc = groupHostSessions(sessions, "project", "Unknown project", {
      field: "updated_at",
      order: "asc",
    });
    expect(byUpdatedAsc[0]?.sessions.map((row) => row.key)).toEqual(["claude:new", "claude:old"]);
  });

  test("sorts sessions by file size", () => {
    const sessions = [
      item({
        key: "claude:small",
        provider_id: "claude",
        cwd: "/src/atmos",
        byte_size: 100,
        updated_at: "2026-03-01T00:00:00Z",
      }),
      item({
        key: "claude:large",
        provider_id: "claude",
        cwd: "/src/atmos",
        byte_size: 900,
        updated_at: "2026-01-01T00:00:00Z",
      }),
    ];
    const rows = flattenHostSessionRows(
      sessions,
      "all",
      "Unknown project",
      { field: "byte_size", order: "desc" },
      {},
    );
    expect(rows.map((row) => (row.kind === "session" ? row.session.key : ""))).toEqual([
      "claude:large",
      "claude:small",
    ]);
  });

  test("all mode lists sessions in sort order without group headers", () => {
    const sessions = [
      item({
        key: "claude:a",
        provider_id: "claude",
        cwd: "/src/atmos",
        updated_at: "2026-02-02T00:00:00Z",
      }),
      item({
        key: "codex:b",
        provider_id: "codex",
        cwd: "/src/atmos/apps/web",
        updated_at: "2026-02-01T00:00:00Z",
      }),
      item({
        key: "claude:c",
        provider_id: "claude",
        cwd: "/src/notes",
        updated_at: "2026-01-01T00:00:00Z",
      }),
    ];
    const rows = flattenHostSessionRows(
      sessions,
      "all",
      "Unknown project",
      { field: "updated_at", order: "desc" },
      {},
    );
    expect(rows.every((row) => row.kind === "session")).toBe(true);
    expect(rows.map((row) => (row.kind === "session" ? row.session.key : ""))).toEqual([
      "claude:a",
      "codex:b",
      "claude:c",
    ]);
  });

  test("search matches title, agent label, and project folder", () => {
    const sessions = [
      item({ key: "grok:a", provider_id: "grok", title: "Fix sidebar", cwd: "/src/atmos" }),
      item({ key: "claude:b", provider_id: "claude", title: "Other", cwd: "/src/notes" }),
    ];
    expect(hostSessionAgentLabel("grok")).toBe("Grok Build");
    expect(filterHostSessionsByQuery(sessions, "sidebar").map((row) => row.key)).toEqual(["grok:a"]);
    expect(filterHostSessionsByQuery(sessions, "notes").map((row) => row.key)).toEqual(["claude:b"]);
    expect(filterHostSessionsByQuery(sessions, "grok build").map((row) => row.key)).toEqual([
      "grok:a",
    ]);
  });
});
