"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
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
} from "@workspace/ui";
import { Bot, ChevronDown, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";

import { TerminalAgentRunConfigContent } from "@/features/agent/components/TerminalAgentRunConfigDialog";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import {
  buildRunConfigSummary,
  sanitizeRunConfig,
  type TerminalAgentRunConfigInput,
  type TerminalAgentSavedRunConfig,
} from "@/features/agent/lib/terminal-agent-run-config";

interface AgentOption {
  id: string;
  label: string;
}

interface CodeAgentRunConfigSettingsSectionProps {
  agentOptions: AgentOption[];
  loading: boolean;
  runConfigs: TerminalAgentSavedRunConfig[];
  saving: boolean;
  onSaveRunConfigs: (configs: TerminalAgentSavedRunConfig[]) => Promise<void>;
}

export function CodeAgentRunConfigSettingsSection({
  agentOptions,
  loading,
  runConfigs,
  saving,
  onSaveRunConfigs,
}: CodeAgentRunConfigSettingsSectionProps) {
  const t = useTranslations("settings.codeAgentRunConfigSection");
  const agentLabelById = React.useMemo(
    () => new Map(agentOptions.map((item) => [item.id, item.label])),
    [agentOptions],
  );
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draftName, setDraftName] = React.useState("");
  const [draftAgentId, setDraftAgentId] = React.useState(agentOptions[0]?.id ?? "");
  const [draftConfig, setDraftConfig] = React.useState<TerminalAgentRunConfigInput | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(true);

  React.useEffect(() => {
    if (draftAgentId || agentOptions.length === 0) return;
    setDraftAgentId(agentOptions[0].id);
  }, [agentOptions, draftAgentId]);

  const resetEditor = React.useCallback(() => {
    setEditingId(null);
    setDraftName("");
    setDraftAgentId(agentOptions[0]?.id ?? "");
    setDraftConfig(null);
    setEditorOpen(false);
    setError(null);
  }, [agentOptions]);

  const openCreate = React.useCallback(() => {
    setEditingId(null);
    setDraftName("");
    setDraftAgentId(agentOptions[0]?.id ?? "");
    setDraftConfig(null);
    setEditorOpen(true);
    setError(null);
  }, [agentOptions]);

  const openEdit = React.useCallback((config: TerminalAgentSavedRunConfig) => {
    setEditingId(config.id);
    setDraftName(config.name);
    setDraftAgentId(config.agent_id);
    setDraftConfig(sanitizeRunConfig(config.config));
    setEditorOpen(true);
    setError(null);
  }, []);

  const handleSave = React.useCallback(async () => {
    const name = draftName.trim();
    if (!name) {
      setError(t("errors.nameRequired"));
      return;
    }
    if (!draftAgentId) {
      setError(t("errors.agentRequired"));
      return;
    }

    const nextConfig: TerminalAgentSavedRunConfig = {
      id: editingId ?? crypto.randomUUID(),
      name,
      agent_id: draftAgentId,
      config: sanitizeRunConfig(draftConfig) ?? {},
    };
    const nextRunConfigs = [
      ...runConfigs.filter((item) => item.id !== nextConfig.id),
      nextConfig,
    ].sort((left, right) => left.name.localeCompare(right.name));

    await onSaveRunConfigs(nextRunConfigs);
    resetEditor();
  }, [draftAgentId, draftConfig, draftName, editingId, onSaveRunConfigs, resetEditor, runConfigs, t]);

  const handleDelete = React.useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await onSaveRunConfigs(runConfigs.filter((item) => item.id !== id));
      setConfirmingDeleteId((current) => (current === id ? null : current));
      if (editingId === id) {
        resetEditor();
      }
    } finally {
      setDeletingId(null);
    }
  }, [editingId, onSaveRunConfigs, resetEditor, runConfigs]);

  const selectedAgentLabel = agentLabelById.get(draftAgentId) ?? draftAgentId;
  const groupedConfigs = React.useMemo(() => {
    const groups = new Map<string, TerminalAgentSavedRunConfig[]>();
    for (const config of runConfigs) {
      const current = groups.get(config.agent_id) ?? [];
      current.push(config);
      groups.set(config.agent_id, current);
    }
    return agentOptions
      .map((agent) => ({
        agentId: agent.id,
        agentLabel: agent.label,
        configs: (groups.get(agent.id) ?? []).sort((left, right) => left.name.localeCompare(right.name)),
      }))
      .filter((group) => group.configs.length > 0);
  }, [agentOptions, runConfigs]);

  return (
    <Collapsible
      open={expanded}
      onOpenChange={setExpanded}
      className="overflow-hidden rounded-2xl border border-border"
    >
      <div className="flex items-start justify-between gap-4 px-6 py-5">
        <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
          <div className="flex items-start gap-3">
            <span className="relative mt-0.5 size-5 shrink-0">
              <Bot className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
              <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-medium text-foreground">{t("title")}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("description")}
              </p>
            </div>
          </div>
        </CollapsibleTrigger>
        <Button variant="outline" onClick={openCreate}>
          <Plus className="mr-2 size-4" />
          {t("actions.addConfig")}
        </Button>
      </div>

      <CollapsibleContent className="border-t border-border px-6 py-5">
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : runConfigs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <div className="space-y-5">
            {groupedConfigs.map((group) => (
              <div key={group.agentId} className="space-y-3">
                <div className="flex items-center gap-2">
                  <AgentIcon registryId={group.agentId} name={group.agentLabel} size={16} />
                  <p className="text-sm font-medium text-foreground">{group.agentLabel}</p>
                </div>
                <div className="space-y-3">
                  {group.configs.map((config) => {
                    const isDeleting = deletingId === config.id;
                    return (
                      <div
                        key={config.id}
                        className="flex items-center justify-between gap-4 rounded-2xl border border-border px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{config.name}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {buildRunConfigSummary(group.agentLabel, config.config)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(config)}>
                            <Pencil className="mr-2 size-4" />
                            {t("actions.edit")}
                          </Button>
                          <Popover
                            open={confirmingDeleteId === config.id}
                            onOpenChange={(nextOpen) => setConfirmingDeleteId(nextOpen ? config.id : null)}
                          >
                            <PopoverTrigger asChild>
                              <Button type="button" variant="ghost" size="sm" disabled={isDeleting}>
                                {isDeleting ? (
                                  <LoaderCircle className="size-4 animate-spin-reverse" />
                                ) : (
                                  <Trash2 className="size-4" />
                                )}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-72 space-y-3">
                              <div className="space-y-1">
                                <p className="text-sm font-medium text-foreground">{t("deleteConfirm.title")}</p>
                                <p className="text-xs leading-5 text-muted-foreground">
                                  {t.rich("deleteConfirm.description", {
                                    name: config.name,
                                    strong: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
                                  })}
                                </p>
                              </div>
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setConfirmingDeleteId(null)}
                                >
                                  {t("actions.cancel")}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  disabled={isDeleting}
                                  onClick={() => void handleDelete(config.id)}
                                >
                                  {t("actions.delete")}
                                </Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleContent>

      <Dialog open={editorOpen} onOpenChange={(nextOpen) => (!nextOpen ? resetEditor() : setEditorOpen(true))}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogTitle>{editingId ? t("editor.editTitle") : t("editor.addTitle")}</DialogTitle>
          <DialogDescription>
            {t("editor.description")}
          </DialogDescription>

          <div className="space-y-4 pt-2">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t("fields.name")}</label>
                <Input
                  value={draftName}
                  placeholder={t("editor.namePlaceholder")}
                  onChange={(event) => setDraftName(event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t("fields.agent")}</label>
                <Select value={draftAgentId} onValueChange={setDraftAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("editor.selectAgent")} />
                  </SelectTrigger>
                  <SelectContent>
                    {agentOptions.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        <div className="flex items-center gap-2">
                          <AgentIcon registryId={agent.id} name={agent.label} size={16} />
                          {agent.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {draftAgentId ? (
              <TerminalAgentRunConfigContent
                agentId={draftAgentId}
                agentLabel={selectedAgentLabel || "Agent"}
                purpose="settings"
                savedRunConfigs={runConfigs.filter((item) => item.id !== editingId)}
                value={draftConfig}
                onApply={setDraftConfig}
                onCancel={() => {}}
                embedded
                showHeader={false}
                showActions={false}
                liveApply
              />
            ) : null}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" onClick={resetEditor}>
                {t("actions.cancel")}
              </Button>
              <Button type="button" disabled={saving} onClick={() => void handleSave()}>
                {saving ? <LoaderCircle className="size-4 animate-spin-reverse" /> : t("actions.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Collapsible>
  );
}
