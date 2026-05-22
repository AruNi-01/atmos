import type React from "react";
import { SlidersHorizontal, Trash2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  cn,
} from "@workspace/ui";

import type { SessionTitleFormatConfig } from "@/api/ws-api";
import {
  DEFAULT_ANTHROPIC_MAX_OUTPUT_TOKENS,
  DEFAULT_PROVIDER_TIMEOUT_MS,
  KIND_OPTIONS,
  sessionTitleFormatPreview,
  slugifyProviderId,
  type ProviderDraft,
  type RoutingDraft,
  type SaveState,
} from "@/components/layout/llm-providers-modal-utils";
import {
  FeatureLanguageAction,
  FeatureSelect,
  Field,
  SaveStateButton,
} from "@/components/layout/llm-providers-modal-parts";

export type ProviderTestStatus = "idle" | "testing" | "pass" | "fail";

export function ProviderEditorFields({
  loading,
  providerEditor,
  providerNameIssue,
  showProviderNameIssue,
  onProviderNameTouched,
  setProviderEditor,
}: {
  loading: boolean;
  providerEditor: ProviderDraft | null;
  providerNameIssue: string | null;
  showProviderNameIssue: boolean;
  onProviderNameTouched: () => void;
  setProviderEditor: React.Dispatch<React.SetStateAction<ProviderDraft | null>>;
}) {
  if (loading || !providerEditor) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field
        label="Provider name"
        labelAccessory={
          showProviderNameIssue && providerNameIssue ? (
            <span className="text-xs font-medium text-destructive">
              {providerNameIssue}
            </span>
          ) : null
        }
        error={showProviderNameIssue}
      >
        <Input
          value={providerEditor.name}
          onChange={(event) => {
            onProviderNameTouched();
            setProviderEditor((current) =>
              current ? { ...current, name: event.target.value } : current,
            );
          }}
          placeholder="OpenRouter Fast"
          className={cn(
            showProviderNameIssue &&
              "border-destructive focus-visible:ring-destructive/30",
          )}
        />
      </Field>

      <Field label="Provider key">
        <Input
          value={
            providerEditor.name.trim()
              ? slugifyProviderId(providerEditor.name)
              : ""
          }
          placeholder="Generated from name"
          disabled
        />
      </Field>

      <Field label="Compatibility">
        <Select
          value={providerEditor.kind}
          onValueChange={(value) => {
            const kind = value as ProviderDraft["kind"];
            const shouldSeedAnthropicDefault =
              !providerEditor.max_output_tokens.trim() &&
              kind === "anthropic-compatible";
            setProviderEditor((current) =>
              current
                ? {
                    ...current,
                    kind,
                    max_output_tokens: shouldSeedAnthropicDefault
                      ? DEFAULT_ANTHROPIC_MAX_OUTPUT_TOKENS
                      : current.max_output_tokens,
                  }
                : current,
            );
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KIND_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Enabled">
        <div className="flex h-10 items-center justify-between rounded-xl border border-border px-3">
          <span className="text-sm text-foreground">Provider status</span>
          <Switch
            checked={providerEditor.enabled}
            onCheckedChange={(checked) =>
              setProviderEditor((current) =>
                current ? { ...current, enabled: checked } : current,
              )
            }
          />
        </div>
      </Field>

      <Field label="Timeout (ms)">
        <Input
          value={providerEditor.timeout_ms}
          onChange={(event) =>
            setProviderEditor((current) =>
              current ? { ...current, timeout_ms: event.target.value } : current,
            )
          }
          placeholder={DEFAULT_PROVIDER_TIMEOUT_MS}
        />
      </Field>

      <Field label="Max output tokens">
        <Input
          value={providerEditor.max_output_tokens}
          onChange={(event) =>
            setProviderEditor((current) =>
              current
                ? { ...current, max_output_tokens: event.target.value }
                : current,
            )
          }
          placeholder={
            providerEditor.kind === "anthropic-compatible"
              ? DEFAULT_ANTHROPIC_MAX_OUTPUT_TOKENS
              : "Optional"
          }
        />
      </Field>

      <Field label="Base URL" className="md:col-span-2">
        <Input
          value={providerEditor.base_url}
          onChange={(event) =>
            setProviderEditor((current) =>
              current ? { ...current, base_url: event.target.value } : current,
            )
          }
          placeholder={
            providerEditor.kind === "anthropic-compatible"
              ? "https://api.anthropic.com"
              : "https://openrouter.ai/api/v1"
          }
        />
      </Field>

      <Field label="API key" className="md:col-span-2">
        <Input
          type="password"
          value={providerEditor.api_key}
          onChange={(event) =>
            setProviderEditor((current) =>
              current ? { ...current, api_key: event.target.value } : current,
            )
          }
          placeholder="sk-... or env:OPENROUTER_API_KEY"
        />
      </Field>

      <Field label="Model" className="md:col-span-2">
        <Input
          value={providerEditor.model}
          onChange={(event) =>
            setProviderEditor((current) =>
              current ? { ...current, model: event.target.value } : current,
            )
          }
          placeholder={
            providerEditor.kind === "anthropic-compatible"
              ? "claude-3-5-haiku-latest"
              : "openrouter/auto"
          }
        />
      </Field>
    </div>
  );
}

export function ProviderEditorFooter({
  providerId,
  deleteConfirmOpen,
  onDeleteConfirmOpenChange,
  providerSaveState,
  loading,
  providerEditor,
  testPopoverOpen,
  onTestPopoverOpenChange,
  testStatus,
  testOutput,
  onCancel,
  onDeleteProvider,
  onTestProvider,
  onSaveProvider,
}: {
  providerId?: string | null;
  deleteConfirmOpen: boolean;
  onDeleteConfirmOpenChange: (open: boolean) => void;
  providerSaveState: SaveState;
  loading: boolean;
  providerEditor: ProviderDraft | null;
  testPopoverOpen: boolean;
  onTestPopoverOpenChange: (open: boolean) => void;
  testStatus: ProviderTestStatus;
  testOutput: string;
  onCancel: () => void;
  onDeleteProvider: () => void | Promise<void>;
  onTestProvider: () => void | Promise<void>;
  onSaveProvider: () => void | Promise<void>;
}) {
  return (
    <DialogFooter className="border-t border-border px-6 py-4">
      <div className="flex w-full items-center">
        <div className="flex min-w-0 flex-1 items-center">
          {providerId ? (
            <Popover
              open={deleteConfirmOpen}
              onOpenChange={onDeleteConfirmOpenChange}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={providerSaveState === "saving" || loading}
                >
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-56 space-y-3 p-4"
                side="top"
                align="start"
              >
                <p className="text-sm text-foreground">Delete this provider?</p>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteConfirmOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      onDeleteConfirmOpenChange(false);
                      void onDeleteProvider();
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>

        <div className="flex flex-1 items-center justify-end gap-2">
          {providerId ? (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Popover open={testPopoverOpen} onOpenChange={onTestPopoverOpenChange}>
            <PopoverTrigger asChild>
              <Button
                variant="secondary"
                className={cn(
                  "px-3",
                  testStatus === "pass" &&
                    "text-emerald-700 hover:text-emerald-700 dark:text-emerald-300",
                  testStatus === "fail" &&
                    "text-destructive hover:text-destructive",
                  testStatus === "testing" &&
                    "text-amber-700 hover:text-amber-700 dark:text-amber-300",
                )}
                onClick={() => {
                  void onTestProvider();
                }}
                disabled={loading || !providerEditor}
              >
                {testStatus === "testing"
                  ? "TESTING..."
                  : testStatus === "pass"
                    ? "PASS"
                    : testStatus === "fail"
                      ? "FAIL"
                      : "TEST"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[420px] p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">
                    Provider Test
                  </p>
                  <Button variant="ghost" onClick={() => void onTestProvider()}>
                    RETEST
                  </Button>
                </div>
                <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/20 p-3 text-xs whitespace-pre-wrap text-foreground">
                  {testOutput ||
                    (testStatus === "testing"
                      ? "Streaming response..."
                      : "Click TEST to start.")}
                </pre>
              </div>
            </PopoverContent>
          </Popover>
          <SaveStateButton
            state={providerSaveState}
            idleLabel={providerId ? "Save changes" : "Create provider"}
            savingLabel="Saving..."
            savedLabel="Saved"
            onClick={() => void onSaveProvider()}
            disabled={providerSaveState === "saving" || loading || !providerEditor}
            measureLabel={providerId ? "Save changes" : "Create provider"}
          />
        </div>
      </div>
    </DialogFooter>
  );
}

export function RoutingFeatureBindings({
  loading,
  routingDraft,
  providerOptions,
  onOpenSessionTitleFormat,
  setRoutingDraft,
}: {
  loading: boolean;
  routingDraft: RoutingDraft;
  providerOptions: Array<{ value: string; label: string }>;
  onOpenSessionTitleFormat: () => void;
  setRoutingDraft: React.Dispatch<React.SetStateAction<RoutingDraft>>;
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <>
      <FeatureSelect
        label="Session title generator"
        value={routingDraft.features.session_title}
        providerOptions={providerOptions}
        noneLabel="Disabled"
        action={
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onOpenSessionTitleFormat}
            title="Edit session title format"
            aria-label="Edit session title format"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        }
        onChange={(value) =>
          setRoutingDraft((current) => ({
            ...current,
            features: {
              ...current.features,
              session_title: value,
            },
          }))
        }
      />

      <FeatureSelect
        label="Git commit generator"
        value={routingDraft.features.git_commit}
        providerOptions={providerOptions}
        noneLabel="Disabled"
        action={
          <FeatureLanguageAction
            value={routingDraft.features.git_commit_language}
            onChange={(language) =>
              setRoutingDraft((current) => ({
                ...current,
                features: {
                  ...current.features,
                  git_commit_language: language,
                },
              }))
            }
          />
        }
        onChange={(value) =>
          setRoutingDraft((current) => ({
            ...current,
            features: {
              ...current.features,
              git_commit: value,
            },
          }))
        }
      />

      <FeatureSelect
        label="Workspace issue TODO extraction"
        value={routingDraft.features.workspace_issue_todo}
        providerOptions={providerOptions}
        noneLabel="Disabled"
        action={
          <FeatureLanguageAction
            value={routingDraft.features.workspace_issue_todo_language}
            onChange={(language) =>
              setRoutingDraft((current) => ({
                ...current,
                features: {
                  ...current.features,
                  workspace_issue_todo_language: language,
                },
              }))
            }
          />
        }
        onChange={(value) =>
          setRoutingDraft((current) => ({
            ...current,
            features: {
              ...current.features,
              workspace_issue_todo: value,
            },
          }))
        }
      />
    </>
  );
}

export function SessionTitleFormatDialog({
  open,
  onOpenChange,
  sessionTitleFormatDraft,
  setSessionTitleFormatDraft,
  titleFormatSaveState,
  onSaveSessionTitleFormat,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionTitleFormatDraft: SessionTitleFormatConfig;
  setSessionTitleFormatDraft: React.Dispatch<
    React.SetStateAction<SessionTitleFormatConfig>
  >;
  titleFormatSaveState: SaveState;
  onSaveSessionTitleFormat: () => void | Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,640px)] max-w-[640px] border-border bg-background p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle>Session Title Format</DialogTitle>
          <DialogDescription>
            The final title is assembled as a structured format. Temporary
            sessions automatically skip the project segment even when enabled.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <div className="rounded-2xl border border-border bg-muted/20 p-4">
            <p className="text-xs font-semibold text-muted-foreground">
              Final format
            </p>
            <p className="mt-2 font-mono text-sm text-foreground">
              {sessionTitleFormatPreview(sessionTitleFormatDraft)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              `projectName` comes from the current working directory basename.
              Temp sessions skip this segment automatically.
            </p>
          </div>

          <Field
            label="Include Intent Emoji"
            description="Prefix the title description with a single inferred intent emoji, such as 🎨 or 🐞."
          >
            <div className="flex items-center justify-between rounded-xl border border-border bg-background/70 px-4 py-3">
              <div>
                <p className="text-sm text-foreground">Intent segment</p>
                <p className="text-xs text-muted-foreground">
                  Example: 🎨 design a retry mechanism
                </p>
              </div>
              <Switch
                checked={!!sessionTitleFormatDraft.include_intent_emoji}
                onCheckedChange={(checked) =>
                  setSessionTitleFormatDraft((current) => ({
                    ...current,
                    include_intent_emoji: !!checked,
                  }))
                }
              />
            </div>
          </Field>

          <Field
            label="Include Agent Name"
            description="Prefix titles with the current ACP agent display name."
          >
            <div className="flex items-center justify-between rounded-xl border border-border bg-background/70 px-4 py-3">
              <div>
                <p className="text-sm text-foreground">Agent segment</p>
                <p className="text-xs text-muted-foreground">
                  Example: Claude Agent | title desc
                </p>
              </div>
              <Switch
                checked={!!sessionTitleFormatDraft.include_agent_name}
                onCheckedChange={(checked) =>
                  setSessionTitleFormatDraft((current) => ({
                    ...current,
                    include_agent_name: !!checked,
                  }))
                }
              />
            </div>
          </Field>

          <Field
            label="Include Project Name"
            description="Prefix titles with the current project or workspace directory name when available."
          >
            <div className="flex items-center justify-between rounded-xl border border-border bg-background/70 px-4 py-3">
              <div>
                <p className="text-sm text-foreground">Project segment</p>
                <p className="text-xs text-muted-foreground">
                  Example: my-project | title desc
                </p>
              </div>
              <Switch
                checked={!!sessionTitleFormatDraft.include_project_name}
                onCheckedChange={(checked) =>
                  setSessionTitleFormatDraft((current) => ({
                    ...current,
                    include_project_name: !!checked,
                  }))
                }
              />
            </div>
          </Field>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <SaveStateButton
            state={titleFormatSaveState}
            idleLabel="Save format"
            savingLabel="Saving..."
            savedLabel="Saved"
            onClick={() => void onSaveSessionTitleFormat()}
            disabled={titleFormatSaveState === "saving"}
            measureLabel="Save format"
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
