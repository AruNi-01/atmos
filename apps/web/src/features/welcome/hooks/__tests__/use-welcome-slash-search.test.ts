// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import type { SkillInfo } from "@/api/ws-api";
import { filterSlashSkillsForProject } from "@/features/welcome/lib/slash-skill-context";

function makeSkill(overrides: Partial<SkillInfo>): SkillInfo {
  return {
    id: overrides.id ?? "skill-id",
    name: overrides.name ?? "Skill",
    description: overrides.description ?? "",
    agents: overrides.agents ?? [],
    scope: overrides.scope ?? "global",
    project_id: overrides.project_id ?? null,
    project_name: overrides.project_name ?? null,
    path: overrides.path ?? "/tmp/SKILL.md",
    files: overrides.files ?? [],
    title: overrides.title ?? null,
    status: overrides.status ?? "enabled",
    manageable: overrides.manageable ?? true,
    can_delete: overrides.can_delete ?? true,
    can_toggle: overrides.can_toggle ?? true,
    placements: overrides.placements ?? [],
  };
}

describe("filterSlashSkillsForProject", () => {
  const globalSkill = makeSkill({ id: "global", name: "Global", scope: "global" });
  const projectASkill = makeSkill({
    id: "project-a",
    name: "Project A",
    scope: "project",
    project_id: "project-a",
  });
  const insideProjectASkill = makeSkill({
    id: "inside-project-a",
    name: "Inside Project A",
    scope: "inside_project",
    project_id: "project-a",
  });
  const projectBSkill = makeSkill({
    id: "project-b",
    name: "Project B",
    scope: "project",
    project_id: "project-b",
  });
  const systemSkill = makeSkill({ id: "system", name: "System", scope: "system" });

  it("returns only global skills when no project context is selected", () => {
    expect(
      filterSlashSkillsForProject(
        [globalSkill, projectASkill, insideProjectASkill, projectBSkill, systemSkill],
        null,
      ).map((skill) => skill.id),
    ).toEqual(["global"]);
  });

  it("returns global plus the selected project's skills", () => {
    expect(
      filterSlashSkillsForProject(
        [globalSkill, projectASkill, insideProjectASkill, projectBSkill, systemSkill],
        "project-a",
      ).map((skill) => skill.id),
    ).toEqual(["global", "project-a", "inside-project-a"]);
  });
});
