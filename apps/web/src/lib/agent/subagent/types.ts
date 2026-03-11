import type { AgentToolCallContentItem } from "@/hooks/use-agent-session";
import type { AgentVendor } from "@/lib/agent/agent-vendor";

export interface SubAgentToolCallBlock {
  tool_call_id: string;
  parent_tool_call_id?: string;
  tool: string;
  description: string;
  status: string;
  raw_input?: unknown;
  content?: AgentToolCallContentItem[];
  raw_output?: unknown;
  detail?: unknown;
}

export interface AtmosSubAgentLabel {
  key: string;
  value: string;
}

export type AtmosSubAgentContentBlock =
  | {
      type: "markdown";
      markdown: string;
    }
  | {
      type: "diff";
      path?: string;
      oldContent?: string;
      newContent: string;
    }
  | {
      type: "terminal";
      terminalId: string;
    };

export interface AtmosSubAgentMessage {
  id: string;
  vendor: AgentVendor;
  title: string;
  description: string;
  prompt?: string | null;
  status: "running" | "completed" | "failed";
  detailMode?: "full" | "status_only";
  contentBlocks: AtmosSubAgentContentBlock[];
  resultMarkdown?: string | null;
  labels: AtmosSubAgentLabel[];
  childToolCalls: SubAgentToolCallBlock[];
}

export interface SubAgentAdapter {
  canHandle: (block: SubAgentToolCallBlock, vendor: AgentVendor) => boolean;
  normalize: (
    block: SubAgentToolCallBlock,
    vendor: AgentVendor,
    childToolCalls: SubAgentToolCallBlock[],
  ) => AtmosSubAgentMessage | null;
}
