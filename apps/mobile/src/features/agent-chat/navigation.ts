export type WorkspaceListHref = {
  pathname: "/workspace/[workspaceId]";
  params: { workspaceId: string };
};

export type WorkspaceChatListHref = {
  pathname: "/workspace/[workspaceId]/chat";
  params: { workspaceId: string };
};

export type WorkspaceTerminalHref = {
  pathname: "/workspace/[workspaceId]/terminal";
  params: { workspaceId: string; terminal?: string };
};

export type WorkspaceChatThreadHref = {
  pathname: "/workspace/[workspaceId]/chat/[chatId]";
  params: { workspaceId: string; chatId: string };
};

export type SessionDestination = {
  kind: "terminal" | "chat";
  workspaceId: string | null;
  terminalCandidateId: string | null;
  chatId: string | null;
};

export function openWorkspaceChatList(workspaceId: string | null): WorkspaceChatListHref | null {
  const id = workspaceId?.trim() ?? "";
  if (!id) return null;
  return {
    pathname: "/workspace/[workspaceId]/chat",
    params: { workspaceId: id },
  };
}

export function openWorkspaceTerminal(
  workspaceId: string | null,
  terminalId?: string | null,
): WorkspaceTerminalHref | null {
  const id = workspaceId?.trim() ?? "";
  if (!id) return null;
  const terminal = terminalId?.trim() ?? "";
  return {
    pathname: "/workspace/[workspaceId]/terminal",
    params: terminal ? { workspaceId: id, terminal } : { workspaceId: id },
  };
}

/** Terminal rows open the terminal. Chat rows open that chat, or the chat list. */
export function openSessionDestination(
  row: SessionDestination,
): WorkspaceTerminalHref | WorkspaceChatThreadHref | WorkspaceListHref | null {
  if (row.kind === "terminal") {
    return openWorkspaceTerminal(row.workspaceId, row.terminalCandidateId);
  }
  const workspaceId = row.workspaceId?.trim() ?? "";
  const chatId = row.chatId?.trim() ?? "";
  if (workspaceId && chatId) {
    return {
      pathname: "/workspace/[workspaceId]/chat/[chatId]",
      params: { workspaceId, chatId },
    };
  }
  if (!workspaceId) return null;
  return {
    pathname: "/workspace/[workspaceId]",
    params: { workspaceId },
  };
}
