import {
  getTerminalDisplayMeta,
  nextCenterTabSessionOscTitle,
  type ContestedOwnersMap,
} from "@atmos/shared/terminal";
import { MOBILE_TERMINAL_AGENTS } from "@/features/terminal/mobile-terminal-agents";

export type MobileTerminalHeading = {
  agentId?: string;
  sessionOscTitle?: string;
  title: string;
};

/** Same title as the web center terminal tab: stable broadcast topic, not live spinner text. */
export function resolveMobileTerminalHeading(input: {
  baseTitle?: string;
  contestedOwners?: ContestedOwnersMap;
  dynamicTitle?: string;
  oscTitle?: string;
  sessionOscTitle?: string;
}): MobileTerminalHeading {
  const baseTitle = input.baseTitle?.trim() ?? "";
  const shapeAgent = MOBILE_TERMINAL_AGENTS.find(
    (agent) => agent.label.trim().toLowerCase() === baseTitle.toLowerCase(),
  );
  const sessionOscTitle = nextCenterTabSessionOscTitle(input.sessionOscTitle, input.oscTitle, {
    dynamicTitle: input.dynamicTitle,
    toolbarAgent: shapeAgent,
  });
  const auto = getTerminalDisplayMeta({
    baseTitle,
    configuredAgents: MOBILE_TERMINAL_AGENTS,
    contestedOwners: input.contestedOwners,
    dynamicTitle: input.dynamicTitle,
    oscTitle: sessionOscTitle,
  });
  const title =
    (auto.displayTitle || auto.primaryTitle || "").trim() ||
    auto.toolbarAgent?.label?.trim() ||
    baseTitle ||
    "Terminal";

  return {
    agentId: auto.toolbarAgent?.id,
    sessionOscTitle,
    title,
  };
}
