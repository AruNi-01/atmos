export interface AgentPlanEntry {
  content: string;
  priority: string;
  status: string;
}

export interface AgentPlan {
  entries: AgentPlanEntry[];
}

export interface AgentConfigOptionValue {
  value: string;
  name?: string;
  description?: string;
}

export interface AgentConfigOption {
  id: string;
  name?: string;
  description?: string;
  category?: string;
  type: "select" | string;
  currentValue?: string;
  options: AgentConfigOptionValue[];
}

export type AgentChatPermissionOption = {
  option_id: string;
  name: string;
  kind: string;
};
