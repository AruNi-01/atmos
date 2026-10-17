export { formatAgentToolActivityLine, toolKindHeadlineLabel } from "./tool-activity-line";

export {
  deriveAgentActivityState,
  type AgentActivityLabel,
  type AgentActivityState,
} from "./agent-activity";

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
} from "./tool-kind";

export {
  commonDirectoryPrefix,
  displayToolPath,
  displayToolTitle,
  formatSearchScript,
  formatToolLineRange,
  hostFromUrl,
  isImageToolPath,
  languageFromPath,
  matchCountFromSearchSummary,
  normalizeFsPath,
  otherToolBodies,
  pathRelativeToCwd,
  preferredCollapsedToolTitle,
  presentAgentTool,
  prettyJson,
  relativeDisplayPath,
  resolveAgentToolCardHeading,
  resolveTreeEntryPaths,
  stripPathEchoFromToolHeading,
  stripReadLineNumbers,
  toolTitleLooksLikePath,
  type ParsedToolResult,
  type SearchHit,
  type TodoItem,
  type ToolDiffFile,
  type ToolInputRow,
  type ToolLineRange,
  type ToolPresentation,
  type TreeEntry,
  type WebResultLink,
} from "./present";

export {
  classifyTranscriptPart,
  nestedPartsFor,
  subagentChildParts,
  waitForSection,
  type ClassifiedTranscriptPart,
  type ClassifyOptions,
  type ImageDetail,
  type TranscriptDetail,
  type WaitForRow,
  type WaitForSection,
} from "./classify";

export {
  AGENT_CHAT_COMMIT_FLUSH_MS,
  HIGH_FREQUENCY_EVENT_KINDS,
  classifyCommitCadence,
  createAgentChatCommitBuffer,
  type AgentChatCommitBuffer,
  type AgentChatCommitCadence,
  type AgentChatCommitDecision,
  type HighFrequencyEventKind,
} from "./agent-chat-commit-buffer";

export {
  countMessagesBelowViewport,
  createMessagesBelowCountStore,
  type MessagesBelowCountStore,
  type TranscriptMeasurement,
} from "./agent-chat-below-count";

export {
  clockFromElapsedMs,
  formatUserMessageTime,
  formatWorkDuration,
  formatWorkedAt,
  isLiveAssistantTurn,
  promptToCompleteMs,
  snapshotLiveElapsedMs,
  thinkingBlockDurationMs,
  thinkingDurationSeconds,
  workDurationParts,
} from "./agent-chat-timing";

export {
  AGENT_CHAT_ASSISTANT_MERMAID_ROW_ESTIMATE,
  AGENT_CHAT_ASSISTANT_ROW_ESTIMATE,
  AGENT_CHAT_MERMAID_KEEPALIVE,
  AGENT_CHAT_OVERLAY_PAD_SHRINK_EASING,
  AGENT_CHAT_OVERLAY_PAD_SHRINK_MS,
  AGENT_CHAT_SCROLL_CLASS,
  AGENT_CHAT_TRANSCRIPT_BASE_BOTTOM_PAD_PX,
  AGENT_CHAT_TRANSCRIPT_GAP,
  AGENT_CHAT_TRANSCRIPT_OVERSCAN,
  AGENT_CHAT_USER_ROW_ESTIMATE,
  TRANSCRIPT_END_SLACK_PX,
  agentMessageHasMermaid,
  estimateAgentChatMessageSize,
  estimateTranscriptInitialOffset,
  estimateTranscriptOffsetToIndex,
  estimateTranscriptTotalSize,
  isTranscriptScrolledToEnd,
  mergeIndexKeepAliveRange,
  mergeMermaidKeepAliveRange,
  shouldAdjustTranscriptScrollOnItemSizeChange,
  transcriptBottomPadPx,
  transcriptBottomPadStyle,
} from "./agent-chat-transcript-window";

export {
  TREE_BRANCH_ARM,
  TREE_BRANCH_END_X,
  TREE_BRANCH_FIRST_START_Y,
  TREE_BRANCH_GUTTER,
  TREE_BRANCH_MID_Y,
  TREE_BRANCH_RADIUS,
  TREE_BRANCH_TRUNK_X,
  TREE_BRANCH_WIDTH,
  TREE_CONTENT_DELAY_MS,
  TREE_DRAW_MS,
  TREE_EASE,
  TREE_LINE_ALPHA,
  TREE_LINE_MS,
  TREE_LINE_WIDTH,
  TREE_REVEAL_BLUR,
  TREE_REVEAL_FADE_PX,
  TREE_REVEAL_LIFT,
  TREE_STAGGER_CAP_MS,
  TREE_START_MS,
  TREE_STEP_MS,
  TREE_TITLE_SEGMENT_MS,
  TREE_TITLE_STAGGER_MS,
  TREE_TRUNK_MS,
  WEBSEARCH_EXPAND_EASE,
  WEBSEARCH_EXPAND_MS,
  WEBSEARCH_STEP_MS,
  clampTreeShown,
  countedRevealDelay,
  nextTreeRevealDelay,
  nextTreeWatermark,
  shouldPlayTreeTitleEnter,
  treeElbowRadius,
  treeEnterDelayMs,
  treeReachLength,
  treeReachPath,
  treeSegmentDelayMs,
  treeStaggerDelayMs,
  treeTitleRevealMs,
  treeTrunkPath,
} from "./agent-tree-branch";

export {
  hasCollapsibleAssistantProcess,
  isAssistantAnswerTextPart,
  isAssistantTurnSettled,
  isSoftAssistantProcessPart,
  layoutAssistantAnswer,
  shouldAutoCollapseProcessOnSettle,
  shouldCollapseAssistantProcess,
  splitAssistantProcessParts,
  splitTrailingAnswer,
  type AssistantAnswerLayout,
} from "./assistant-process-parts";

export {
  GROK_CHROME_SUBAGENT_NAME,
  GROK_IMPLEMENTER_ID,
  formatGrokElapsed,
  formatGrokTokens,
  grokChromeAgentIds,
  grokChromeDuplicatesUserSpawn,
  grokGoalPhaseSections,
  grokGoalStatusKey,
  grokWorkflowPhaseSections,
  isGrokChromeRosterSubagent,
  isGrokChromeSubagent,
  isHiddenGrokChromePart,
  type GrokChromePhaseSection,
} from "./grok-chrome";

export {
  DEFAULT_TOOL_CALL_DENSITY,
  TOOL_CALL_DENSITY_LEVELS,
  normalizeToolCallDensity,
  toolCallDensityFromIndex,
  toolCallDensityIndex,
  toolCallDensityIndexFromRatio,
  type ToolCallDensity,
} from "./tool-call-density";

export {
  countToolGroupOverview,
  formatToolGroupOverview,
  iconKindForOverview,
  isDetailExpandedTool,
  overviewKindForTool,
  segmentAssistantParts,
  sentenceCaseOverview,
  splitSegmentedAssistantParts,
  toolCallPartsFromGroup,
  toolGroupHasRunning,
  type AssistantSegment,
  type ToolOverviewKind,
} from "./tool-group";

export {
  USER_MESSAGE_COLLAPSE_FADE_LINES,
  USER_MESSAGE_COLLAPSE_LINES,
} from "./user-message-collapse";

export { foldedPartIsOpen, foldedPartIsStreamingDisplayTail } from "./folded-part";

export { isSessionChromeOnly, shouldShowAssistantTurnEndedChrome } from "./assistant-turn-chrome";

export { assistantCopyText, textFromParts } from "./message-text";

export {
  PARITY_FIXTURE_IDS,
  parityFixtureById,
  projectParityTree,
  type ParityCards,
  type ParityExpand,
  type ParityFixture,
  type ParityMessage,
  type ParityNode,
  type ParityTone,
  type ParityTreeOptions,
} from "./parity-tree";
