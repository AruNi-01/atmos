import type { SkillInfo } from "@/api/ws-api";
import type { SlashCommandOption } from "@/features/welcome/hooks/use-welcome-slash-navigation";

export const DESKTOP_USE_SLASH_COMMAND_ID = "desktop-use";
export const DESKTOP_USE_SKILL_NAME = "atmos-desktop-use";
/** Fallback when skills_list has not synced the system skill yet. */
export const DESKTOP_USE_SKILL_FALLBACK_PATH =
  "~/.atmos/skills/.system/atmos-desktop-use";

export function matchesDesktopUseSlashQuery(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    "desktop-use".includes(q) ||
    "desktop use".includes(q) ||
    "atmos-desktop-use".includes(q) ||
    "atmos desktop use".includes(q) ||
    "desktop".includes(q) ||
    "appshot".includes(q) ||
    "screenshot".includes(q) ||
    "capture".includes(q) ||
    "computer use".includes(q)
  );
}

export function buildDesktopUseSlashCommand(opts: {
  label: string;
  description: string;
}): SlashCommandOption {
  return {
    id: DESKTOP_USE_SLASH_COMMAND_ID,
    label: opts.label,
    description: opts.description,
  };
}

export function resolveDesktopUseSkillRef(skills: SkillInfo[]): {
  absolutePath: string;
  name: string;
} {
  const found = skills.find(
    (s) =>
      s.name === DESKTOP_USE_SKILL_NAME ||
      s.id === DESKTOP_USE_SKILL_NAME ||
      s.path.includes("atmos-desktop-use"),
  );
  if (found) {
    return { absolutePath: found.path, name: found.name || DESKTOP_USE_SKILL_NAME };
  }
  return {
    absolutePath: DESKTOP_USE_SKILL_FALLBACK_PATH,
    name: DESKTOP_USE_SKILL_NAME,
  };
}
