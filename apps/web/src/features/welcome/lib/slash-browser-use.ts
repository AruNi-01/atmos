import type { SkillInfo } from "@/api/ws-api";
import type { SlashCommandOption } from "@/features/welcome/hooks/use-welcome-slash-navigation";

export const BROWSER_USE_SLASH_COMMAND_ID = "browser-use";
export const BROWSER_USE_SKILL_NAME = "atmos-browser-use";
/** Fallback when skills_list has not synced the system skill yet. */
export const BROWSER_USE_SKILL_FALLBACK_PATH =
  "~/.atmos/skills/.system/atmos-browser-use";

export function matchesBrowserUseSlashQuery(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    "browser-use".includes(q) ||
    "browser use".includes(q) ||
    "atmos-browser-use".includes(q) ||
    "atmos browser use".includes(q) ||
    "browser".includes(q) ||
    "webview".includes(q) ||
    "cdp".includes(q) ||
    "page".includes(q) ||
    "dom".includes(q)
  );
}

export function buildBrowserUseSlashCommand(opts: {
  label: string;
  description: string;
}): SlashCommandOption {
  return {
    id: BROWSER_USE_SLASH_COMMAND_ID,
    label: opts.label,
    description: opts.description,
  };
}

export function resolveBrowserUseSkillRef(skills: SkillInfo[]): {
  absolutePath: string;
  name: string;
} {
  const found = skills.find(
    (s) =>
      s.name === BROWSER_USE_SKILL_NAME ||
      s.id === BROWSER_USE_SKILL_NAME ||
      s.path.includes("atmos-browser-use"),
  );
  if (found) {
    return {
      absolutePath: found.path,
      name: found.name || BROWSER_USE_SKILL_NAME,
    };
  }
  return {
    absolutePath: BROWSER_USE_SKILL_FALLBACK_PATH,
    name: BROWSER_USE_SKILL_NAME,
  };
}
