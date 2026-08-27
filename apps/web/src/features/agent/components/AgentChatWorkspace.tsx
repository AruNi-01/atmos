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
  const [permission, setPermission] = useState<{
    request_id: string;
    tool: string;
    description: string;
    options: Array<{ option_id: string; name: string }>;
  } | null>(null);
  const consumedPrompts = useRef(new Set<string>());

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
    const pending = snapshot.pending_permission as typeof permission;
    setPermission(pending && pending.request_id ? pending : null);
    const listed = await conversationApi.list({});
    setList(listed.items ?? []);
  }, [conversationId, t]);

  useEffect(() => {
    void load();
    void conversationApi.subscribe(conversationId);
    void agentBehaviourSettingsApi.get().then((settings) => {
      setPolicy(resolveFollowupPolicy(settings.followup_policy));
    });
    void agentApi.listRegistry().then((result) => {
      const installed = (result.agents ?? [])
        .filter((agent) => agent.installed)
        .map((agent) => ({ id: agent.id, name: agent.name }));
      setAgents(installed);
    });
    const off = useWebSocketStore.getState().onEvent("conversation_event", (payload) => {
      const event = payload as {
        conversation_id?: string;
        payload?: { type?: string; turn_id?: string };
      };
      if (event.conversation_id !== conversationId) return;
      if (event.payload?.type === "turn_started") {
        setBusy(true);
        setRunningTurnId(event.payload.turn_id ?? null);
      }
      if (event.payload?.type === "turn_completed") {
        setBusy(false);
        setRunningTurnId(null);
        setPermission(null);
      }
      if (event.payload?.type === "permission_requested") {
        setBusy(true);
      }
      if (event.payload?.type === "runtime_status") {
        const status = (event.payload as { status?: string }).status;
        if (status === "detached" || status === "closed" || status === "ready") {
          if (status !== "ready") {
            setBusy(false);
            setRunningTurnId(null);
            setPermission(null);
          }
        }
      }
      void load();
    });
    return () => {
      off();
      void conversationApi.unsubscribe(conversationId);
    };
  }, [conversationId, load]);

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
    try {
      if (busy) {
        const action = routeBusySubmit({ policy, oneShot: mode ?? null });
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
      window.alert(error instanceof Error ? error.message : t("sendFailed"));
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
                cwd: undefined,
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
                  onContextMenu={async (event) => {
                    event.preventDefault();
                    const next = window.prompt(t("rename"), row.title || "");
                    if (next && next.trim()) {
                      await conversationApi.rename(row.id, next.trim());
                      void load();
                    }
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{row.title || t("untitled")}</span>
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
                  <Message key={message.id} from={message.role === "user" ? "user" : "assistant"}>
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
                <span className="min-w-0 flex-1 truncate">{item.prompt}</span>
                <button
                  type="button"
                  onClick={async () => {
                    const next = window.prompt(t("edit"), item.prompt);
                    if (next && next.trim()) {
                      await conversationApi.queueUpdate(conversationId, item.id, {
                        text: next.trim(),
                      });
                      void load();
                    }
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
              {(permission.options.length > 0
                ? permission.options
                : [
                    { option_id: "allow", name: t("allow") },
                    { option_id: "reject", name: t("reject") },
                  ]
              ).map((option) => (
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
          <textarea
            className="min-h-16 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("placeholder")}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          {busy ? (
            <div className="mt-2 flex gap-2 text-xs">
              <button type="button" onClick={() => void submit("queue")}>
                {policy === "queue" ? t("queue") : t("oneShotQueue")}
              </button>
              {supportsSteer ? (
                <button type="button" onClick={() => void submit("steer")}>
                  {policy === "steer" ? t("steer") : t("oneShotSteer")}
                </button>
              ) : null}
              <button type="button" onClick={() => void conversationApi.cancel(conversationId)}>
                {t("stop")}
              </button>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
