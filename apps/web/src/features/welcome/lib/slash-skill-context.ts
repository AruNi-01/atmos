export type SlashSkillContextItem = {
  scope: "global" | "project" | "inside_project" | "system";
  project_id: string | null;
};

export function filterSlashSkillsForProject<T extends SlashSkillContextItem>(
  skills: T[],
  activeProjectId: string | null,
) {
  return skills.filter((skill) => {
    if (skill.scope === "global") return true;
    if (skill.scope !== "project" && skill.scope !== "inside_project") {
      return false;
    }
    if (!activeProjectId) return false;
    return skill.project_id === activeProjectId;
  });
}
