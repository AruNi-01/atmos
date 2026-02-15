"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import "streamdown/styles.css";
import { useContextParams } from "@/hooks/use-context-params";
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  Message,
  MessageContent,
  MessageResponse,
  PromptInput,
  PromptInputAddAttachmentsButton,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  Shimmer,
  Skill,
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolState,
  usePromptInputAttachments,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui";
import { Bot, ChevronDown, ChevronUp, Folder, Loader2, MessageSquare, Plus, Square, X } from "lucide-react";
import { useProjectStore } from "@/hooks/use-project-store";
import { useDialogStore } from "@/hooks/use-dialog-store";
import { AgentIcon } from "./AgentIcon";
import { useAgentSession, type AgentServerMessage } from "@/hooks/use-agent-session";
import { agentApi } from "@/api/ws-api";
import { agentApi as agentRestApi } from "@/api/rest-api";
import type { RegistryAgent } from "@/api/ws-api";

type ChatMessage =
  | { role: "user"; content: string; files?: (import("ai").FileUIPart & { id: string })[] }
  | { role: "assistant"; content: string; isStreaming?: boolean }
  | {
    role: "tool";
    tool_call_id: string;
    tool: string;
    description: string;
    status: string;
    raw_input?: unknown;
    raw_output?: unknown;
  };

interface PendingPermission {
  request_id: string;
  tool: string;
  description: string;
  risk_level: string;
}

function toolStatusToState(status: string): ToolState {
  switch (status?.toLowerCase()) {
    case "running":
      return "input-available";
    case "completed":
      return "output-available";
    case "failed":
      return "output-error";
    default:
      return "output-available";
  }
}

function isSkillInvocation(raw_input?: unknown): raw_input is Record<string, unknown> & { skill?: string; command?: string } {
  if (!raw_input || typeof raw_input !== "object") return false;
  const o = raw_input as Record<string, unknown>;
  return "skill" in o && typeof o.skill === "string" && o.skill.length > 0;
}

function isSkillCommand(raw_input?: unknown): raw_input is Record<string, unknown> & { command: string } {
  if (!raw_input || typeof raw_input !== "object") return false;
  const o = raw_input as Record<string, unknown>;
  const cmd = o.command;
  return typeof cmd === "string" && (cmd.startsWith("agent-browser") || cmd.includes("skill"));
}

function getSkillName(raw_input: Record<string, unknown>): string {
  if (typeof raw_input.skill === "string" && raw_input.skill) return raw_input.skill;
  const cmd = raw_input.command;
  if (typeof cmd === "string" && cmd.startsWith("agent-browser")) return "agent-browser";
  return "Skill";
}

function ToolOrSkillMessage({
  tool,
  description,
  status,
  raw_input,
  raw_output,
}: {
  tool: string;
  description: string;
  status: string;
  raw_input?: unknown;
  raw_output?: unknown;
}) {
  const state = toolStatusToState(status);
  const isError = state === "output-error";
  const asSkill = isSkillInvocation(raw_input) || isSkillCommand(raw_input);

  // For tools: prefer description; avoid generic/status text
  const toolDisplayName =
    description &&
      description !== tool &&
      !/^(Processing|Executing|Running|Tool)\b/i.test(description)
      ? description
      : tool || "Tool";

  const skillName = asSkill && raw_input && typeof raw_input === "object"
    ? getSkillName(raw_input as Record<string, unknown>)
    : toolDisplayName;

  const output =
    raw_output !== undefined && raw_output !== null
      ? typeof raw_output === "string"
        ? raw_output
        : raw_output
      : !isError
        ? description || "Processing..."
        : undefined;

  const Wrapper = asSkill ? Skill : Tool;

  return (
    <Wrapper defaultOpen={false} className="w-full">
      <ToolHeader
        variant={asSkill ? "skill" : "tool"}
        type={asSkill ? `Skill: ${skillName}` : toolDisplayName}
        state={state}
        title={asSkill ? `Skill: ${skillName}` : toolDisplayName}
      />
      <ToolContent>
        <ToolInput
          input={raw_input}
          label={asSkill ? "Args" : "Parameters"}
        />
        <ToolOutput
          output={output}
          errorText={isError ? (description || "Execution failed") : null}
        />
      </ToolContent>
    </Wrapper>
  );
}

function PromptInputAttachmentsSection() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;
  return (
    <PromptInputHeader>
      <Attachments variant="inline">
        {attachments.files.map((a) => (
          <Attachment key={a.id} data={a} onRemove={() => attachments.remove(a.id)}>
            <AttachmentPreview />
            <AttachmentRemove />
          </Attachment>
        ))}
      </Attachments>
    </PromptInputHeader>
  );
}

export function AgentChatPanel() {
  const router = useRouter();
  const { workspaceId, projectId, effectiveContextId } = useContextParams();
  const { isAgentChatOpen, setAgentChatOpen } = useDialogStore();
  const [agentSelectOpen, setAgentSelectOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [installedAgents, setInstalledAgents] = useState<RegistryAgent[]>([]);
  const [registryId, setRegistryId] = useState<string>("");
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const [messageNavIndex, setMessageNavIndex] = useState(-1);
  const lastStreamRef = useRef<string>("");
  const lastDeltaRef = useRef<string>("");
  const [waitingForResponse, setWaitingForResponse] = useState(false);
  const { projects, fetchProjects } = useProjectStore();

  useEffect(() => {
    if (isAgentChatOpen && projects.length === 0) {
      fetchProjects();
    }
  }, [isAgentChatOpen, projects.length, fetchProjects]);

  const localPath = React.useMemo(() => {
    if (!effectiveContextId) return null;
    for (const p of projects) {
      const found = p.workspaces.find((w) => w.id === effectiveContextId);
      if (found) return found.localPath;
      if (p.id === effectiveContextId) return p.mainFilePath;
    }
    return null;
  }, [projects, effectiveContextId]);

  const handleMessage = useCallback((msg: AgentServerMessage) => {
    switch (msg.type) {
      case "stream":
        setWaitingForResponse(false);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.isStreaming) {
            if (msg.delta === lastDeltaRef.current) return prev;
            lastDeltaRef.current = msg.delta;
            if (msg.delta) lastStreamRef.current += msg.delta;
            return [
              ...prev.slice(0, -1),
              { ...last, content: lastStreamRef.current, isStreaming: !msg.done },
            ];
          }
          lastDeltaRef.current = msg.delta;
          lastStreamRef.current = msg.delta;
          return [
            ...prev,
            {
              role: "assistant" as const,
              content: msg.delta,
              isStreaming: !msg.done,
            },
          ];
        });
        break;
      case "tool_call": {
        const id = msg.tool_call_id ?? "";
        const isTerminal = msg.status === "completed" || msg.status === "failed";
        setMessages((prev) => {
          // Finalize streaming assistant when a tool event arrives (backend rarely sends done: true)
          let next = prev;
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.isStreaming) {
            next = prev.map((m, i) =>
              i === prev.length - 1 && m.role === "assistant"
                ? { ...m, isStreaming: false }
                : m
            );
          }

          let idx = -1;
          if (id) {
            idx = next.findIndex(
              (m) => m.role === "tool" && m.tool_call_id === id
            );
          }
          // Fallback: when Completed/Failed but no match, try raw_input match then last Running
          if (idx < 0 && isTerminal) {
            const incoming = msg.raw_input as Record<string, unknown> | undefined;
            if (incoming && typeof incoming === "object") {
              const matchesInput = (m: { raw_input?: unknown }) => {
                const r = m.raw_input as Record<string, unknown> | undefined;
                if (!r || typeof r !== "object") return false;
                for (const k of ["file_path", "path", "url", "command"]) {
                  const a = incoming[k];
                  const b = r[k];
                  if (a != null && b != null && String(a) === String(b))
                    return true;
                }
                return false;
              };
              idx = next.findIndex(
                (m) =>
                  m.role === "tool" &&
                  m.status?.toLowerCase() === "running" &&
                  matchesInput(m)
              );
            }
            if (idx < 0) {
              for (let i = next.length - 1; i >= 0; i--) {
                const m = next[i];
                if (m.role === "tool" && m.status?.toLowerCase() === "running") {
                  idx = i;
                  break;
                }
              }
            }
          }
          if (idx >= 0) {
            return next.map((m, i) =>
              i === idx && m.role === "tool"
                ? {
                  ...m,
                  tool: msg.tool || m.tool,
                  description: msg.description || m.description,
                  status: msg.status,
                  raw_input: msg.raw_input ?? m.raw_input,
                  raw_output: msg.raw_output ?? m.raw_output,
                }
                : m
            );
          }
          return [
            ...next,
            {
              role: "tool" as const,
              tool_call_id: id,
              tool: msg.tool,
              description: msg.description,
              status: msg.status,
              raw_input: msg.raw_input,
              raw_output: msg.raw_output,
            },
          ];
        });
        break;
      }
      case "permission_request":
        setPendingPermission({
          request_id: msg.request_id,
          tool: msg.tool,
          description: msg.description,
          risk_level: msg.risk_level,
        });
        break;
      case "error":
        setWaitingForResponse(false);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant" as const,
            content: `Error: ${msg.message}`,
            isStreaming: false,
          },
        ]);
        break;
      case "session_ended":
        break;
    }
  }, []);

  const {
    isConnecting,
    isConnected,
    error,
    sendPrompt,
    sendPermissionResponse,
    startSession,
    disconnect,
    sessionCwd,
  } = useAgentSession({
    workspaceId,
    registryId,
    onMessage: handleMessage,
  });

  useEffect(() => {
    if (isAgentChatOpen && !isConnected && !isConnecting) {
      setLoadingAgents(true);
      agentApi
        .listRegistry()
        .then(({ agents }) => {
          const installed = agents.filter((a) => a.installed);
          setInstalledAgents(installed);
          if (installed.length > 0) {
            const currentIsInstalled = installed.some((a) => a.id === registryId);
            if (!currentIsInstalled) setRegistryId(installed[0].id);
          } else {
            setRegistryId("");
          }
        })
        .catch(() => {
          setInstalledAgents([]);
          setRegistryId("");
        })
        .finally(() => setLoadingAgents(false));
    }
  }, [isAgentChatOpen, isConnected, isConnecting]);

  // Disconnect when user switches agent while connected
  const prevRegistryIdRef = useRef(registryId);
  useEffect(() => {
    if (prevRegistryIdRef.current !== registryId && isConnected) {
      disconnect();
    }
    prevRegistryIdRef.current = registryId;
  }, [registryId, isConnected, disconnect]);

  // Auto-connect when registryId is set, panel is open, and we have installed agents
  useEffect(() => {
    if (
      isAgentChatOpen &&
      registryId &&
      installedAgents.length > 0 &&
      !isConnected &&
      !isConnecting
    ) {
      startSession();
    }
  }, [
    isAgentChatOpen,
    registryId,
    installedAgents.length,
    isConnected,
    isConnecting,
    startSession,
  ]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Indices of user messages only (for prev/next navigation)
  const userMessageIndices = React.useMemo(
    () => messages.map((m, i) => (m.role === "user" ? i : -1)).filter((i) => i >= 0),
    [messages]
  );

  const scrollToMessage = useCallback((messageIndex: number) => {
    const el = conversationRef.current?.querySelector(
      `[data-message-index="${messageIndex}"]`
    ) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    }
    setMessageNavIndex(messageIndex);
  }, []);

  const handlePrevMessage = useCallback(() => {
    if (userMessageIndices.length === 0) return;
    const currentIdx = userMessageIndices.indexOf(messageNavIndex);
    // When not focused on any user message, prev goes to last
    if (currentIdx < 0) {
      scrollToMessage(userMessageIndices[userMessageIndices.length - 1]);
      return;
    }
    if (currentIdx <= 0) return; // no loop at top
    scrollToMessage(userMessageIndices[currentIdx - 1]);
  }, [userMessageIndices, messageNavIndex, scrollToMessage]);

  const handleNextMessage = useCallback(() => {
    if (userMessageIndices.length === 0) return;
    const currentIdx = userMessageIndices.indexOf(messageNavIndex);
    // When not focused on any user message, next goes to first
    if (currentIdx < 0) {
      scrollToMessage(userMessageIndices[0]);
      return;
    }
    if (currentIdx >= userMessageIndices.length - 1) return; // no loop at bottom
    scrollToMessage(userMessageIndices[currentIdx + 1]);
  }, [userMessageIndices, messageNavIndex, scrollToMessage]);

  const handleSubmit = useCallback(
    async (message: { text: string; files?: import("ai").FileUIPart[] }) => {
      const text = message.text.trim();
      if (!text || !isConnected) return;
      lastDeltaRef.current = "";
      lastStreamRef.current = "";
      setWaitingForResponse(true);
      setMessages((prev) => [
        ...prev,
        {
          role: "user" as const,
          content: text,
          files: message.files?.map((f, i) => ({ ...f, id: `f-${Date.now()}-${i}` })),
        },
      ]);

      let finalPrompt = text;

      const uploadPath = localPath ?? sessionCwd;
      if (message.files && message.files.length > 0 && uploadPath) {
        try {
          const { paths } = await agentRestApi.uploadAttachments(
            uploadPath,
            message.files.map((f) => ({
              url: f.url,
              filename: f.filename,
              mediaType: f.mediaType,
            }))
          );
          if (paths.length > 0) {
            const attachmentInfo = paths.map((p) => `- ${p}`).join("\n");
            finalPrompt = `${text}\n\n[Attached files have been saved to the following paths, please read them to understand the content:]\n${attachmentInfo}`;
          }
        } catch (err) {
          console.error("Failed to upload attachments:", err);
        }
      }

      sendPrompt(finalPrompt);
    },
    [isConnected, sendPrompt, localPath, sessionCwd]
  );

  const handleClose = useCallback(() => {
    disconnect();
    setMessages([]);
    setPendingPermission(null);
    setAgentChatOpen(false);
  }, [disconnect, setAgentChatOpen]);

  const handlePermission = useCallback(
    (allowed: boolean) => {
      if (!pendingPermission) return;
      sendPermissionResponse(pendingPermission.request_id, allowed);
      setPendingPermission(null);
    },
    [pendingPermission, sendPermissionResponse]
  );

  if (!isAgentChatOpen) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex w-[400px] flex-col rounded-xl border border-border bg-background shadow-lg"
      style={{ height: "min(560px, 70dvh)" }}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="flex items-center gap-2 shrink-0">
            <Bot className="size-4 text-foreground" />
            <span className="text-sm font-medium">Agent Chat</span>
          </div>

          {(localPath ?? sessionCwd) && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="ml-3 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted/40 border border-border/50 max-w-[180px] min-w-0 overflow-hidden cursor-help">
                    <Folder className="size-3 text-muted-foreground/70 shrink-0" />
                    <span
                      className="text-[10px] text-muted-foreground/80 truncate select-none leading-none"
                      style={{ direction: "rtl", textAlign: "left" }}
                    >
                      {localPath ?? sessionCwd}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs break-all">
                  {!localPath && sessionCwd && (
                    <p className="text-[11px] text-muted-foreground mb-0.5">Temp directory</p>
                  )}
                  <p className="text-[11px]">{localPath ?? sessionCwd}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close chat"
        >
          <X className="size-4" />
        </button>
      </div>

      <div ref={conversationRef} className="min-h-0 flex-1 overflow-hidden">
        <Conversation className="min-h-0 h-full overflow-hidden">
          <ConversationContent className="gap-3 p-4!">
            {!isConnected && !isConnecting && (
              <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                <p className="mb-2 text-pretty">
                  {workspaceId
                    ? "File access enabled for this workspace."
                    : "General AI assistant (no file access). Open a workspace to grant file access."}
                </p>
                <p className="text-xs text-muted-foreground/80">
                  Select an Agent in the dropdown to connect. Claude Code uses ~/.claude/settings.json or ANTHROPIC_API_KEY.
                </p>
              </div>
            )}
            {isConnecting && (
              <div className="flex items-center justify-center py-6">
                <Shimmer duration={1.5}>Connecting...</Shimmer>
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            {isConnected && messages.length === 0 && !isConnecting && !error && (
              <ConversationEmptyState
                icon={<MessageSquare className="size-12" />}
                title="Start a conversation"
                description="Type a message below to begin chatting"
              />
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                data-message-index={i}
                className={m.role === "tool" ? "w-full min-w-0" : undefined}
              >
                <Message from={m.role === "tool" ? "assistant" : m.role}>
                  <MessageContent>
                    {m.role === "user" && (
                      <>
                        {m.files && m.files.length > 0 && (
                          <Attachments variant="inline" className="mb-2">
                            {m.files.map((f) => (
                              <Attachment key={f.id} data={f}>
                                <AttachmentPreview />
                                <AttachmentRemove />
                              </Attachment>
                            ))}
                          </Attachments>
                        )}
                        {m.content}
                      </>
                    )}
                    {m.role === "assistant" && (
                      <MessageResponse
                        parseIncompleteMarkdown
                        animated={m.isStreaming}
                        caret={m.isStreaming ? "block" : undefined}
                      >
                        {m.content}
                      </MessageResponse>
                    )}
                    {m.role === "tool" && (
                      <ToolOrSkillMessage
                        tool={m.tool}
                        description={m.description}
                        status={m.status}
                        raw_input={m.raw_input}
                        raw_output={m.raw_output}
                      />
                    )}
                  </MessageContent>
                </Message>
              </div>
            ))}
            {waitingForResponse && (
              <div className="flex items-center gap-2 py-2">
                <Shimmer duration={1.5}>Generating response...</Shimmer>
              </div>
            )}
            <div ref={bottomRef} />
          </ConversationContent>
          <ConversationScrollButton className="absolute bottom-4 right-4" />
          {userMessageIndices.length >= 2 && (
            <div className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-0.5 rounded-sm border border-border/50 bg-background/80 py-1 shadow-sm backdrop-blur-sm dark:bg-background/60">
              <button
                type="button"
                onClick={handlePrevMessage}
                disabled={
                  userMessageIndices.length > 0 &&
                  userMessageIndices.indexOf(messageNavIndex) === 0
                }
                className="flex items-center justify-center rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                aria-label="Previous message"
              >
                <ChevronUp className="size-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMessage}
                disabled={
                  userMessageIndices.length > 0 &&
                  userMessageIndices.indexOf(messageNavIndex) >=
                  userMessageIndices.length - 1
                }
                className="flex items-center justify-center rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                aria-label="Next message"
              >
                <ChevronDown className="size-4" />
              </button>
            </div>
          )}
        </Conversation>
      </div>

      {pendingPermission && (
        <div className="shrink-0 border-t border-border p-3">
          <Confirmation
            approval={{ id: pendingPermission.request_id }}
            state="approval-requested"
            className="border-amber-500/50 bg-amber-500/10"
          >
            <ConfirmationRequest>
              <span className="font-medium">Permission requested</span>
              <p className="mt-1 text-sm text-muted-foreground">
                {pendingPermission.description}
              </p>
            </ConfirmationRequest>
            <ConfirmationActions>
              <ConfirmationAction
                variant="outline"
                onClick={() => handlePermission(false)}
              >
                Deny
              </ConfirmationAction>
              <ConfirmationAction onClick={() => handlePermission(true)}>
                Allow
              </ConfirmationAction>
            </ConfirmationActions>
          </Confirmation>
        </div>
      )}

      <div className="shrink-0 border-t border-border p-3">
        <PromptInput
          onSubmit={(msg) => handleSubmit({ text: msg.text, files: msg.files })}
          className="w-full"
          multiple
        >
          <PromptInputAttachmentsSection />
          <PromptInputBody>
            <PromptInputTextarea
              placeholder={isConnected ? "Type a message..." : "Select agent to connect"}
              disabled={!isConnected}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputAddAttachmentsButton />
              {loadingAgents ? (
                <div className="flex h-8 items-center gap-2 px-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 shrink-0 animate-spin" />
                  Loading
                </div>
              ) : installedAgents.length === 0 ? (
                <span className="px-2 text-xs text-muted-foreground">No agent</span>
              ) : (
                <PromptInputSelect
                  value={registryId}
                  onValueChange={setRegistryId}
                  open={agentSelectOpen}
                  onOpenChange={setAgentSelectOpen}
                >
                  <PromptInputSelectTrigger className="h-8 min-w-[100px] gap-1.5">
                    <PromptInputSelectValue placeholder="Agent" />
                  </PromptInputSelectTrigger>
                  <PromptInputSelectContent className="p-0">
                    {installedAgents.map((agent) => (
                      <PromptInputSelectItem key={agent.id} value={agent.id}>
                        <span className="flex items-center gap-2">
                          <AgentIcon registryId={agent.id} name={agent.name} size={14} />
                          {agent.name}
                        </span>
                      </PromptInputSelectItem>
                    ))}
                    <div className="sticky bottom-0 border-t border-border bg-popover p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setAgentSelectOpen(false);
                          router.push("/agents");
                        }}
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <Plus className="size-4" />
                        Add More Agent
                      </button>
                    </div>
                  </PromptInputSelectContent>
                </PromptInputSelect>
              )}
            </PromptInputTools>
            <PromptInputSubmit
              status={waitingForResponse ? "streaming" : undefined}
              onStop={
                waitingForResponse
                  ? () => {
                    disconnect();
                    setWaitingForResponse(false);
                  }
                  : undefined
              }
              disabled={!isConnected}
              size={waitingForResponse ? "sm" : "icon-sm"}
            >
              {waitingForResponse ? (
                <span className="flex items-center gap-1.5">
                  <Square className="size-4 shrink-0" />
                </span>
              ) : undefined}
            </PromptInputSubmit>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
