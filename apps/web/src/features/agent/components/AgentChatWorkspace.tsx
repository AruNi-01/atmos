"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  Message,
  MessageContent,
  MessageResponse,
} from "@workspace/ui";
import { MessageSquare, Plus } from "lucide-react";
import {
  conversationApi,
  type AgentModelCatalog,
  type ConversationIndexEntry,
} from "@/api/ws/conversation-api";
import { agentApi } from "@/api/ws/agent-api";
import { groupConversationsByCwd } from "@/features/agent/lib/group-conversations";
import { routeBusySubmit, resolveFollowupPolicy } from "@/features/agent/lib/followup-policy";
import {
  conversationEventFor,
  foldTurnsFromEvent,
  foldUserRowsFromEvent,
  type ConversationClientEventPayload,
  type ConversationFanoutRow,
} from "@/features/agent/lib/conversation-events";
import { agentBehaviourSettingsApi } from "@/api/ws/settings-api";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import {
  buildQueuedAgentPromptContent,
  getAgentPromptQueueKey,
  useDialogStore,
} from "@/app-shell/state/use-dialog-store";

type SnapshotPart = {
  type: string;
  text?: string;
  name?: string;
  title?: string;
  status?: string;
  message?: string;
};

type SnapshotMessage = {
  id: string;
  role: string;
  kind?: string;
  parts: SnapshotPart[];
};

type SnapshotTurn = {
  id: string;
  status: string;
  messages: SnapshotMessage[];
};

type QueueRow = {
  id: string;
  seq: number;
  status: string;
  prompt: string;
};

type ThinkingShape = {
  type?: string;
  options?: string[];
};

function thinkingChoices(catalog: AgentModelCatalog | null, modelId: string): string[] {
  const model = catalog?.models.find((item) => item.id === modelId);
  const thinking = (model?.thinking ?? catalog?.thinking) as ThinkingShape | undefined;
  if (!thinking || thinking.type === "none" || thinking.type === "encoded_in_model") {
    return [];
  }
  if (thinking.type === "enum" && Array.isArray(thinking.options)) {
    return thinking.options.filter((item) => item.trim().length > 0);
  }
  return [];
}

function partText(part: SnapshotPart): string {
  if (part.type === "error") return part.message ?? part.text ?? "";
  if (part.type === "tool_call") return part.title || part.name || "Tool";
  return part.text ?? "";
}

export function AgentChatWorkspace({
  conversationId,
  onOpenConversation,
}: {
  conversationId: string;
  onOpenConversation?: (id: string) => void;
}) {
  const t = useTranslations("Agent.workspace");
  const [title, setTitle] = useState("");
  const [turns, setTurns] = useState<SnapshotTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [runningTurnId, setRunningTurnId] = useState<string | null>(null);
  const [supportsSteer, setSupportsSteer] = useState(false);
  const [list, setList] = useState<ConversationIndexEntry[]>([]);
  const [policy, setPolicy] = useState<"queue" | "steer">("queue");
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [providerId, setProviderId] = useState("claude");
  const [modelId, setModelId] = useState("");
  const [thinkingId, setThinkingId] = useState("");
  const [catalog, setCatalog] = useState<AgentModelCatalog | null>(null);
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [cwd, setCwd] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [permission, setPermission] = useState<{
    request_id: string;
    tool: string;
    description: string;
    options: Array<{ option_id: string; name: string }>;
  } | null>(null);
  const consumedPrompts = useRef(new Set<string>());
  const liveUserRows = useRef<ConversationFanoutRow[]>([]);
  const lastSeq = useRef(0);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const [editingQueueValue, setEditingQueueValue] = useState("");

  const load = useCallback(async () => {
    const snapshot = await conversationApi.get(conversationId);
    const meta = snapshot.meta as {
      title?: string | null;
      supports_steer?: boolean;
      runtime_status?: string;
      provider_id?: string;
      selected_model?: string | null;
      selected_thinking?: string | null;
      workspace_id?: string | null;
      project_id?: string | null;
      cwd?: string;
    };
    setTitle(meta.title?.trim() || t("untitled"));
    setSupportsSteer(Boolean(meta.supports_steer));
    const nextTurns = (snapshot.turns as SnapshotTurn[]) ?? [];
    setBusy(meta.runtime_status === "running_turn" || meta.runtime_status === "waiting_permission");
    setTurns(nextTurns);
    const running = nextTurns.find(
      (turn) => turn.status === "running" || turn.status === "waiting_permission",
    );
    setRunningTurnId(running?.id ?? null);
    setQueue((snapshot.queue as QueueRow[]) ?? []);
    setProviderId(meta.provider_id || "claude");
    setModelId(meta.selected_model ?? "");
    setThinkingId(meta.selected_thinking ?? "");
    setWorkspaceId(meta.workspace_id ?? null);
    setProjectId(meta.project_id ?? null);
    setCwd(meta.cwd ?? "");
    const pending = snapshot.pending_permission as typeof permission;
    setPermission(pending && pending.request_id ? pending : null);
    const listed = await conversationApi.list({
      workspace_id: meta.workspace_id ?? null,
      project_id: meta.project_id ?? null,
    });
    setList(listed.items ?? []);
    lastSeq.current = Number((snapshot.meta as { last_event_seq?: number }).last_event_seq ?? 0);
  }, [conversationId, t]);

  useEffect(() => {
    void load().then(() => conversationApi.subscribe(conversationId, lastSeq.current));
    void agentBehaviourSettingsApi.get().then((settings) => {
      setPolicy(resolveFollowupPolicy(settings.followup_policy));
    });
    const policyTimer = window.setInterval(() => {
      void agentBehaviourSettingsApi.get().then((settings) => {
        setPolicy(resolveFollowupPolicy(settings.followup_policy));
      });
    }, 15_000);
    void agentApi.listRegistry().then((result) => {
      const installed = (result.agents ?? [])
        .filter((agent) => agent.installed)
        .map((agent) => ({ id: agent.id, name: agent.name }));
      setAgents(installed);
    });
    const off = useWebSocketStore.getState().onEvent("conversation_event", (payload) => {
      const event = payload as ConversationClientEventPayload;
      if (!conversationEventFor(event, conversationId)) return;
      if (typeof event.sequence === "number") {
        if (event.sequence <= lastSeq.current) return;
        lastSeq.current = event.sequence;
      }
      liveUserRows.current = foldUserRowsFromEvent(liveUserRows.current, event, conversationId);
      setTurns((current) => foldTurnsFromEvent(current as never, event, conversationId) as typeof current);
      if (event.payload?.type === "turn_started") {
        setBusy(true);
        setRunningTurnId(event.payload.turn_id ?? null);
      }
      if (event.payload?.type === "turn_completed") {
        setBusy(false);
        setRunningTurnId(null);
        setPermission(null);
      }
      if (event.payload?.type === "permission_requested" && event.payload.request?.request_id) {
        setBusy(true);
        setPermission({
          request_id: event.payload.request.request_id,
          tool: event.payload.request.tool ?? "",
          description: event.payload.request.description ?? "",
          options: event.payload.request.options ?? [],
        });
      }
      if (event.payload?.type === "permission_resolved") {
        setPermission(null);
      }
      if (event.payload?.type === "queue_updated" && event.payload.items) {
        setQueue(event.payload.items);
      }
      if (event.payload?.type === "runtime_status") {
        const status = (event.payload as { status?: string }).status;
        if (status === "detached" || status === "closed") {
          setBusy(false);
          setRunningTurnId(null);
          setPermission(null);
        }
      }
    });
    const offCatalog = useWebSocketStore.getState().onEvent("agent_model_catalog_updated", (payload) => {
      const update = payload as { agent_id?: string; catalog?: AgentModelCatalog };
      if (update.agent_id && update.catalog && update.agent_id === providerId) {
        setCatalog(update.catalog);
      }
    });
    return () => {
      off();
      offCatalog();
      window.clearInterval(policyTimer);
      void conversationApi.unsubscribe(conversationId);
    };
  }, [conversationId, load, providerId]);

  useEffect(() => {
    let cancelled = false;
    void conversationApi.catalogGet(providerId).then((next) => {
      if (!cancelled) setCatalog(next);
    });
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  const thinkingOptions = useMemo(
    () => thinkingChoices(catalog, modelId),
    [catalog, modelId],
  );

  useEffect(() => {
    const key = getAgentPromptQueueKey(workspaceId, projectId, "default");
    const drain = async () => {
      const store = useDialogStore.getState();
      const queued = store.agentChatPromptQueues[key] ?? [];
      for (const item of queued) {
        if (consumedPrompts.current.has(item.id)) continue;
        consumedPrompts.current.add(item.id);
        store.shiftQueuedAgentChatPrompt(workspaceId, projectId, "default");
        const text = buildQueuedAgentPromptContent(item.prompt, item.attachmentPaths);
        if (!text.trim()) continue;
        if (busy) {
          await conversationApi.queueAdd(conversationId, text, item.attachmentPaths);
        } else {
          await conversationApi.send(conversationId, text, item.attachmentPaths);
        }
      }
    };
    void drain();
  }, [busy, conversationId, projectId, workspaceId, turns.length]);

  const groups = useMemo(() => groupConversationsByCwd(list), [list]);

  const persistConfig = async (patch: {
    provider_id?: string;
    model?: string;
    thinking?: string;
  }) => {
    await conversationApi.configure(conversationId, patch);
    void load();
  };

  const submit = async (mode?: "queue" | "steer") => {
    const text = draft.trim();
    if (!text) return;
    setSendError(null);
    try {
      if (busy) {
        const action = routeBusySubmit({
          policy,
          oneShot: mode ?? null,
          supportsSteer,
        });
        if (action === "steer") {
          if (!supportsSteer || !runningTurnId) return;
          await conversationApi.steer(conversationId, runningTurnId, text);
        } else {
          await conversationApi.queueAdd(conversationId, text);
        }
      } else {
        await conversationApi.send(conversationId, text);
      }
      setDraft("");
    } catch (error) {
      setSendError(error instanceof Error ? error.message : t("sendFailed"));
    }
  };

  return (
    <div className="flex h-full min-h-0" data-agent-chat-workspace={conversationId}>
      <aside className="flex w-64 shrink-0 flex-col border-r border-border/60">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-medium">{t("history")}</span>
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-md hover:bg-accent"
            onClick={async () => {
              const created = await conversationApi.create({
                provider_id: providerId,
                cwd: cwd || null,
                workspace_id: workspaceId,
                project_id: projectId,
              });
              onOpenConversation?.(created.id);
            }}
            aria-label={t("newConversation")}
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
          {groups.map((group) => (
            <div key={group.cwd || "none"} className="mb-3">
              <div className="truncate px-2 py-1 text-xs text-muted-foreground">
                {group.cwd || t("noFolder")}
              </div>
              {group.conversations.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`flex w-full truncate rounded-md px-2 py-1.5 text-left text-sm ${
                    row.id === conversationId ? "bg-accent" : "hover:bg-accent/60"
                  }`}
                  onClick={() => onOpenConversation?.(row.id)}
                >
                  {renameId === row.id ? (
                    <input
                      className="min-w-0 flex-1 rounded-sm border border-border bg-background px-1 text-sm"
                      value={renameValue}
                      autoFocus
                      onChange={(event) => setRenameValue(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onBlur={async () => {
                        if (renameValue.trim()) {
                          await conversationApi.rename(row.id, renameValue.trim());
                          void load();
                        }
                        setRenameId(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                        if (event.key === "Escape") {
                          setRenameId(null);
                        }
                      }}
                    />
                  ) : (
                    <span
                      className="min-w-0 flex-1 truncate"
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        setRenameId(row.id);
                        setRenameValue(row.title || "");
                      }}
                    >
                      {row.title || t("untitled")}
                    </span>
                  )}
                  <span
                    role="button"
                    tabIndex={0}
                    className="ml-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={async (event) => {
                      event.stopPropagation();
                      await conversationApi.delete(row.id);
                      void load();
                    }}
                  >
                    ×
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-10 items-center gap-2 border-b border-border/60 px-4 text-sm">
          <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
          <button
            type="button"
            className="rounded-md border border-border px-1.5 py-0.5 text-xs"
            onClick={() => {
              window.open(`/agent-chat?conversationId=${encodeURIComponent(conversationId)}`, "_blank");
            }}
          >
            {t("openStandalone")}
          </button>
          <select
            className="max-w-36 rounded-md border border-border bg-background px-1.5 py-1 text-xs"
            value={providerId}
            aria-label={t("agent")}
            onChange={(event) => {
              const next = event.target.value;
              setProviderId(next);
              void persistConfig({ provider_id: next });
            }}
          >
            {(agents.length > 0 ? agents : [{ id: providerId, name: providerId }]).map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
          <select
            className="max-w-40 rounded-md border border-border bg-background px-1.5 py-1 text-xs"
            value={modelId}
            aria-label={t("model")}
            onChange={(event) => {
              const next = event.target.value;
              setModelId(next);
              void persistConfig({ model: next, thinking: "" });
            }}
          >
            <option value="">{t("model")}</option>
            {(catalog?.models ?? []).map((model) => (
              <option key={model.id} value={model.id}>
                {model.label || model.id}
              </option>
            ))}
          </select>
          {thinkingOptions.length > 0 ? (
            <select
              className="max-w-28 rounded-md border border-border bg-background px-1.5 py-1 text-xs"
              value={thinkingId}
              aria-label={t("thinking")}
              onChange={(event) => {
                const next = event.target.value;
                setThinkingId(next);
                void persistConfig({ thinking: next });
              }}
            >
              <option value="">{t("thinking")}</option>
              {thinkingOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : null}
        </header>
        <Conversation className="min-h-0 flex-1">
          <ConversationContent className="px-6 py-4">
            {turns.length === 0 ? (
              <ConversationEmptyState
                icon={<MessageSquare className="size-5" />}
                title={t("emptyTitle")}
                description={t("emptyDescription")}
              />
            ) : (
              turns.flatMap((turn) =>
                turn.messages.map((message) => (
                  <div key={message.id} data-agent-chat-message={message.id}>
                  <Message from={message.role === "user" ? "user" : "assistant"}>
                    <MessageContent>
                      {message.parts.map((part, index) => {
                        if (part.type === "thinking") {
                          return (
                            <p
                              key={`${message.id}-think-${index}`}
                              className="text-xs italic text-muted-foreground"
                            >
                              {part.text}
                            </p>
                          );
                        }
                        if (part.type === "tool_call") {
                          return (
                            <div
                              key={`${message.id}-tool-${index}`}
                              className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs"
                            >
                              <div className="font-medium">
                                {part.title || part.name || t("tool")}
                                {part.status ? ` · ${part.status}` : ""}
                              </div>
                            </div>
                          );
                        }
                        if (part.type === "plan") {
                          return (
                            <p
                              key={`${message.id}-plan-${index}`}
                              className="text-xs text-muted-foreground"
                            >
                              {t("plan")}
                            </p>
                          );
                        }
                        const text = partText(part);
                        if (!text) return null;
                        return (
                          <MessageResponse key={`${message.id}-text-${index}`}>
                            {text}
                          </MessageResponse>
                        );
                      })}
                    </MessageContent>
                  </Message>
                  </div>
                )),
              )
            )}
          </ConversationContent>
        </Conversation>
        {queue.length > 0 ? (
          <div className="border-t border-border/60 px-4 py-2 text-xs">
            <div className="mb-1 font-medium">{t("queued")}</div>
            {queue.map((item, index) => (
              <div key={item.id} className="mb-1 flex items-center gap-2">
                {editingQueueId === item.id ? (
                  <input
                    className="min-w-0 flex-1 rounded-sm border border-border bg-background px-1 text-xs"
                    value={editingQueueValue}
                    autoFocus
                    aria-label={t("edit")}
                    onChange={(event) => setEditingQueueValue(event.target.value)}
                    onBlur={async () => {
                      if (editingQueueValue.trim() && editingQueueValue.trim() !== item.prompt) {
                        await conversationApi.queueUpdate(conversationId, item.id, {
                          text: editingQueueValue.trim(),
                        });
                        void load();
                      }
                      setEditingQueueId(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                      if (event.key === "Escape") {
                        setEditingQueueId(null);
                      }
                    }}
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate">{item.prompt}</span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditingQueueId(item.id);
                    setEditingQueueValue(item.prompt);
                  }}
                >
                  {t("edit")}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await conversationApi.queueUpdate(conversationId, item.id, {
                      status: item.status === "paused" ? "pending" : "paused",
                    });
                    void load();
                  }}
                >
                  {item.status === "paused" ? t("resume") : t("pause")}
                </button>
                {index > 0 ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const ids = queue.map((row) => row.id);
                      const previous = ids[index - 1];
                      if (!previous) return;
                      ids[index - 1] = item.id;
                      ids[index] = previous;
                      await conversationApi.queueReorder(conversationId, ids);
                      void load();
                    }}
                  >
                    {t("moveUp")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={async () => {
                    await conversationApi.queueDelete(conversationId, item.id);
                    void load();
                  }}
                >
                  {t("delete")}
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {permission ? (
          <div className="border-t border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
            <div className="font-medium">{t("permissionTitle")}</div>
            <p className="mt-1 text-muted-foreground">
              {permission.tool}: {permission.description}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {permission.options.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("permissionNoOptions")}</p>
              ) : permission.options.map((option) => (
                <button
                  key={option.option_id}
                  type="button"
                  className="rounded-md border border-border px-2 py-1"
                  onClick={async () => {
                    await conversationApi.permissionRespond(
                      conversationId,
                      permission.request_id,
                      option.option_id,
                    );
                    setPermission(null);
                    void load();
                  }}
                >
                  {option.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <form
          className="border-t border-border/60 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {sendError ? (
            <p className="mb-2 text-xs text-destructive">{sendError}</p>
          ) : null}
          <textarea
            data-agent-chat-composer=""
            className="min-h-16 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("placeholder")}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <div className="mt-2 flex gap-2 text-xs">
            {busy ? (
              <>
                <button type="button" onClick={() => void submit("queue")}>
                  {policy === "queue" ? t("queue") : t("oneShotQueue")}
                </button>
                {supportsSteer ? (
                  <button type="button" onClick={() => void submit("steer")}>
                    {policy === "steer" ? t("steer") : t("oneShotSteer")}
                  </button>
                ) : (
                  <button type="button" disabled className="cursor-not-allowed opacity-50">
                    {t("steerUnavailable")}
                  </button>
                )}
                <button type="button" onClick={() => void conversationApi.cancel(conversationId)}>
                  {t("stop")}
                </button>
              </>
            ) : (
              <button type="submit">{t("send")}</button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
