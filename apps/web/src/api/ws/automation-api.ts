"use client";

import { wsRequest } from "@/api/ws/request";
import { parseGithubTriggerConfig } from "@/api/ws/automation-dtos";
import type {
  AutomationListResponse,
} from "@/features/automations/types";

export const automationApi = {
  async markActiveGithubAutomationsNeedsSetup(): Promise<number> {
    const list = await wsRequest<AutomationListResponse>("automation_list", {
      include_paused: true,
    });
    const githubAutomations = list.automations.filter(
      (automation) =>
        automation.trigger_kind === "github" &&
        automation.trigger_enabled &&
        automation.trigger_status === "active",
    );

    await Promise.all(
      githubAutomations.map((automation) =>
        wsRequest("automation_update", {
          automation_guid: automation.guid,
          trigger: {
            kind: "github",
            enabled: false,
            status: "needs_setup",
            config: parseGithubTriggerConfig(automation.trigger_config_json),
          },
        }),
      ),
    );

    return githubAutomations.length;
  },
};
