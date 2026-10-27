import type { SkillInfo } from "@/api/ws-api";
import type { SlashCommandOption } from "@/features/welcome/hooks/use-welcome-slash-navigation";

export const AGENT_BRIDGE_SLASH_COMMAND_ID = "agent-bridge";
export const AGENT_BRIDGE_SKILL_NAME = "atmos-agent-bridge";
/** Fallback when skills_list has not synced the system skill yet. */
export const AGENT_BRIDGE_SKILL_FALLBACK_PATH = "~/.atmos/skills/.system/atmos-agent-bridge";

export function matchesAgentBridgeSlashQuery(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    "agent-bridge".includes(q) ||
    "agent bridge".includes(q) ||
    "atmos-agent-bridge".includes(q) ||
    "atmos agent bridge".includes(q) ||
    "bridge".includes(q) ||
    "agentbridge".includes(q)
  );
}

export function buildAgentBridgeSlashCommand(opts: {
  label: string;
  description: string;
}): SlashCommandOption {
  return {
    id: AGENT_BRIDGE_SLASH_COMMAND_ID,
    label: opts.label,
    description: opts.description,
  };
}

export function resolveAgentBridgeSkillRef(skills: SkillInfo[]): {
  absolutePath: string;
  name: string;
  status: SkillInfo["status"];
} {
  const found = skills.find(
    (s) =>
      s.name === AGENT_BRIDGE_SKILL_NAME ||
      s.id === AGENT_BRIDGE_SKILL_NAME ||
      s.path.includes("atmos-agent-bridge"),
  );
  if (found) {
    return {
      absolutePath: found.path,
      name: found.name || AGENT_BRIDGE_SKILL_NAME,
      status: found.status,
    };
  }
  return {
    absolutePath: AGENT_BRIDGE_SKILL_FALLBACK_PATH,
    name: AGENT_BRIDGE_SKILL_NAME,
    status: "enabled",
  };
}
