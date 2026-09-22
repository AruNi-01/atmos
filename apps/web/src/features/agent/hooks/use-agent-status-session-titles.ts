"use client";

import { useMemo } from "react";
import {
  AGENT_TOOL_LABELS,
  type AgentStatusRecord,
} from "@/features/agent/store/agent-status-store";
import { useAgentChatCenterTabsStore } from "@/features/agent/store/use-agent-chat-center-tabs";
import { collectAgentStatusSessionTitles } from "@/features/agent/lib/agent-status-pane-title";
import { useContestedCliOwners } from "@/features/terminal/hooks/use-contested-cli-owners";
import { useTerminalStore } from "@/features/terminal/store/use-terminal-store";

export function useAgentStatusSessionTitles(
  sessions: AgentStatusRecord[],
): Readonly<Record<string, string>> {
  const contestedOwners = useContestedCliOwners();
  const workspacePanes = useTerminalStore((s) => s.workspacePanes);
  const projectWikiPanes = useTerminalStore((s) => s.projectWikiPanes);
  const codeReviewPanes = useTerminalStore((s) => s.codeReviewPanes);
  const chatTabsByContext = useAgentChatCenterTabsStore((s) => s.tabsByContext);

  return useMemo(
    () =>
      collectAgentStatusSessionTitles(sessions, {
        contestedOwners,
        panes: { workspacePanes, projectWikiPanes, codeReviewPanes },
        chatTabs: Object.values(chatTabsByContext).flat(),
        agentLabel: (tool) => AGENT_TOOL_LABELS[tool as AgentStatusRecord["tool"]] ?? tool,
      }),
    [
      sessions,
      workspacePanes,
      projectWikiPanes,
      codeReviewPanes,
      chatTabsByContext,
      contestedOwners,
    ],
  );
}
