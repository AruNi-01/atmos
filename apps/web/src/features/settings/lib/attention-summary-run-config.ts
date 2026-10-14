import {
  reasoningSupportForAgent,
  type TerminalAgentRunConfigInput,
} from "@/features/agent/lib/terminal-agent-launch-args";

export type AttentionSummaryLaunchFields = {
  model: string;
  effort: string;
  extraArgs: string[];
};

/** Controlled picker value. Null only when model, effort, and extra args are empty. */
export function attentionSummaryRunConfig(
  agentId: string,
  stored: AttentionSummaryLaunchFields,
): TerminalAgentRunConfigInput | null {
  const model = stored.model.trim();
  const effort = stored.effort.trim();
  const extraArgs = stored.extraArgs.map((item) => item.trim()).filter(Boolean);
  if (!model && !effort && extraArgs.length === 0) return null;
  const mode = reasoningSupportForAgent(agentId).mode;
  const reasoning =
    effort && (mode === "enum" || mode === "encoded_in_model") ? { mode, value: effort } : null;
  return {
    model: model || null,
    reasoning,
    extra_args: extraArgs,
  };
}

/** Fields the settings form persists from a picker edit. */
export function attentionSummaryFieldsFromRunConfig(
  value: TerminalAgentRunConfigInput | null,
): AttentionSummaryLaunchFields {
  return {
    model: value?.model?.trim() || "",
    effort: value?.reasoning?.value?.trim() || "",
    extraArgs: (value?.extra_args ?? []).map((item) => item.trim()).filter(Boolean),
  };
}
