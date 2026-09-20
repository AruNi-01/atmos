import type { MdLiveEmbedSpec } from "../embed/types";

export type MdLiveExecutionTarget =
  | { kind: "copy" }
  | { kind: "headless"; agentId: string; sessionId?: string };

export type AgentRequest = {
  instruction: string;
  document: { path: string; markdown: string; truncated: boolean };
  selection?: { markdown: string; heading?: string };
  references: MdLiveEmbedSpec[];
  workspace?: { id: string; name: string; path: string };
  project?: { id: string; name: string; path: string };
  branch?: string;
  execution: MdLiveExecutionTarget;
  outputHint: "text" | "markdown";
};

export const AGENT_REQUEST_BODY_CAP_BYTES = 100 * 1024;
