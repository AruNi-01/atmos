import { describe, expect, it } from "bun:test";

import type { ProjectModel } from "@/api/ws-api";
import { mapProjectModel } from "./project-store-mappers";

function projectModel(overrides: Partial<ProjectModel> = {}): ProjectModel {
  return {
    guid: "proj-1",
    name: "Atmos",
    main_file_path: "/tmp/atmos",
    sidebar_order: 0,
    border_color: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    is_deleted: false,
    ...overrides,
  };
}

describe("mapProjectModel", () => {
  it("maps created_at and last_visited_at onto the project row", () => {
    const mapped = mapProjectModel(
      projectModel({ last_visited_at: "2026-04-02T12:00:00.000Z" }),
    );

    expect(mapped.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(mapped.lastVisitedAt).toBe("2026-04-02T12:00:00.000Z");
  });

  it("leaves lastVisitedAt unset when the server has never recorded a visit", () => {
    expect(mapProjectModel(projectModel({ last_visited_at: null })).lastVisitedAt).toBeUndefined();
    expect(mapProjectModel(projectModel()).lastVisitedAt).toBeUndefined();
  });
});
