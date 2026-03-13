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
  const [installingRegistryId, setInstallingRegistryId] = React.useState<string | null>(null);
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
    setOverwriteDialog(null);
    setInstallingRegistryId(null);
  }, []);

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
    installingRegistryId,
    removingRegistryId,
    removingCustomName,
    overwriteDialog,
    removeConfirmDialog,
    removeCustomConfirmDialog,
    setRemoveConfirmDialog,
    setRemoveCustomConfirmDialog,
    filteredRegistry,
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
