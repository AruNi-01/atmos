import type { FileUIPart } from "ai";
import type {
  AgentPlan,
  AgentToolCallContentItem,
  AgentTurnUsage,
} from "@/hooks/use-agent-session";

export interface ToolCallBlock {
  type: "tool_call";
  tool_call_id: string;
  tool: string;
  description: string;
  status: string;
  raw_input?: unknown;
  content?: AgentToolCallContentItem[];
  raw_output?: unknown;
  detail?: unknown;
}

export interface TextBlock {
  type: "text";
  content: string;
}

export interface ThinkingBlock {
  type: "thinking";
  content: string;
}

export interface PlanBlock {
  type: "plan";
  plan: AgentPlan;
}

export type AssistantBlock = TextBlock | ThinkingBlock | ToolCallBlock | PlanBlock;

export interface UserEntry {
  role: "user";
  content: string;
  files?: (FileUIPart & { id: string })[];
}

export interface AssistantEntry {
  role: "assistant";
  blocks: AssistantBlock[];
  isStreaming?: boolean;
  usage?: AgentTurnUsage;
}

export type ThreadEntry = UserEntry | AssistantEntry;
