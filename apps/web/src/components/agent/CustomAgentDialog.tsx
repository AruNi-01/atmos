"use client";

import React from "react";
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
        title: "Failed to load JSON",
        description: error instanceof Error ? error.message : "Unknown error",
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
      setCustomJsonError(e instanceof Error ? e.message : "Invalid JSON format");
      return;
    }
    setAddingCustom(true);
    try {
      await agentApi.setCustomAgentsJson(customJsonText);
      toastManager.add({
        title: "Custom agents saved",
        description: "Custom agents have been updated from JSON",
        type: "success",
      });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toastManager.add({
        title: "Failed to save",
        description: error instanceof Error ? error.message : "Unknown error",
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
      if (customForm.args.trim()) {
        try {
          const parsed: unknown = JSON.parse(customForm.args.trim());
          if (!Array.isArray(parsed)) {
            toastManager.add({
              title: "Invalid args format",
              description: 'Args must be a JSON array of strings (e.g. ["-y", "pi-acp"]) or space-separated values.',
              type: "error",
            });
            return;
          }
          parsedArgs = parsed as string[];
        } catch {
          parsedArgs = customForm.args.trim().split(/\s+/);
        }
      }
      let parsedEnv: Record<string, string> = {};
      if (customForm.env.trim()) {
        try {
          parsedEnv = JSON.parse(customForm.env.trim());
        } catch {
          toastManager.add({
            title: "Invalid env format",
            description: 'Env must be a valid JSON object (e.g. {"KEY": "value"}).',
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
          throw new Error("This custom agent no longer exists. Refresh and try again.");
        }
        if (nextName !== editingCustomAgentName && manifest[nextName]) {
          throw new Error(`A custom agent named "${nextName}" already exists.`);
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
        title: editingCustomAgentName ? "Custom agent updated" : "Custom agent added",
        description: editingCustomAgentName
          ? `"${nextName}" has been updated`
          : `"${nextName}" has been added`,
        type: "success",
      });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toastManager.add({
        title: editingCustomAgentName
          ? "Failed to update custom agent"
          : "Failed to add custom agent",
        description: error instanceof Error ? error.message : "Unknown error",
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
      <DialogContent showCloseButton={true} className="sm:max-w-lg">
        <DialogHeader>
          <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Terminal className="size-5 text-primary" />
          </div>
          <DialogTitle>{editingCustomAgentName ? "Edit Custom Agent" : "Add Custom Agent"}</DialogTitle>
          <DialogDescription className="text-pretty">
            {editingCustomAgentName
              ? "Update this ACP-compatible agent by editing the form, or switch to the raw JSON editor."
              : "Add an ACP-compatible agent by filling in the form, or edit the raw JSON directly."}
          </DialogDescription>
          <p className="text-sm text-muted-foreground">
            Reference available ACP agents at{" "}
            <a
              href="https://agentclientprotocol.com/get-started/agents"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline underline-offset-4"
            >
              agentclientprotocol.com/get-started/agents
            </a>
          </p>
        </DialogHeader>

        {customEditMode === "form" ? (
          <>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Name</label>
                <Input
                  value={customForm.name}
                  onChange={(e) => setCustomForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder='e.g. "Kiro Agent"'
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Command</label>
                <Input
                  value={customForm.command}
                  onChange={(e) => setCustomForm((f) => ({ ...f, command: e.target.value }))}
                  placeholder='e.g. "npx" or "~/.local/bin/kiro-cli"'
                  className="h-9 font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Args <span className="text-muted-foreground font-normal">(space-separated or JSON array)</span>
                </label>
                <Input
                  value={customForm.args}
                  onChange={(e) => setCustomForm((f) => ({ ...f, args: e.target.value }))}
                  placeholder='e.g. acp  or  ["-y", "pi-acp"]'
                  className="h-9 font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Env <span className="text-muted-foreground font-normal">(JSON object, optional)</span>
                </label>
                <Input
                  value={customForm.env}
                  onChange={(e) => setCustomForm((f) => ({ ...f, env: e.target.value }))}
                  placeholder='e.g. {"PI_ACP_STARTUP_INFO": "true"}'
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
                Edit JSON
              </Button>
              <Button
                variant="outline"
                onClick={handleClose}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleSaveCustomAgent()}
                disabled={addingCustom || !customForm.name.trim() || !customForm.command.trim()}
                className="cursor-pointer"
              >
                {addingCustom ? (
                  <>
                    <Loader2 className="mr-1 size-3 animate-spin" />
                    {editingCustomAgentName ? "Saving" : "Adding"}
                  </>
                ) : (
                  <>
                    {editingCustomAgentName ? (
                      <Pencil className="mr-1 size-3.5" />
                    ) : (
                      <Plus className="mr-1 size-3.5" />
                    )}
                    {editingCustomAgentName ? "Save Changes" : "Add Agent"}
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-3 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  custom_agents <span className="text-muted-foreground font-normal">(acp_servers.json)</span>
                </label>
                <Textarea
                  value={customJsonText}
                  onChange={(e) => {
                    setCustomJsonText(e.target.value);
                    setCustomJsonError(null);
                  }}
                  placeholder='{ "pi": { "type": "custom", "command": "npx", "args": ["-y", "pi-acp"], "env": {} } }'
                  className="min-h-[260px] font-mono text-sm leading-relaxed resize-y"
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
                Back to Form
              </Button>
              <Button
                variant="outline"
                onClick={handleClose}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleSaveCustomJson()}
                disabled={addingCustom || !customJsonText.trim()}
                className="cursor-pointer"
              >
                {addingCustom ? (
                  <>
                    <Loader2 className="mr-1 size-3 animate-spin" />
                    Saving
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
