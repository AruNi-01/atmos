import {
  defaultToolParams,
  isActiveToolStatus,
  isEmptyToolJson,
  isHiddenTranscriptChromePart,
  isNestedSubagentChild,
  isPlanModeChromeTool,
  isSubagentWaitTool,
  partParentToolCallId,
  preferredCollapsedToolTitle,
  transcriptVisibility,
  wireToolKind,
  type AgentToolCallPart,
  type TranscriptVisibility,
} from "@atmos/agent-transcript";
import { copy } from "./copy";

export {
  defaultToolParams,
  isActiveToolStatus,
  isEmptyToolJson,
  isHiddenTranscriptChromePart,
  isNestedSubagentChild,
  isPlanModeChromeTool,
  isSubagentWaitTool,
  partParentToolCallId,
  transcriptVisibility,
  wireToolKind,
  type AgentToolCallPart,
  type TranscriptVisibility,
};

export function collapsedToolTitle(part: AgentToolCallPart): string {
  const fallback =
    wireToolKind(part.kind) === "execute"
      ? copy.runScript
      : part.name.trim() || part.title?.trim() || wireToolKind(part.kind);
  return preferredCollapsedToolTitle(part, fallback);
}
