import type { ToolOverviewKind } from "@atmos/agent-transcript";

export const copy = {
  newChat: "New chat",
  emptyTitle: "Start chatting",
  emptyDescription: "Send a message to begin this chat.",
  placeholder: "Send a message to create a session",
  resumePlaceholder: "Send a message to resume the session",
  connectedPlaceholder: "Do anything with {agent}",
  send: "Send",
  stop: "Stop",
  queue: "Queue",
  steer: "Steer",
  agent: "Agent",
  model: "Model",
  thinking: "Thinking",
  permissionTitle: "Permission needed",
  sendFailed: "Could not send that message",
  history: "Chats",
  messages: "Messages",
  parameters: "Parameters",
  result: "Result",
  rename: "Rename chat",
  deleteChat: "Delete",
  attach: "Attach",
  context: "Context",
  close: "Close",
  mode: "Mode",
  permission: "Permission",
  add: "Add",
  photos: "Photos",
  allowPhotos: "Allow photo access",
  photosNeedRebuild: "Rebuild the app to attach photos.",
  effort: "Effort",
  fast: "Fast",
  favorites: "Favorites",
  searchModels: "Search models",
  noFavorites: "No favorites yet",
  noModels: "No models",
  addFavorite: "Add favorite",
  removeFavorite: "Remove favorite",
  scrollBelowPrefix: "",
  scrollBelowSuffix: "below",
  scrollBelowUnit: "{count, plural, one {message} other {messages}}",
  permissionRequested: "Permission requested",
  askUserTitle: "Questions for you",
  planApprovalTitle: "Plan ready",
  sessionOpRequested: "Session action requested",
  bottom: "Bottom",
  planTitle: "Plan",
  messageQueueTitle: "Message Queue",
  backgroundCommandsTitle: "Background",
  subagentTasksTitle: "Subagent Tasks",
  grokGoalTitle: "Goal",
  grokWorkflowTitle: "Research",
  contextWindowTitle: "Context Usage",
} as const;

export const toolGroupLabels = {
  join: ", ",
  locale: "en",
  thinking: "Thinking",
  working: "Working",
} as const;

export function toolGroupCountLabel(kind: ToolOverviewKind, count: number): string {
  const one = count === 1;
  switch (kind) {
    case "write":
      return one ? `${count} write` : `${count} writes`;
    case "command":
      return one ? `ran ${count} command` : `ran ${count} commands`;
    case "skill":
      return one ? `${count} skill` : `${count} skills`;
    case "subagent":
      return one ? `${count} subagent` : `${count} subagents`;
    case "other":
      return one ? `${count} tool` : `${count} tools`;
    case "fetch":
      return one ? `${count} fetch` : `${count} fetches`;
    case "search":
      return one ? `${count} search` : `${count} searches`;
    case "read":
      return one ? `${count} read` : `${count} reads`;
  }
}
