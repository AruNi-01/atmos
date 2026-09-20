import { renderAgentPrompt, type AgentRequest } from "@atmos/md-live";

export async function copyMdLivePrompt(request: AgentRequest): Promise<string> {
  const text = renderAgentPrompt({ ...request, execution: { kind: "copy" } });
  await navigator.clipboard.writeText(text);
  return text;
}

export function buildHeadlessPrompt(request: AgentRequest): string {
  if (request.execution.kind !== "headless") {
    throw new Error("headless prompt requires headless execution");
  }
  return renderAgentPrompt(request);
}
