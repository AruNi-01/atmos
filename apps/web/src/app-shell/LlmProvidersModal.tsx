"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toastManager,
} from "@workspace/ui";

import {
  llmProvidersApi,
  type LlmProvidersFile,
} from "@/api/ws-api";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import {
  EMPTY_ROUTING,
  KIND_OPTIONS,
  buildProviderNameIssues,
  fileToModalState,
  modalStateToFile,
  newProviderDraft,
  normalizeFeatureLanguage,
  providerDraftToEntry,
  providerLabel,
  scheduleSaveStateReset,
  validateProvider,
  validateRouting,
  type ProviderDraft,
  type RoutingDraft,
  type SaveState,
} from "@/app-shell/llm-providers-modal-utils";
import {
  ProviderEditorFields,
  ProviderEditorFooter,
  RoutingFeatureBindings,
  type ProviderTestStatus,
} from "@/app-shell/llm-providers-modal-sections";
import { SaveStateButton } from "@/app-shell/llm-providers-modal-parts";

function useResetTimer(timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) {
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    [timerRef],
  );
}

export function LlmProviderEditorDialog({
  open,
  onOpenChange,
  providerId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId?: string | null;
  onSaved?: () => void;
}) {
  const [version, setVersion] = useState(1);
  const [providers, setProviders] = useState<ProviderDraft[]>([]);
  const [routingDraft, setRoutingDraft] = useState<RoutingDraft>(EMPTY_ROUTING);
  const [providerEditor, setProviderEditor] = useState<ProviderDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [originalConfig, setOriginalConfig] = useState<LlmProvidersFile | null>(null);
  const [providerSaveState, setProviderSaveState] = useState<SaveState>("idle");
  const [providerNameTouched, setProviderNameTouched] = useState(false);
  const [providerSaveAttempted, setProviderSaveAttempted] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [testPopoverOpen, setTestPopoverOpen] = useState(false);
  const [testStatus, setTestStatus] = useState<ProviderTestStatus>("idle");
  const [testOutput, setTestOutput] = useState("");
  const providerResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const providerTestUnsubscribeRef = useRef<(() => void) | null>(null);

  useResetTimer(providerResetTimerRef);
  useEffect(
    () => () => {
      providerTestUnsubscribeRef.current?.();
    },
    [],
  );

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const config = await llmProvidersApi.get();
      setOriginalConfig(config);
      const nextState = fileToModalState(config);
      setVersion(nextState.version);
      setProviders(nextState.providers);
      setRoutingDraft(nextState.routing);

      if (providerId) {
        const selected = nextState.providers.find(
          (provider) => provider.persistedId === providerId,
        );
        if (!selected) {
          toastManager.add({
            title: "Provider not found",
            description: "The selected provider no longer exists.",
            type: "error",
          });
          onOpenChange(false);
          return;
        }
        setProviderEditor({ ...selected });
      } else {
        setProviderEditor(newProviderDraft(nextState.providers));
      }

      setProviderNameTouched(false);
      setProviderSaveAttempted(false);
      setProviderSaveState("idle");
      setTestStatus("idle");
      setTestOutput("");
    } catch (error) {
      toastManager.add({
        title: "Failed to load provider settings",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }, [onOpenChange, providerId]);

  useEffect(() => {
    if (!open) return;
    void loadConfig();
  }, [loadConfig, open]);

  const providerEditorCandidates = useMemo(() => {
    if (!providerEditor) return providers;
    return [
      ...providers.filter(
        (provider) => provider.clientKey !== providerEditor.clientKey,
      ),
      providerEditor,
    ];
  }, [providers, providerEditor]);

  const providerNameIssue = useMemo(() => {
    if (!providerEditor) return null;
    return buildProviderNameIssues(providerEditorCandidates)[
      providerEditor.clientKey
    ];
  }, [providerEditor, providerEditorCandidates]);

  const showProviderNameIssue =
    !!providerNameIssue && (providerNameTouched || providerSaveAttempted);

  const handleTestProvider = async () => {
    if (!providerEditor) return;

    setTestPopoverOpen(true);
    setTestStatus("testing");
    setTestOutput("");
    providerTestUnsubscribeRef.current?.();

    const streamId = crypto.randomUUID();
    let streamedOutput = "";

    providerTestUnsubscribeRef.current = useWebSocketStore
      .getState()
      .onEvent("llm_provider_test_chunk", (payload) => {
        if (
          typeof payload !== "object" ||
          payload === null ||
          (payload as { stream_id?: unknown }).stream_id !== streamId
        ) {
          return;
        }

        const chunk = (payload as { chunk?: unknown }).chunk;
        if (typeof chunk !== "string" || chunk.length === 0) return;

        streamedOutput += chunk;
        setTestOutput(streamedOutput);
      });

    try {
      const result = await llmProvidersApi.testProvider({
        stream_id: streamId,
        provider_id: providerEditor.persistedId || null,
        provider: providerDraftToEntry(providerEditor),
      });
      setTestStatus("pass");
      setTestOutput(streamedOutput || result.text || "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setTestStatus("fail");
      setTestOutput(
        streamedOutput ? `${streamedOutput}\n\n[ERROR] ${message}` : `[ERROR] ${message}`,
      );
    } finally {
      providerTestUnsubscribeRef.current?.();
      providerTestUnsubscribeRef.current = null;
    }
  };

  const handleSaveProvider = async () => {
    if (!providerEditor) return;

    setProviderSaveAttempted(true);
    const validationError = validateProvider(
      providerEditor,
      providerEditorCandidates,
    );
    if (validationError) {
      toastManager.add({
        title: "Invalid provider settings",
        description: validationError,
        type: "error",
      });
      return;
    }

    const nextProviders = [
      ...providers.filter(
        (provider) => provider.clientKey !== providerEditor.clientKey,
      ),
      providerEditor,
    ];

    setProviderSaveState("saving");
    try {
      const nextConfig = modalStateToFile(
        { version, providers: nextProviders, routing: routingDraft },
        originalConfig ?? undefined,
      );
      await llmProvidersApi.update(nextConfig);
      setOriginalConfig(nextConfig);
      setProviderSaveState("saved");
      scheduleSaveStateReset(setProviderSaveState, providerResetTimerRef);
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      setProviderSaveState("idle");
      toastManager.add({
        title: "Failed to save provider",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    }
  };

  const handleDeleteProvider = async () => {
    if (!providerEditor?.persistedId) return;

    const nextProviders = providers.filter(
      (provider) => provider.clientKey !== providerEditor.clientKey,
    );
    const nextRouting: RoutingDraft = {
      features: {
        git_commit:
          routingDraft.features.git_commit === providerEditor.clientKey
            ? null
            : routingDraft.features.git_commit,
        git_commit_language: normalizeFeatureLanguage(
          routingDraft.features.git_commit_language,
        ),
        workspace_issue_todo:
          routingDraft.features.workspace_issue_todo === providerEditor.clientKey
            ? null
            : routingDraft.features.workspace_issue_todo,
        workspace_issue_todo_language: normalizeFeatureLanguage(
          routingDraft.features.workspace_issue_todo_language,
        ),
      },
    };

    setProviderSaveState("saving");
    try {
      const nextConfig = modalStateToFile(
        { version, providers: nextProviders, routing: nextRouting },
        originalConfig ?? undefined,
      );
      await llmProvidersApi.update(nextConfig);
      setOriginalConfig(nextConfig);
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      setProviderSaveState("idle");
      toastManager.add({
        title: "Failed to delete provider",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    }
  };

  const selectedProviderIsUnsaved =
    !!providerEditor && !providerEditor.persistedId;
  const selectedProviderHint = selectedProviderIsUnsaved
    ? "New provider"
    : providerEditor
      ? KIND_OPTIONS.find((item) => item.value === providerEditor.kind)?.hint
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,720px)] max-w-[720px] border-border bg-background p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-2xl border border-primary/20 bg-background/70 shadow-sm">
              <BrainCircuit className="size-4 text-primary" />
            </div>
            {providerId ? "Edit Provider" : "Add Provider"}
          </DialogTitle>
          <DialogDescription>
            {selectedProviderHint ?? "Configure a lightweight provider for background tasks."}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5">
          <ProviderEditorFields
            loading={loading}
            providerEditor={providerEditor}
            providerNameIssue={providerNameIssue}
            showProviderNameIssue={showProviderNameIssue}
            onProviderNameTouched={() => setProviderNameTouched(true)}
            setProviderEditor={setProviderEditor}
          />
        </div>

        <ProviderEditorFooter
          providerId={providerId}
          deleteConfirmOpen={deleteConfirmOpen}
          onDeleteConfirmOpenChange={setDeleteConfirmOpen}
          providerSaveState={providerSaveState}
          loading={loading}
          providerEditor={providerEditor}
          testPopoverOpen={testPopoverOpen}
          onTestPopoverOpenChange={setTestPopoverOpen}
          testStatus={testStatus}
          testOutput={testOutput}
          onCancel={() => onOpenChange(false)}
          onDeleteProvider={handleDeleteProvider}
          onTestProvider={handleTestProvider}
          onSaveProvider={handleSaveProvider}
        />
      </DialogContent>
    </Dialog>
  );
}

export function LlmRoutingDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const [version, setVersion] = useState(1);
  const [providers, setProviders] = useState<ProviderDraft[]>([]);
  const [routingDraft, setRoutingDraft] = useState<RoutingDraft>(EMPTY_ROUTING);
  const [loading, setLoading] = useState(false);
  const [originalConfig, setOriginalConfig] = useState<LlmProvidersFile | null>(null);
  const [routingSaveState, setRoutingSaveState] = useState<SaveState>("idle");
  const routingResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useResetTimer(routingResetTimerRef);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const config = await llmProvidersApi.get();
      setOriginalConfig(config);
      const nextState = fileToModalState(config);
      setVersion(nextState.version);
      setProviders(nextState.providers);
      setRoutingDraft(nextState.routing);
      setRoutingSaveState("idle");
    } catch (error) {
      toastManager.add({
        title: "Failed to load routing settings",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    void loadConfig();
  }, [loadConfig, open]);

  const providerOptions = useMemo(
    () =>
      providers.map((provider) => ({
        value: provider.clientKey,
        label: providerLabel(provider),
      })),
    [providers],
  );

  const handleSaveRouting = async () => {
    const validationError = validateRouting(routingDraft, providers);
    if (validationError) {
      toastManager.add({
        title: "Invalid routing settings",
        description: validationError,
        type: "error",
      });
      return;
    }

    setRoutingSaveState("saving");
    try {
      const nextConfig = modalStateToFile(
        { version, providers, routing: routingDraft },
        originalConfig ?? undefined,
      );
      await llmProvidersApi.update(nextConfig);
      setOriginalConfig(nextConfig);
      setRoutingSaveState("saved");
      scheduleSaveStateReset(setRoutingSaveState, routingResetTimerRef);
      onSaved?.();
    } catch (error) {
      setRoutingSaveState("idle");
      toastManager.add({
        title: "Failed to save routing settings",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[min(94vw,720px)] max-w-[720px] border-border bg-background p-0">
          <DialogHeader className="border-b border-border px-6 py-5">
            <DialogTitle className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-2xl border border-primary/20 bg-background/70 shadow-sm">
                <BrainCircuit className="size-4 text-primary" />
              </div>
              Routing
            </DialogTitle>
            <DialogDescription>
              Choose which provider handles each lightweight background feature.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-6 py-5">
            <RoutingFeatureBindings
              loading={loading}
              routingDraft={routingDraft}
              providerOptions={providerOptions}
              setRoutingDraft={setRoutingDraft}
            />
          </div>

          <DialogFooter className="border-t border-border px-6 py-4">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <SaveStateButton
              state={routingSaveState}
              idleLabel="Save"
              savingLabel="Saving..."
              savedLabel="Saved"
              onClick={() => void handleSaveRouting()}
              disabled={routingSaveState === "saving" || loading}
              measureLabel="Save"
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
