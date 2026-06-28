"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Input,
  Textarea,
  toastManager,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui";
import {
  agentApi,
  type CustomAgent,
} from "@/api/ws-api";
import { Loader2, AlertCircle, Plus, Terminal, FileCode, Pencil } from "lucide-react";

const EMPTY_CUSTOM_FORM = { name: "", command: "", args: "", env: "" };

type CustomAgentManifestEntry = {
  type?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  default_option_configs?: Record<string, string>;
};

function parseCustomAgentArgs(
  rawArgs: string,
  messages: {
    argsArrayOnly: string;
    argsFormat: string;
  },
): string[] {
  const trimmed = rawArgs.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      if (!parsed.every((item) => typeof item === "string")) {
        throw new Error(messages.argsArrayOnly);
      }
      return parsed;
    }

    if (
      parsed === null ||
      typeof parsed === "number" ||
      typeof parsed === "boolean"
    ) {
      return trimmed.split(/\s+/);
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      return trimmed.split(/\s+/);
    }
    throw error;
  }

  throw new Error(messages.argsFormat);
}

export interface CustomAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingAgent: CustomAgent | null;
  onSaved: () => void;
}

export const CustomAgentDialog: React.FC<CustomAgentDialogProps> = ({
  open,
  onOpenChange,
  editingAgent,
  onSaved,
}) => {
  const t = useTranslations("Agent.components");
  const [customForm, setCustomForm] = React.useState(EMPTY_CUSTOM_FORM);
  const [addingCustom, setAddingCustom] = React.useState(false);
  const [customEditMode, setCustomEditMode] = React.useState<"form" | "json">("form");
  const [customJsonText, setCustomJsonText] = React.useState("");
  const [customJsonError, setCustomJsonError] = React.useState<string | null>(null);
  const [loadingJson, setLoadingJson] = React.useState(false);

  const editingCustomAgentName = editingAgent?.name ?? null;

  React.useEffect(() => {
    if (open) {
      if (editingAgent) {
        setCustomForm({
          name: editingAgent.name,
          command: editingAgent.command,
          args: editingAgent.args.length > 0 ? JSON.stringify(editingAgent.args) : "",
          env: Object.keys(editingAgent.env).length > 0 ? JSON.stringify(editingAgent.env) : "",
        });
      } else {
        setCustomForm(EMPTY_CUSTOM_FORM);
      }
      setCustomEditMode("form");
      setCustomJsonText("");
      setCustomJsonError(null);
    }
  }, [open, editingAgent]);

  const handleClose = React.useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSwitchToJsonMode = async () => {
    setLoadingJson(true);
    setCustomJsonError(null);
    try {
      const { json } = await agentApi.getCustomAgentsJson();
      setCustomJsonText(json);
      setCustomEditMode("json");
    } catch (error) {
      toastManager.add({
        title: t("customAgentDialog.toast.failedToLoadJsonTitle"),
        description: error instanceof Error ? error.message : t("customAgentDialog.toast.unknownError"),
        type: "error",
      });
    } finally {
      setLoadingJson(false);
    }
  };

  const handleSaveCustomJson = async () => {
    setCustomJsonError(null);
    try {
      JSON.parse(customJsonText);
    } catch (e) {
      setCustomJsonError(e instanceof Error ? e.message : t("customAgentDialog.errors.invalidJsonFormat"));
      return;
    }
    setAddingCustom(true);
    try {
      await agentApi.setCustomAgentsJson(customJsonText);
      toastManager.add({
        title: t("customAgentDialog.toast.customAgentsSavedTitle"),
        description: t("customAgentDialog.toast.customAgentsSavedDescription"),
        type: "success",
      });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toastManager.add({
        title: t("customAgentDialog.toast.failedToSaveTitle"),
        description: error instanceof Error ? error.message : t("customAgentDialog.toast.unknownError"),
        type: "error",
      });
    } finally {
      setAddingCustom(false);
    }
  };

  const handleSaveCustomAgent = async () => {
    if (!customForm.name.trim() || !customForm.command.trim()) return;
    setAddingCustom(true);
    try {
      let parsedArgs: string[] = [];
      try {
        parsedArgs = parseCustomAgentArgs(customForm.args, {
          argsArrayOnly: t("customAgentDialog.errors.argsArrayOnly"),
          argsFormat: t("customAgentDialog.errors.argsFormat"),
        });
      } catch (error) {
        toastManager.add({
          title: t("customAgentDialog.toast.invalidArgsTitle"),
          description: error instanceof Error
            ? error.message
            : t("customAgentDialog.errors.argsFormat"),
          type: "error",
        });
        return;
      }
      let parsedEnv: Record<string, string> = {};
      if (customForm.env.trim()) {
        try {
          parsedEnv = JSON.parse(customForm.env.trim());
        } catch {
          toastManager.add({
            title: t("customAgentDialog.toast.invalidEnvTitle"),
            description: t("customAgentDialog.errors.envFormat"),
            type: "error",
          });
          return;
        }
      }

      const nextName = customForm.name.trim();
      const payload = {
        name: nextName,
        command: customForm.command.trim(),
        args: parsedArgs,
        env: parsedEnv,
      };

      if (editingCustomAgentName) {
        const { json } = await agentApi.getCustomAgentsJson();
        const manifest = JSON.parse(json) as Record<string, CustomAgentManifestEntry>;
        const existingEntry = manifest[editingCustomAgentName];

        if (!existingEntry) {
          throw new Error(t("customAgentDialog.errors.customAgentMissing"));
        }
        if (nextName !== editingCustomAgentName && manifest[nextName]) {
          throw new Error(t("customAgentDialog.errors.duplicateName", { name: nextName }));
        }

        if (nextName !== editingCustomAgentName) {
          delete manifest[editingCustomAgentName];
        }

        manifest[nextName] = {
          ...existingEntry,
          type: existingEntry.type ?? "custom",
          command: payload.command,
          args: payload.args,
          env: payload.env,
        };

        await agentApi.setCustomAgentsJson(JSON.stringify(manifest, null, 2));
      } else {
        await agentApi.addCustomAgent(payload);
      }

      toastManager.add({
        title: editingCustomAgentName
          ? t("customAgentDialog.toast.updatedTitle")
          : t("customAgentDialog.toast.addedTitle"),
        description: editingCustomAgentName
          ? t("customAgentDialog.toast.updatedDescription", { name: nextName })
          : t("customAgentDialog.toast.addedDescription", { name: nextName }),
        type: "success",
      });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toastManager.add({
        title: editingCustomAgentName
          ? t("customAgentDialog.toast.failedToUpdateTitle")
          : t("customAgentDialog.toast.failedToAddTitle"),
        description: error instanceof Error ? error.message : t("customAgentDialog.toast.unknownError"),
        type: "error",
      });
    } finally {
      setAddingCustom(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleClose();
        }
      }}
    >
      <DialogContent showCloseButton={true} className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Terminal className="size-5 text-primary" />
          </div>
          <DialogTitle>{editingCustomAgentName ? t("customAgentDialog.editTitle") : t("customAgentDialog.addTitle")}</DialogTitle>
          <DialogDescription className="text-pretty">
            {editingCustomAgentName
              ? t("customAgentDialog.editDescription")
              : t("customAgentDialog.addDescription")}
          </DialogDescription>
          <p className="text-sm text-muted-foreground">
            {t("customAgentDialog.referencePrefix")}{" "}
            <a
              href="https://agentclientprotocol.com/get-started/agents"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline underline-offset-4"
            >
              {t("customAgentDialog.referenceLinkLabel")}
            </a>
          </p>
        </DialogHeader>

        {customEditMode === "form" ? (
          <>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{t("customAgentDialog.fields.name")}</label>
                <Input
                  value={customForm.name}
                  onChange={(e) => setCustomForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t("customAgentDialog.placeholders.name")}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{t("customAgentDialog.fields.command")}</label>
                <Input
                  value={customForm.command}
                  onChange={(e) => setCustomForm((f) => ({ ...f, command: e.target.value }))}
                  placeholder={t("customAgentDialog.placeholders.command")}
                  className="h-9 font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  {t("customAgentDialog.fields.args")}{" "}
                  <span className="text-muted-foreground font-normal">({t("customAgentDialog.fields.argsHint")})</span>
                </label>
                <Input
                  value={customForm.args}
                  onChange={(e) => setCustomForm((f) => ({ ...f, args: e.target.value }))}
                  placeholder={t("customAgentDialog.placeholders.args")}
                  className="h-9 font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  {t("customAgentDialog.fields.env")}{" "}
                  <span className="text-muted-foreground font-normal">({t("customAgentDialog.fields.envHint")})</span>
                </label>
                <Input
                  value={customForm.env}
                  onChange={(e) => setCustomForm((f) => ({ ...f, env: e.target.value }))}
                  placeholder={t("customAgentDialog.placeholders.env")}
                  className="h-9 font-mono text-sm"
                />
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => void handleSwitchToJsonMode()}
                disabled={loadingJson}
                className="cursor-pointer sm:mr-auto"
              >
                {loadingJson ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <FileCode className="mr-1.5 size-3.5" />
                )}
                {t("customAgentDialog.actions.editJson")}
              </Button>
              <Button
                variant="outline"
                onClick={handleClose}
                className="cursor-pointer"
              >
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => void handleSaveCustomAgent()}
                disabled={addingCustom || !customForm.name.trim() || !customForm.command.trim()}
                className="cursor-pointer"
              >
                {addingCustom ? (
                  <>
                    <Loader2 className="mr-1 size-3 animate-spin" />
                    {editingCustomAgentName ? t("customAgentDialog.actions.saving") : t("customAgentDialog.actions.adding")}
                  </>
                ) : (
                  <>
                    {editingCustomAgentName ? (
                      <Pencil className="mr-1 size-3.5" />
                    ) : (
                      <Plus className="mr-1 size-3.5" />
                    )}
                    {editingCustomAgentName ? t("customAgentDialog.actions.saveChanges") : t("customAgentDialog.actions.addAgent")}
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-2">
            <div className="min-h-0 space-y-3 overflow-hidden py-2">
                <div className="flex h-full min-h-0 flex-col space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    {t("customAgentDialog.jsonEditor.label")}{" "}
                    <span className="text-muted-foreground font-normal">({t("customAgentDialog.jsonEditor.fileHint")})</span>
                  </label>
                <Textarea
                  value={customJsonText}
                  onChange={(e) => {
                    setCustomJsonText(e.target.value);
                    setCustomJsonError(null);
                  }}
                  placeholder={t("customAgentDialog.jsonEditor.placeholder")}
                  className="field-sizing-fixed min-h-[260px] flex-1 overflow-y-auto font-mono text-sm leading-relaxed resize-none"
                  spellCheck={false}
                />
                {customJsonError && (
                  <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
                    <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                    <p className="text-xs text-destructive break-all">{customJsonError}</p>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCustomEditMode("form");
                  setCustomJsonError(null);
                }}
                className="cursor-pointer sm:mr-auto"
              >
                {t("customAgentDialog.actions.backToForm")}
              </Button>
              <Button
                variant="outline"
                onClick={handleClose}
                className="cursor-pointer"
              >
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => void handleSaveCustomJson()}
                disabled={addingCustom || !customJsonText.trim()}
                className="cursor-pointer"
              >
                {addingCustom ? (
                  <>
                    <Loader2 className="mr-1 size-3 animate-spin" />
                    {t("customAgentDialog.actions.saving")}
                  </>
                ) : (
                  t("common.save")
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
