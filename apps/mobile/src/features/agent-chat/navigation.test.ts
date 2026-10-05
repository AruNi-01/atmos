// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { openSessionDestination, openWorkspaceChatList, openWorkspaceTerminal } from "./navigation";

describe("openWorkspaceChatList", () => {
  test("null workspace id does not navigate", () => {
    expect(openWorkspaceChatList(null)).toBeNull();
    expect(openWorkspaceChatList("")).toBeNull();
    expect(openWorkspaceChatList("   ")).toBeNull();
  });

  test("workspace id opens the chat list", () => {
    expect(openWorkspaceChatList("ws-1")).toEqual({
      pathname: "/workspace/[workspaceId]/chat",
      params: { workspaceId: "ws-1" },
    });
  });
});

describe("openSessionDestination", () => {
  test("a terminal row opens the terminal", () => {
    expect(openSessionDestination({
      kind: "terminal",
      workspaceId: "ws-1",
      terminalCandidateId: "pane-1",
      chatId: null,
    })).toEqual(openWorkspaceTerminal("ws-1", "pane-1"));
  });

  test("a chat row opens that chat", () => {
    expect(openSessionDestination({
      kind: "chat",
      workspaceId: "ws-1",
      terminalCandidateId: null,
      chatId: "chat-1",
    })).toEqual({
      pathname: "/workspace/[workspaceId]/chat/[chatId]",
      params: { workspaceId: "ws-1", chatId: "chat-1" },
    });
  });

  test("a known chat title travels with the row", () => {
    expect(openSessionDestination({
      kind: "chat",
      workspaceId: "ws-1",
      terminalCandidateId: null,
      chatId: "chat-1",
      title: "Fix login",
    })).toEqual({
      pathname: "/workspace/[workspaceId]/chat/[chatId]",
      params: { workspaceId: "ws-1", chatId: "chat-1", title: "Fix login" },
    });
  });

  test("a pending chat title is not passed as Chat", () => {
    expect(openSessionDestination({
      kind: "chat",
      workspaceId: "ws-1",
      terminalCandidateId: null,
      chatId: "chat-1",
      title: "Chat",
      titlePending: true,
    })).toEqual({
      pathname: "/workspace/[workspaceId]/chat/[chatId]",
      params: { workspaceId: "ws-1", chatId: "chat-1" },
    });
  });

  test("a project chat opens through the project scope id", () => {
    expect(openSessionDestination({
      kind: "chat",
      workspaceId: null,
      projectId: "project-1",
      terminalCandidateId: null,
      chatId: "chat-1",
      title: "Explore the repo",
    })).toEqual({
      pathname: "/workspace/[workspaceId]/chat/[chatId]",
      params: { workspaceId: "project-1", chatId: "chat-1", title: "Explore the repo" },
    });
  });

  test("a chat row without an id opens the workspace list", () => {
    expect(openSessionDestination({
      kind: "chat",
      workspaceId: "ws-1",
      terminalCandidateId: null,
      chatId: null,
    })).toEqual({
      pathname: "/workspace/[workspaceId]",
      params: { workspaceId: "ws-1" },
    });
  });
});
