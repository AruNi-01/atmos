import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { wsActions } from "@/api/ws-actions";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import { copy } from "./copy";
import { planNewChatSubmit, submitStep } from "./new-chat-submit";
import { composerControls, hasSelectableThinking } from "./option-controls";
import type { ComposerPhoto } from "./photo-attachment";
import { uploadChatPhotos } from "./upload-chat-photos";
import { resolveChatScope } from "./scope";

function listedDefault(items: Array<{ id: string; is_default?: boolean }> | null | undefined): string | null {
  if (!items || items.length === 0) return null;
  return items.find((item) => item.is_default)?.id ?? items[0]?.id ?? null;
}

function savedValue(config: Record<string, string> | undefined, key: string): string | null {
  const value = config?.[key]?.trim() ?? "";
  return value.length > 0 ? value : null;
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useNewChat(scopeId: string) {
  const { client, state: wsState } = useMobileWs();
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const [text, setText] = useState("");
  const [providerId, setProviderId] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [thinking, setThinking] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [permissionMode, setPermissionMode] = useState<string | null>(null);
  const [fast, setFast] = useState<string | null>(null);
  const [context, setContext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const createdChatIdRef = useRef<string | null>(null);
  const filledForProvider = useRef<string | null>(null);

  const bootstrapQuery = useQuery({
    queryKey: ["workspace-bootstrap", selectedServerId, wsState],
    enabled: Boolean(client && wsState === "open"),
    queryFn: () => wsActions.projectWorkspaceBootstrap(client!),
  });
  const prefsQuery = useQuery({
    queryKey: ["agent-chat-prefs", selectedServerId, wsState],
    enabled: Boolean(client && wsState === "open"),
    queryFn: () => wsActions.agentChatPrefsGet(client!),
  });
  const optionsQuery = useQuery({
    queryKey: ["agent-options", selectedServerId, providerId],
    enabled: Boolean(client && wsState === "open" && providerId),
    queryFn: () => wsActions.agentOptionsGet(client!, { agent_id: providerId! }),
  });

  useEffect(() => {
    const last = prefsQuery.data?.last_registry_id?.trim();
    if (!last) return;
    setProviderId((current) => current ?? last);
  }, [prefsQuery.data]);

  useEffect(() => {
    if (!providerId || prefsQuery.isLoading) return;
    const snapshot = optionsQuery.data;
    if (!snapshot || snapshot.agent_id !== providerId) return;
    if (filledForProvider.current === providerId) return;
    filledForProvider.current = providerId;
    const saved = prefsQuery.data?.last_new_chat_configs?.[providerId];
    setModel(savedValue(saved, "model") ?? listedDefault(snapshot.models));
    setThinking(hasSelectableThinking(snapshot.thinking) ? savedValue(saved, "thinking") : null);
    setMode(savedValue(saved, "mode") ?? listedDefault(snapshot.modes));
    setPermissionMode(savedValue(saved, "permission_mode") ?? listedDefault(snapshot.permission_modes));
    setFast(savedValue(saved, "fast"));
    setContext(savedValue(saved, "context") ?? listedDefault(snapshot.context));
  }, [optionsQuery.data, prefsQuery.data, prefsQuery.isLoading, providerId]);

  const selectProvider = useCallback((next: string) => {
    if (next === providerId) return;
    filledForProvider.current = null;
    setProviderId(next);
    setModel(null);
    setThinking(null);
    setMode(null);
    setPermissionMode(null);
    setFast(null);
    setContext(null);
  }, [providerId]);

  const submit = useCallback(async (attachmentPaths?: string[], photos?: ComposerPhoto[]) => {
    const step = submitStep(createdChatIdRef.current, submittingRef.current);
    if (step === "ignore") return;

    if (!client || wsState !== "open") {
      const message = "Atmos mobile WebSocket is not connected";
      setError(message);
      return { error: message };
    }
    if (!bootstrapQuery.data) {
      const message = "Workspace data is not loaded.";
      setError(message);
      return { error: message };
    }
    const resolved = resolveChatScope(bootstrapQuery.data, scopeId);
    if (!resolved.ok) {
      setError(resolved.error);
      return { error: resolved.error };
    }
    if (!providerId?.trim()) {
      const message = "Choose an agent.";
      setError(message);
      return { error: message };
    }
    const planned = planNewChatSubmit({
      scope: resolved.scope,
      cwd: resolved.cwd,
      provider_id: providerId,
      model,
      thinking,
      mode,
      permission_mode: permissionMode,
      fast,
      context,
      text,
      hasAttachments: (photos?.length ?? 0) > 0,
    });
    if ("error" in planned) {
      setError(planned.error);
      return planned;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      let chatId = createdChatIdRef.current;
      if (step === "create") {
        try {
          const created = await wsActions.agentChatCreate(client, planned.create);
          createdChatIdRef.current = created.id;
          chatId = created.id;
        } catch (err) {
          const message = errorText(err, copy.sendFailed);
          setError(message);
          return { error: message };
        }
      }
      if (chatId == null) return;
      const paths = (attachmentPaths ?? [])
        .map((path) => path.trim())
        .filter((path) => path.length > 0);
      const session = useSessionStore.getState().activeClientSession;
      if ((photos?.length ?? 0) > 0) {
        if (!session?.gateway_url || !session.client_token) {
          setError("Could not upload that photo.");
          return { error: "Could not upload that photo." };
        }
        try {
          const uploaded = await uploadChatPhotos({
            gatewayUrl: session.gateway_url,
            token: session.client_token,
            chatId,
            localPath: resolved.cwd || ".",
            photos: photos ?? [],
          });
          paths.push(...uploaded);
        } catch (err) {
          const message = errorText(err, "Could not upload that photo.");
          setError(message);
          return { error: message };
        }
      }
      try {
        await wsActions.agentChatSend(client, {
          chat_id: chatId,
          text: planned.sendText,
          ...(paths.length > 0 ? { attachment_paths: paths } : {}),
        });
      } catch {
        setError(copy.sendFailed);
        return { error: copy.sendFailed };
      }
      return { chatId };
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [
    bootstrapQuery.data,
    client,
    context,
    fast,
    mode,
    model,
    permissionMode,
    providerId,
    scopeId,
    text,
    thinking,
    wsState,
  ]);

  const queryError = bootstrapQuery.error ?? prefsQuery.error ?? optionsQuery.error;
  const loading = Boolean(client && wsState === "open" && (
    bootstrapQuery.isLoading
    || prefsQuery.isLoading
    || (Boolean(providerId) && optionsQuery.isLoading)
  ));

  return {
    text,
    setText,
    providerId,
    setProviderId: selectProvider,
    model,
    setModel,
    thinking,
    setThinking,
    mode,
    setMode,
    permissionMode,
    setPermissionMode,
    fast,
    setFast,
    context,
    setContext,
    options: optionsQuery.data ?? null,
    controls: composerControls(optionsQuery.data ?? null),
    loading,
    error: error ?? (queryError ? errorText(queryError, "Could not load chat options.") : null),
    submitting,
    submit,
  };
}
