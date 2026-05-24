import React from "react";
import {
  agentApi,
  type RegistryAgent,
  type CustomAgent,
} from "@/api/ws-api";
import { toastManager } from "@workspace/ui";

export function useAgentManager(query: string) {
  const [registryAgents, setRegistryAgents] = React.useState<RegistryAgent[]>([]);
  const [customAgents, setCustomAgents] = React.useState<CustomAgent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [installingRegistryIds, setInstallingRegistryIds] = React.useState<Set<string>>(() => new Set());
  const [removingRegistryId, setRemovingRegistryId] = React.useState<string | null>(null);
  const [removingCustomName, setRemovingCustomName] = React.useState<string | null>(null);
  const [overwriteDialog, setOverwriteDialog] = React.useState<{
    registryId: string;
    message: string;
  } | null>(null);
  const [removeConfirmDialog, setRemoveConfirmDialog] = React.useState<{
    registryId: string;
    name: string;
  } | null>(null);
  const [removeCustomConfirmDialog, setRemoveCustomConfirmDialog] = React.useState<{
    name: string;
  } | null>(null);

  const markRegistryInstalling = React.useCallback((registryId: string) => {
    setInstallingRegistryIds((prev) => {
      const next = new Set(prev);
      next.add(registryId);
      return next;
    });
  }, []);

  const clearRegistryInstalling = React.useCallback((registryId: string) => {
    setInstallingRegistryIds((prev) => {
      if (!prev.has(registryId)) return prev;
      const next = new Set(prev);
      next.delete(registryId);
      return next;
    });
  }, []);

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

  const normalizedQuery = React.useMemo(() => query.trim().toLowerCase(), [query]);

  const matchesQuery = React.useCallback((item: RegistryAgent) => {
    if (!normalizedQuery) return true;
    return (
      item.name.toLowerCase().includes(normalizedQuery) ||
      item.id.toLowerCase().includes(normalizedQuery) ||
      item.description.toLowerCase().includes(normalizedQuery) ||
      item.version.toLowerCase().includes(normalizedQuery)
    );
  }, [normalizedQuery]);

  const filteredRegistry = React.useMemo(() => {
    return registryAgents
      .filter((item) => !item.installed)
      .filter(matchesQuery)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [matchesQuery, registryAgents]);

  const installedAgents = React.useMemo(() => {
    return registryAgents
      .filter((item) => item.installed)
      .filter(matchesQuery)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [matchesQuery, registryAgents]);

  const registryCount = React.useMemo(() => {
    return registryAgents.filter((a) => !a.installed).length;
  }, [registryAgents]);

  const installedCount = React.useMemo(() => {
    return registryAgents.filter((a) => a.installed).length;
  }, [registryAgents]);

  const filteredCustomAgents = React.useMemo(() => {
    if (!normalizedQuery) return customAgents;
    return customAgents.filter((agent) => {
      const commandLine = [agent.command, ...agent.args].join(" ").toLowerCase();
      return (
        agent.name.toLowerCase().includes(normalizedQuery) ||
        commandLine.includes(normalizedQuery)
      );
    });
  }, [customAgents, normalizedQuery]);

  const handleInstallRegistry = async (registryId: string, forceOverwrite = false) => {
    markRegistryInstalling(registryId);
    try {
      const result = await agentApi.installRegistry(registryId, forceOverwrite);
      if (result.needs_confirmation && result.overwrite_message) {
        setOverwriteDialog({ registryId, message: result.overwrite_message });
        return; // Keep this registry in installing state while dialog is open
      }
      toastManager.add({
        title: "Agent installed",
        description: result.message,
        type: "success",
      });
      await loadData();
      clearRegistryInstalling(registryId);
    } catch (error) {
      toastManager.add({
        title: "Install failed",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
      clearRegistryInstalling(registryId);
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
    await loadData(true);
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

  const cancelOverwrite = React.useCallback(() => {
    setOverwriteDialog((current) => {
      if (current) {
        clearRegistryInstalling(current.registryId);
      }
      return null;
    });
  }, [clearRegistryInstalling]);

  const cancelRemoveRegistry = React.useCallback(() => {
    setRemoveConfirmDialog(null);
  }, []);

  const cancelRemoveCustom = React.useCallback(() => {
    setRemoveCustomConfirmDialog(null);
  }, []);

  return {
    registryAgents,
    customAgents,
    loading,
    refreshing,
    installingRegistryIds,
    removingRegistryId,
    removingCustomName,
    overwriteDialog,
    removeConfirmDialog,
    removeCustomConfirmDialog,
    setRemoveConfirmDialog,
    setRemoveCustomConfirmDialog,
    filteredCustomAgents,
    filteredRegistry,
    registryCount,
    installedAgents,
    installedCount,
    handleInstallRegistry,
    handleConfirmOverwrite,
    handleRefresh,
    handleRemoveRegistry,
    handleRemoveCustomAgent,
    cancelOverwrite,
    cancelRemoveRegistry,
    cancelRemoveCustom,
    loadData,
  };
}
