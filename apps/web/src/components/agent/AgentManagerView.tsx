"use client";

import React from "react";
import { useQueryStates } from "nuqs";
import { agentManagerParams, type AgentTab } from "@/lib/nuqs/searchParams";
import {
  Button,
  Input,
  Textarea,
  cn,
  toastManager,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@workspace/ui";
import {
  agentApi,
  type RegistryAgent,
  type CustomAgent,
} from "@/api/ws-api";
import { Bot, Github, Loader2, Search, Trash2, ArrowDownToLine, AlertCircle, RefreshCw, CircleFadingArrowUp, Plus, Terminal, Download, Globe, FileCode, MessageSquare } from "lucide-react";
import { ChatSessionsManagementView } from "@/components/chat-sessions/ChatSessionsManagementView";
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
  const [{ agentTab: activeTab, agentQ: query }, setAgentParams] = useQueryStates(agentManagerParams);
  const [isSessionsView, setIsSessionsView] = React.useState(false);
  const [iconHovered, setIconHovered] = React.useState(false);
  const [registryAgents, setRegistryAgents] = React.useState<RegistryAgent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [installingRegistryId, setInstallingRegistryId] = React.useState<string | null>(null);
  const [removingRegistryId, setRemovingRegistryId] = React.useState<string | null>(null);
  const [overwriteDialog, setOverwriteDialog] = React.useState<{
    registryId: string;
    message: string;
  } | null>(null);
  const [removeConfirmDialog, setRemoveConfirmDialog] = React.useState<{
    registryId: string;
    name: string;
  } | null>(null);
  const [customAgents, setCustomAgents] = React.useState<CustomAgent[]>([]);
  const [addCustomDialogOpen, setAddCustomDialogOpen] = React.useState(false);
  const [customForm, setCustomForm] = React.useState({ name: "", command: "", args: "", env: "" });
  const [addingCustom, setAddingCustom] = React.useState(false);
  const [removingCustomName, setRemovingCustomName] = React.useState<string | null>(null);
  const [removeCustomConfirmDialog, setRemoveCustomConfirmDialog] = React.useState<{
    name: string;
  } | null>(null);
  const [customEditMode, setCustomEditMode] = React.useState<"form" | "json">("form");
  const [customJsonText, setCustomJsonText] = React.useState("");
  const [customJsonError, setCustomJsonError] = React.useState<string | null>(null);
  const [loadingJson, setLoadingJson] = React.useState(false);

  const loadData = React.useCallback(async (forceRefresh = false) => {
    try {
      const [registry, custom] = await Promise.all([
        agentApi.listRegistry(forceRefresh),
        agentApi.listCustomAgents(),
      ]);
      setRegistryAgents(registry.agents);
      setCustomAgents(custom.agents);
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

  const installedAgents = React.useMemo(() => {
    return filteredRegistry.filter((a) => a.installed);
  }, [filteredRegistry]);

  const installedCount = React.useMemo(() => {
    return registryAgents.filter((a) => a.installed).length;
  }, [registryAgents]);

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
      setAddCustomDialogOpen(false);
      setCustomEditMode("form");
      setCustomJsonText("");
      setCustomForm({ name: "", command: "", args: "", env: "" });
      await loadData();
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

  const handleAddCustomAgent = async () => {
    if (!customForm.name.trim() || !customForm.command.trim()) return;
    setAddingCustom(true);
    try {
      let parsedArgs: string[] = [];
      if (customForm.args.trim()) {
        try {
          parsedArgs = JSON.parse(customForm.args.trim());
        } catch {
          parsedArgs = customForm.args.trim().split(/\s+/);
        }
      }
      let parsedEnv: Record<string, string> = {};
      if (customForm.env.trim()) {
        try {
          parsedEnv = JSON.parse(customForm.env.trim());
        } catch {
          // ignore invalid env
        }
      }
      await agentApi.addCustomAgent({
        name: customForm.name.trim(),
        command: customForm.command.trim(),
        args: parsedArgs,
        env: parsedEnv,
      });
      toastManager.add({
        title: "Custom agent added",
        description: `"${customForm.name.trim()}" has been added`,
        type: "success",
      });
      setAddCustomDialogOpen(false);
      setCustomForm({ name: "", command: "", args: "", env: "" });
      await loadData();
    } catch (error) {
      toastManager.add({
        title: "Failed to add custom agent",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    } finally {
      setAddingCustom(false);
    }
  };

  const handleRemoveCustomAgent = async (name: string) => {
    setRemoveCustomConfirmDialog(null);
    setRemovingCustomName(name);
    try {
      await agentApi.removeCustomAgent(name);
      toastManager.add({
        title: "Custom agent removed",
        description: `"${name}" has been removed`,
        type: "success",
      });
      await loadData();
    } catch (error) {
      toastManager.add({
        title: "Failed to remove custom agent",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    } finally {
      setRemovingCustomName(null);
    }
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

  const renderAgentCard = (item: RegistryAgent, index: number) => (
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
            <AgentIcon
              registryId={item.id}
              name={item.name}
              isCustom={item.install_method === "custom"}
            />
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
  );

  const renderCustomAgentCard = (agent: CustomAgent, index: number) => (
    <motion.div
      key={`custom-${agent.name}`}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, delay: index * 0.03, ease: "easeOut" }}
      className="group relative flex flex-col rounded-xl border bg-card border-border/60 p-5 transition-all duration-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-center gap-3">
          <div className="size-10 rounded-xl border border-border/50 bg-muted/20 flex items-center justify-center overflow-hidden shrink-0 group-hover:bg-primary/5 transition-colors">
            <Terminal className="size-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground tracking-tight">{agent.name}</h3>
            <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
              {agent.command} {agent.args.join(" ")}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400 px-2.5 py-0.5 text-[10px] font-medium">
          Custom
        </span>
      </div>

      {Object.keys(agent.env).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(agent.env).map(([key, value]) => (
            <span key={key} className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground font-mono">
              {key}={value}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto">
        <div className="h-px bg-border/40 mt-4" />
        <div className="flex items-center justify-end pt-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setRemoveCustomConfirmDialog({ name: agent.name })}
            disabled={removingCustomName === agent.name}
            className="h-8 rounded-lg px-4 text-xs bg-muted/50 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 border-transparent transition-all"
          >
            {removingCustomName === agent.name ? (
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
      </div>
    </motion.div>
  );

  const renderEmptyState = (message: string) => (
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
        {message}
      </p>
      {query && (
        <Button
          variant="link"
          onClick={() => setAgentParams({ agentQ: "" })}
          className="mt-4"
        >
          Clear search filter
        </Button>
      )}
    </motion.div>
  );

  const renderSkeletonGrid = () => (
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
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div
        className="border-b border-border bg-background/50 px-8 py-6 backdrop-blur-sm sticky top-0 z-10 cursor-pointer"
        onMouseEnter={() => setIconHovered(true)}
        onMouseLeave={() => setIconHovered(false)}
        onClick={() => setIsSessionsView(prev => !prev)}
      >
        <div className="flex items-center justify-between gap-6 max-w-5xl mx-auto w-full">
          <div className="flex items-center gap-4 shrink-0">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="relative flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20 overflow-hidden"
                    aria-label={isSessionsView ? "Switch to Agent Manager" : "Switch to Sessions"}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {(isSessionsView !== iconHovered) ? (
                        <motion.div
                          key="sessions-icon"
                          initial={{ y: 12, opacity: 0, scale: 0.85 }}
                          animate={{ y: 0, opacity: 1, scale: 1 }}
                          exit={{ y: -12, opacity: 0, scale: 0.85 }}
                          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                          className="absolute inset-0 flex items-center justify-center"
                        >
                          <MessageSquare className="size-6" />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="agents-icon"
                          initial={{ y: 12, opacity: 0, scale: 0.85 }}
                          animate={{ y: 0, opacity: 1, scale: 1 }}
                          exit={{ y: -12, opacity: 0, scale: 0.85 }}
                          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                          className="absolute inset-0 flex items-center justify-center"
                        >
                          <Bot className="size-6" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {isSessionsView ? "Switch to Agent Manager" : "Switch to Sessions"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="relative overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={isSessionsView ? "sessions-title" : "agents-title"}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                >
                  <h2 className="text-xl font-bold tracking-tight text-foreground text-balance">
                    {isSessionsView ? "Chat Sessions" : "Agent Manager"}
                  </h2>
                  <p className="text-sm text-muted-foreground text-pretty max-w-xs">
                    {isSessionsView
                      ? "View and manage your AI agent chat sessions"
                      : "Explore and manage your ACP agents"}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Agent controls - only show when NOT in sessions view */}
          {!isSessionsView && (
            <div className="flex-1 max-w-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <div className="relative w-full group">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60 group-focus-within:text-primary transition-colors" />
                  <Input
                    value={query}
                    onChange={(e) => setAgentParams({ agentQ: e.target.value })}
                    placeholder="Search agents..."
                    className="h-10 pl-10 bg-muted/20 border-border/50 focus:bg-background transition-all rounded-xl shadow-sm focus-visible:ring-1 focus-visible:ring-primary/20"
                  />
                </div>
                {activeTab === "custom" && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setAddCustomDialogOpen(true)}
                    className="h-10 w-10 shrink-0 rounded-xl bg-muted/20 border-border/50 hover:bg-background transition-all shadow-sm cursor-pointer"
                    title="Add Custom Agent"
                  >
                    <Plus className="size-4" />
                  </Button>
                )}
                {activeTab === "registry" && (
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
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {isSessionsView ? (
          <motion.div
            key="sessions-content"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="flex-1 overflow-hidden"
          >
            <ChatSessionsManagementView hideHeader />
          </motion.div>
        ) : (
          <motion.div
            key="agents-content"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="flex-1 flex flex-col overflow-hidden"
          >
      <Tabs
        value={activeTab}
        onValueChange={(v) => setAgentParams({ agentTab: v as AgentTab })}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <div className="px-8 pt-4 pb-2">
          <div className="max-w-5xl mx-auto w-full">
            <TabsList>
              <TabsTrigger value="installed">
                <Download className="size-4" />
                Installed
                {!loading && installedCount + customAgents.length > 0 && (
                  <span className="ml-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {installedCount + customAgents.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="registry">
                <Globe className="size-4" />
                ACP Registry
                {!loading && (
                  <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground tabular-nums">
                    {registryAgents.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="custom">
                <Terminal className="size-4" />
                Custom
                {!loading && customAgents.length > 0 && (
                  <span className="ml-1 rounded-full bg-violet-500/10 border border-violet-500/20 px-1.5 text-[10px] font-medium text-violet-600 dark:text-violet-400 tabular-nums">
                    {customAgents.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <div className="flex-1 scrollbar-on-hover overflow-auto px-8 pt-4 pb-8">
          <div className="max-w-5xl mx-auto w-full">
            <TabsContent value="installed">
              {loading ? renderSkeletonGrid() : (
                <>
                  {installedAgents.length > 0 || customAgents.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <AnimatePresence mode="popLayout">
                        {installedAgents.map((item, index) => renderAgentCard(item, index))}
                        {customAgents.map((agent, index) => renderCustomAgentCard(agent, installedAgents.length + index))}
                      </AnimatePresence>
                    </div>
                  ) : (
                    renderEmptyState(
                      query
                        ? `No installed agents matching "${query}".`
                        : "No agents installed yet. Browse the ACP Registry to get started."
                    )
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="registry">
              {loading ? renderSkeletonGrid() : (
                <>
                  {filteredRegistry.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <AnimatePresence mode="popLayout">
                        {filteredRegistry.map((item, index) => renderAgentCard(item, index))}
                      </AnimatePresence>
                    </div>
                  ) : (
                    renderEmptyState(
                      query
                        ? `No registry agents matching "${query}".`
                        : "No agents available in the ACP registry."
                    )
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="custom">
              {loading ? renderSkeletonGrid() : (
                <>
                  {customAgents.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <AnimatePresence mode="popLayout">
                        {customAgents.map((agent, index) => renderCustomAgentCard(agent, index))}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center justify-center py-24 text-center"
                    >
                      <div className="size-16 rounded-3xl bg-muted/20 flex items-center justify-center mb-4">
                        <Terminal className="size-8 text-muted-foreground/30" />
                      </div>
                      <h3 className="text-base font-medium text-foreground">No custom agents</h3>
                      <p className="mt-1 text-sm text-muted-foreground max-w-[280px] text-pretty">
                        Add a custom ACP agent by clicking the + button above.
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => setAddCustomDialogOpen(true)}
                        className="mt-4 cursor-pointer"
                      >
                        <Plus className="mr-1.5 size-4" />
                        Add Custom Agent
                      </Button>
                    </motion.div>
                  )}
                </>
              )}
            </TabsContent>
          </div>
        </div>
      </Tabs>
          </motion.div>
        )}
      </AnimatePresence>

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

      <Dialog
        open={!!removeCustomConfirmDialog}
        onOpenChange={(open) => {
          if (!open) setRemoveCustomConfirmDialog(null);
        }}
      >
        <DialogContent showCloseButton={true}>
          <DialogHeader>
            <div className="size-10 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
              <Trash2 className="size-5 text-destructive" />
            </div>
            <DialogTitle>Remove Custom Agent</DialogTitle>
            <DialogDescription className="text-pretty">
              Are you sure you want to remove <span className="font-semibold text-foreground">{removeCustomConfirmDialog?.name}</span>? You can add it back later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoveCustomConfirmDialog(null)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => removeCustomConfirmDialog && handleRemoveCustomAgent(removeCustomConfirmDialog.name)}
              className="cursor-pointer"
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addCustomDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAddCustomDialogOpen(false);
            setCustomForm({ name: "", command: "", args: "", env: "" });
            setCustomEditMode("form");
            setCustomJsonText("");
            setCustomJsonError(null);
          }
        }}
      >
        <DialogContent showCloseButton={true} className="sm:max-w-lg">
          <DialogHeader>
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <Terminal className="size-5 text-primary" />
            </div>
            <DialogTitle>Add Custom Agent</DialogTitle>
            <DialogDescription className="text-pretty">
              Add an ACP-compatible agent by filling in the form, or edit the raw JSON directly.
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
                  onClick={() => {
                    setAddCustomDialogOpen(false);
                    setCustomForm({ name: "", command: "", args: "", env: "" });
                  }}
                  className="cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => void handleAddCustomAgent()}
                  disabled={addingCustom || !customForm.name.trim() || !customForm.command.trim()}
                  className="cursor-pointer"
                >
                  {addingCustom ? (
                    <>
                      <Loader2 className="mr-1 size-3 animate-spin" />
                      Adding
                    </>
                  ) : (
                    <>
                      <Plus className="mr-1 size-3.5" />
                      Add Agent
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
                  onClick={() => {
                    setAddCustomDialogOpen(false);
                    setCustomEditMode("form");
                    setCustomJsonText("");
                    setCustomJsonError(null);
                    setCustomForm({ name: "", command: "", args: "", env: "" });
                  }}
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
    </div>
  );
};
