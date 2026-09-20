import { agentChatApi } from "@/api/ws/agent-chat-api";
import { hostSessionApi, type HostSessionResumeTuiResponse } from "@/api/ws/host-session-api";
import { openAgentChatHistoryRow } from "@/features/agent/lib/agent-chat-sessions";
import { TERMINAL_AGENT_DEFINITIONS } from "@/features/agent/lib/terminal-agent-definitions";
import {
  formatHostSessionTuiCommand,
  formatHostSessionTuiLaunch,
  hostSessionTuiHref,
  resolveHostSessionTuiTarget,
} from "@/features/agent-sessions/lib/host-session-command";
import { useProjectStore } from "@/features/project/store/use-project-store";
import {
  commitLocatedPaneNavigation,
  type NavigateToLocatedPaneRouter,
} from "@/features/terminal/public/navigate-to-located-pane";
import { useWorkspaceCreationStore } from "@/features/workspace/store/workspace-creation-store";
import type { Project } from "@/shared/types/domain";

export { formatHostSessionTuiCommand, formatHostSessionTuiLaunch };

export type HostSessionTuiResumeOutcome = {
  launched: boolean;
  result: HostSessionResumeTuiResponse;
};

const HOST_PROVIDER_TO_TERMINAL_AGENT: Record<string, string> = {
  grok: "grok-build",
};

function terminalAgentForHost(providerId: string) {
  const id = HOST_PROVIDER_TO_TERMINAL_AGENT[providerId] ?? providerId;
  return TERMINAL_AGENT_DEFINITIONS.find((item) => item.id === id);
}

export async function resumeHostSessionInChat(
  key: string,
  router: NavigateToLocatedPaneRouter,
  projects: Project[],
): Promise<void> {
  const result = await hostSessionApi.resumeChat(key);
  const snapshot = await agentChatApi.get(result.chat_id);
  await openAgentChatHistoryRow(
    {
      id: snapshot.meta.id,
      title: snapshot.meta.title,
      cwd: snapshot.meta.cwd,
      workspace_id: snapshot.meta.workspace_id,
      project_id: snapshot.meta.project_id,
      space_id: snapshot.meta.space_id ?? null,
      origin: snapshot.meta.origin ?? null,
      provider_id: snapshot.meta.provider_id,
      updated_at: snapshot.meta.updated_at,
      last_message_at: snapshot.meta.last_message_at,
      deleted: snapshot.meta.deleted,
    },
    router,
    projects,
  );
}

export async function resumeHostSessionInTui(
  key: string,
  router: NavigateToLocatedPaneRouter,
  projects: Project[],
  session: { provider_id: string; title?: string },
): Promise<HostSessionTuiResumeOutcome> {
  const result = await hostSessionApi.resumeTui(key);
  const target = resolveHostSessionTuiTarget(result, projects);
  const href = hostSessionTuiHref(target);
  if (!href) {
    return { launched: false, result };
  }

  const catalogAgent = terminalAgentForHost(session.provider_id);
  const launch = formatHostSessionTuiLaunch(result);
  useWorkspaceCreationStore.getState().queueAgentRun({
    workspaceId: target.workspaceId,
    projectId: target.workspaceId ? null : target.projectId,
    prompt: "",
    command: launch,
    reuseIdlePane: false,
    agent: {
      id: catalogAgent?.id ?? session.provider_id,
      label: catalogAgent?.label ?? session.title?.trim() ?? session.provider_id,
      command: result.bin,
      iconType: "built-in",
    },
  });
  if (target.workspaceId) {
    await useProjectStore.getState().ensureWorkspaceVisible(target.workspaceId);
  }
  commitLocatedPaneNavigation(router, href);
  return { launched: true, result };
}
