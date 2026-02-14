"use client";

import React from "react";
import Image from "next/image";
import {
  Button,
  Input,
  cn,
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
  type RegistryAgent,
} from "@/api/ws-api";
import { Bot, Github, Loader2, Search } from "lucide-react";

const AGENT_ICON_ALIASES: Record<string, string[]> = {
  "claude-code-acp": ["claude-code"],
  "codex-acp": ["codex"],
  "github-copilot": ["copilot"],
  "factory-droid": ["droid"],
  "junie-acp": ["junie"],
};

function getAgentIconCandidates(registryId: string): string[] {
  const aliases = AGENT_ICON_ALIASES[registryId] ?? [];
  return [registryId, ...aliases].map((name) => `/agents/${name}.svg`);
}

const AgentIcon: React.FC<{ registryId: string; name: string; size?: number }> = ({
  registryId,
  name,
  size = 18,
}) => {
  const candidates = React.useMemo(() => getAgentIconCandidates(registryId), [registryId]);
  const [idx, setIdx] = React.useState(0);

  if (idx >= candidates.length) {
    return <Bot className="text-muted-foreground" style={{ width: size, height: size }} />;
  }

  return (
    <Image
      src={candidates[idx]}
      alt={`${name} icon`}
      width={size}
      height={size}
      className="opacity-95 invert dark:invert-0"
      onError={() => setIdx((v) => v + 1)}
    />
  );
};

export const AgentManagerView: React.FC = () => {
  const [registryAgents, setRegistryAgents] = React.useState<RegistryAgent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [installingRegistryId, setInstallingRegistryId] = React.useState<string | null>(null);
  const [removingRegistryId, setRemovingRegistryId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [overwriteDialog, setOverwriteDialog] = React.useState<{
    registryId: string;
    message: string;
  } | null>(null);

  const loadData = React.useCallback(async () => {
    try {
      const registry = await agentApi.listRegistry();
      setRegistryAgents(registry.agents);
    } catch (error) {
      toastManager.add({
        title: "Failed to load agents",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredRegistry = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return registryAgents
      .filter((item) => {
        if (!q) return true;
        return (
          item.name.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.version.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.installed !== b.installed) return a.installed ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [registryAgents, query]);

  const handleInstallRegistry = async (registryId: string, forceOverwrite = false) => {
    setInstallingRegistryId(registryId);
    try {
      const result = await agentApi.installRegistry(registryId, forceOverwrite);
      if (result.needs_confirmation && result.overwrite_message) {
        setOverwriteDialog({ registryId, message: result.overwrite_message });
        return;
      }
      toastManager.add({
        title: "Agent installed",
        description: result.message,
        type: "success",
      });
      await loadData();
    } catch (error) {
      toastManager.add({
        title: "Install failed",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    } finally {
      setInstallingRegistryId(null);
    }
  };

  const handleConfirmOverwrite = async () => {
    if (!overwriteDialog) return;
    const { registryId } = overwriteDialog;
    setOverwriteDialog(null);
    await handleInstallRegistry(registryId, true);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  const handleRemoveRegistry = async (registryId: string) => {
    setRemovingRegistryId(registryId);
    try {
      const result = await agentApi.removeRegistry(registryId);
      toastManager.add({
        title: "Agent removed",
        description: result.message,
        type: "success",
      });
      await loadData();
    } catch (error) {
      toastManager.add({
        title: "Remove failed",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    } finally {
      setRemovingRegistryId(null);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="border-b border-border bg-background/50 px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Bot className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Agent Manager</h2>
              <p className="text-sm text-muted-foreground">
              Browse and manage ACP registry agents
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void handleRefresh()} disabled={refreshing}>
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            <section className="rounded-lg border border-border bg-card">
              <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search registry agents..."
                    className="h-9 pl-9"
                  />
                </div>
              </div>

              <div className="p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {filteredRegistry.map((item) => {
                    return (
                      <div key={item.id} className="rounded-lg border border-border bg-background p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex items-center gap-2">
                            <div
                              className="size-7 rounded-md border border-border/70 bg-muted/30 flex items-center justify-center overflow-hidden shrink-0"
                            >
                              <AgentIcon registryId={item.id} name={item.name} />
                            </div>
                            <div className="min-w-0">
                              <h3 className="truncate text-sm font-medium text-foreground">{item.name}</h3>
                              <p className="mt-0.5 text-xs text-muted-foreground">{item.version}</p>
                            </div>
                          </div>
                          <span
                            className={cn(
                              "rounded-sm border px-2 py-0.5 text-[10px]",
                              item.installed
                                ? "border-border bg-background text-muted-foreground"
                                : "border-primary/20 bg-primary/15 text-primary"
                            )}
                          >
                            {item.installed ? "Installed" : "Available"}
                          </span>
                        </div>

                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            {item.repository ? (
                              <button
                                onClick={() => window.open(item.repository!, "_blank", "noopener,noreferrer")}
                                className="inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground cursor-pointer"
                                title="Open Git repository"
                              >
                                <Github className="size-3.5" />
                              </button>
                            ) : null}
                          </div>
                          {!item.installed ? (
                            <Button
                              size="sm"
                              onClick={() => void handleInstallRegistry(item.id)}
                              disabled={installingRegistryId === item.id || removingRegistryId === item.id}
                            >
                              {installingRegistryId === item.id ? (
                                <>
                                  <Loader2 className="mr-1 size-3 animate-spin" />
                                  Installing
                                </>
                              ) : (
                                "Install"
                              )}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void handleRemoveRegistry(item.id)}
                              disabled={removingRegistryId === item.id || installingRegistryId === item.id}
                            >
                              {removingRegistryId === item.id ? (
                                <>
                                  <Loader2 className="mr-1 size-3 animate-spin" />
                                  Removing
                                </>
                              ) : (
                                "Remove"
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {filteredRegistry.length === 0 && (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    No agents match current filter.
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      <Dialog
        open={!!overwriteDialog}
        onOpenChange={(open) => {
          if (!open) {
            setOverwriteDialog(null);
            setInstallingRegistryId(null);
          }
        }}
      >
        <DialogContent showCloseButton={true}>
          <DialogHeader>
            <DialogTitle>Overwrite Confirmation</DialogTitle>
            <DialogDescription>{overwriteDialog?.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOverwriteDialog(null);
                setInstallingRegistryId(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleConfirmOverwrite()}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
