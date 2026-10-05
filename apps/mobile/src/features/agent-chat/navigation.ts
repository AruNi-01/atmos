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
  params: { workspaceId: string; chatId: string; title?: string };
};

export type SessionDestination = {
  kind: "terminal" | "chat";
  workspaceId: string | null;
  /** Project guid for a main-checkout chat. The chat route treats this as its scope id. */
  projectId?: string | null;
  terminalCandidateId: string | null;
  chatId: string | null;
  title?: string | null;
  titlePending?: boolean;
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
  const scopeId = workspaceId || row.projectId?.trim() || "";
  const chatId = row.chatId?.trim() ?? "";
  if (scopeId && chatId) {
    const title = row.titlePending ? "" : row.title?.trim() ?? "";
    return {
      pathname: "/workspace/[workspaceId]/chat/[chatId]",
      params: title ? { workspaceId: scopeId, chatId, title } : { workspaceId: scopeId, chatId },
    };
  }
  if (!workspaceId) return null;
  return {
    pathname: "/workspace/[workspaceId]",
    params: { workspaceId },
  };
}
