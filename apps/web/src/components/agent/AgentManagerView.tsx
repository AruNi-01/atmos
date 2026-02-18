"use client";

import React from "react";
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
import { Bot, Github, Loader2, Search, Trash2, ArrowDownToLine, AlertCircle, RefreshCw, CircleFadingArrowUp } from "lucide-react";
import { AgentIcon } from "./AgentIcon";
import { Skeleton } from "@workspace/ui";
import { motion, AnimatePresence } from "motion/react";

/**
 * Compare two semantic version strings.
 * Returns true if installedVersion < latestVersion (update available).
 * Handles cases like "1.10.0" > "1.3.0", "1.0" vs "1.0.0", etc.
 */
function needsUpdate(installedVersion: string, latestVersion: string): boolean {
  const parseVersion = (v: string): number[] => {
    // Remove 'v' prefix if present and split by '.'
    const clean = v.replace(/^v/i, '');
    const parts = clean.split('.').map(p => {
      const num = parseInt(p, 10);
      return isNaN(num) ? 0 : num;
    });
    // Pad with zeros if version has fewer parts (e.g., "1.0" -> [1, 0, 0])
    while (parts.length < 3) {
      parts.push(0);
    }
    return parts;
  };

  const [installedMajor, installedMinor, installedPatch] = parseVersion(installedVersion);
  const [latestMajor, latestMinor, latestPatch] = parseVersion(latestVersion);

  // Compare major version
  if (installedMajor !== latestMajor) {
    return installedMajor < latestMajor;
  }
  // Compare minor version
  if (installedMinor !== latestMinor) {
    return installedMinor < latestMinor;
  }
  // Compare patch version
  return installedPatch < latestPatch;
}

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
  const [removeConfirmDialog, setRemoveConfirmDialog] = React.useState<{
    registryId: string;
    name: string;
  } | null>(null);

  const loadData = React.useCallback(async (forceRefresh = false) => {
    try {
      const registry = await agentApi.listRegistry(forceRefresh);
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
    await loadData(true); // Force refresh from CDN
  };

  const handleRemoveRegistry = async (registryId: string) => {
    setRemoveConfirmDialog(null);
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
      <div className="border-b border-border bg-background/50 px-8 py-6 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between gap-6 max-w-5xl mx-auto w-full">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20">
              <Bot className="size-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground text-balance">Agent Manager</h2>
              <p className="text-sm text-muted-foreground text-pretty max-w-xs">
                Explore and manage your ACP registry agents
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-1 max-w-md">
            <div className="relative w-full group">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60 group-focus-within:text-primary transition-colors" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search agents..."
                className="h-10 pl-10 bg-muted/20 border-border/50 focus:bg-background transition-all rounded-xl shadow-sm focus-visible:ring-1 focus-visible:ring-primary/20"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="h-10 w-10 shrink-0 rounded-xl bg-muted/20 border-border/50 hover:bg-background transition-all shadow-sm cursor-pointer"
              title="Refresh Registry"
            >
              <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-8 scrollbar-on-hover">
        <div className="max-w-5xl mx-auto w-full">
          {loading ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-10 rounded-lg" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                  <div className="mt-auto">
                    <div className="h-px bg-border/40 mt-4" />
                    <div className="flex items-center justify-between pt-3">
                      <Skeleton className="h-8 w-8 rounded-md" />
                      <Skeleton className="h-8 w-20 rounded-md" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6">

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <AnimatePresence mode="popLayout">
                  {filteredRegistry.map((item, index) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2, delay: index * 0.03, ease: "easeOut" }}
                      className={cn(
                        "group relative flex flex-col rounded-xl border p-5 transition-all duration-200 hover:shadow-md",
                        item.installed
                          ? "bg-card border-border/60"
                          : "bg-background border-border"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex items-center gap-3">
                          <div className="size-10 rounded-xl border border-border/50 bg-muted/20 flex items-center justify-center overflow-hidden shrink-0 group-hover:bg-primary/5 transition-colors">
                            <AgentIcon registryId={item.id} name={item.name} />
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold text-foreground tracking-tight">{item.name}</h3>
                            <div className="mt-0.5 flex items-center gap-2">
                              <p className="text-xs text-muted-foreground/70 tabular-nums">
                                v{item.version}
                              </p>
                              {item.installed && item.installed_version && needsUpdate(item.installed_version, item.version) && (
                                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                                  (v{item.installed_version} installed)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors",
                            !item.installed
                              ? "border-primary/20 bg-primary/10 text-primary"
                              : item.installed_version && needsUpdate(item.installed_version, item.version)
                                ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          )}
                        >
                          {!item.installed
                            ? "Available"
                            : item.installed_version && needsUpdate(item.installed_version, item.version)
                              ? "Update Available"
                              : "Installed"}
                        </span>
                      </div>

                      <p className="mt-4 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground text-pretty">
                        {item.description}
                      </p>

                      <div className="mt-auto">
                        <div className="h-px bg-border/40 mt-4" />
                        <div className="flex items-center justify-between gap-3 pt-3">
                          <div className="flex items-center gap-2">
                            {item.repository ? (
                              <button
                                onClick={() => window.open(item.repository!, "_blank", "noopener,noreferrer")}
                                className="inline-flex size-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer transition-colors"
                                title="Open Git repository"
                                aria-label={`Open ${item.name} repository`}
                              >
                                <Github className="size-4" />
                              </button>
                            ) : (
                              <div className="size-8" />
                            )}
                          </div>

                          {!item.installed ? (
                            <Button
                              size="sm"
                              onClick={() => void handleInstallRegistry(item.id)}
                              disabled={installingRegistryId === item.id}
                              className="h-8 rounded-lg px-4"
                            >
                              {installingRegistryId === item.id ? (
                                <>
                                  <Loader2 className="mr-1 size-3 animate-spin" />
                                  Installing
                                </>
                              ) : (
                                <>
                                  <ArrowDownToLine className="mr-1 size-3.5" />
                                  Install
                                </>
                              )}
                            </Button>
                          ) : (
                            <div className="flex items-center gap-2">
                              {item.installed_version && needsUpdate(item.installed_version, item.version) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void handleInstallRegistry(item.id, true)}
                                  disabled={installingRegistryId === item.id}
                                  className="h-8 rounded-lg px-3 text-xs bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/50 transition-all"
                                >
                                  {installingRegistryId === item.id ? (
                                    <>
                                      <Loader2 className="mr-1 size-3 animate-spin" />
                                      Updating
                                    </>
                                  ) : (
                                    <>
                                      <CircleFadingArrowUp className="mr-1 size-3" />
                                      Upgrade
                                    </>
                                  )}
                                </Button>
                              )}
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setRemoveConfirmDialog({ registryId: item.id, name: item.name })}
                                disabled={removingRegistryId === item.id}
                                className="h-8 rounded-lg px-4 text-xs bg-muted/50 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 border-transparent transition-all"
                              >
                                {removingRegistryId === item.id ? (
                                  <>
                                    <Loader2 className="mr-1 size-3 animate-spin" />
                                    Removing
                                  </>
                                ) : (
                                  <>
                                    <Trash2 className="mr-1 size-3.5" />
                                    Remove
                                  </>
                                )}
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {filteredRegistry.length === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-24 text-center"
                >
                  <div className="size-16 rounded-3xl bg-muted/20 flex items-center justify-center mb-4">
                    <Search className="size-8 text-muted-foreground/30" />
                  </div>
                  <h3 className="text-base font-medium text-foreground">No agents found</h3>
                  <p className="mt-1 text-sm text-muted-foreground max-w-[280px] text-pretty">
                    We couldn&apos;t find any agents matching &quot;{query}&quot;. Try a different search term.
                  </p>
                  {query && (
                    <Button
                      variant="link"
                      onClick={() => setQuery("")}
                      className="mt-4"
                    >
                      Clear search filter
                    </Button>
                  )}
                </motion.div>
              )}
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
              <div className="size-10 rounded-full bg-yellow-500/10 flex items-center justify-center mb-2">
                <AlertCircle className="size-5 text-yellow-600" />
              </div>
              <DialogTitle>Overwrite Confirmation</DialogTitle>
              <DialogDescription className="text-pretty">{overwriteDialog?.message}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setOverwriteDialog(null);
                  setInstallingRegistryId(null);
                }}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button onClick={() => void handleConfirmOverwrite()} className="cursor-pointer">Continue</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!removeConfirmDialog}
          onOpenChange={(open) => {
            if (!open) setRemoveConfirmDialog(null);
          }}
        >
          <DialogContent showCloseButton={true}>
            <DialogHeader>
              <div className="size-10 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
                <Trash2 className="size-5 text-destructive" />
              </div>
              <DialogTitle>Uninstall Agent</DialogTitle>
              <DialogDescription className="text-pretty">
                Are you sure you want to uninstall <span className="font-semibold text-foreground">{removeConfirmDialog?.name}</span>? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRemoveConfirmDialog(null)}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => removeConfirmDialog && handleRemoveRegistry(removeConfirmDialog.registryId)}
                className="cursor-pointer"
              >
                Uninstall
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};
