import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";

export type BackgroundToolProbe = {
  tool_call_id?: string;
  name?: string | null;
  title?: string | null;
  status?: string | null;
  input?: unknown;
  output?: unknown;
  content?: unknown;
};

export type BackgroundCommand = {
  command: string;
  taskId?: string | null;
  running: boolean;
};

export type BackgroundCommandAdapter = {
  detect: (probe: BackgroundToolProbe) => BackgroundCommand | null;
  isPoll: (probe: BackgroundToolProbe) => boolean;
  applyPoll?: (
    messages: AgentMessage[],
    probe: BackgroundToolProbe,
  ) => AgentMessage[];
};
