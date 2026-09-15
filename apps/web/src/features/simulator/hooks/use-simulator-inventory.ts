"use client";

import React from "react";
import {
  listenSimulatorDevicesChanged,
  simulatorApi,
  type SimulatorDevice,
  type SimulatorInventory,
} from "@/api/ws/simulator-api";
import {
  parseSimulatorError,
  simulatorErrorText,
  type SimulatorChromeReason,
} from "../lib/simulator-errors";
import { flattenInventory } from "../lib/simulator-inventory";

export type InventoryRowAction = "boot" | "shutdown" | "delete" | "preview";

export function useSimulatorInventory(input: {
  workspaceId: string | null;
  enabled: boolean;
}) {
  const { workspaceId, enabled } = input;
  const [inventory, setInventory] = React.useState<SimulatorInventory | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [errorReason, setErrorReason] = React.useState<SimulatorChromeReason | null>(null);
  const [rowBusy, setRowBusy] = React.useState<{
    udid: string;
    action: InventoryRowAction;
  } | null>(null);
  const [rowError, setRowError] = React.useState<{
    udid: string;
    reason: SimulatorChromeReason | null;
    message: string;
  } | null>(null);
  const [selectedUdid, setSelectedUdid] = React.useState<string | null>(null);
  const loadedRef = React.useRef(false);

  const refresh = React.useCallback(async () => {
    if (!enabled) return;
    if (!loadedRef.current) setLoading(true);
    try {
      const next = await simulatorApi.inventory(workspaceId);
      loadedRef.current = true;
      setInventory(next);
      setError(null);
      setErrorReason(null);
    } catch (err) {
      setErrorReason(parseSimulatorError(err));
      setError(simulatorErrorText(err));
    } finally {
      setLoading(false);
    }
  }, [enabled, workspaceId]);

  React.useEffect(() => {
    if (!enabled) {
      loadedRef.current = false;
      setInventory(null);
      return;
    }
    void refresh();
    return listenSimulatorDevicesChanged(() => {
      void refresh();
    });
  }, [enabled, refresh]);

  const devices = React.useMemo(() => flattenInventory(inventory), [inventory]);

  const runRow = React.useCallback(
    async (device: SimulatorDevice, action: InventoryRowAction, fn: () => Promise<void>) => {
      setRowBusy({ udid: device.udid, action });
      setRowError(null);
      try {
        await fn();
        await refresh();
        return true;
      } catch (err) {
        setRowError({
          udid: device.udid,
          reason: parseSimulatorError(err),
          message: simulatorErrorText(err),
        });
        return false;
      } finally {
        setRowBusy(null);
      }
    },
    [refresh],
  );

  const boot = React.useCallback(
    async (device: SimulatorDevice) => {
      if (!workspaceId) return false;
      return runRow(device, "boot", async () => {
        await simulatorApi.boot(workspaceId, device.udid, device.platform);
      });
    },
    [runRow, workspaceId],
  );

  const shutdown = React.useCallback(
    async (device: SimulatorDevice) => {
      if (!workspaceId) return false;
      return runRow(device, "shutdown", async () => {
        await simulatorApi.shutdown(workspaceId, device.udid, device.platform);
      });
    },
    [runRow, workspaceId],
  );

  const remove = React.useCallback(
    async (device: SimulatorDevice) => {
      if (!workspaceId) return false;
      return runRow(device, "delete", async () => {
        await simulatorApi.delete(workspaceId, device.udid, device.platform);
      });
    },
    [runRow, workspaceId],
  );

  const preview = React.useCallback(
    async (device: SimulatorDevice, start: () => Promise<void>) => {
      return runRow(device, "preview", start);
    },
    [runRow],
  );

  const create = React.useCallback(
    async (input: {
      platform: SimulatorDevice["platform"];
      device_type: string;
      runtime: string;
      name?: string;
    }) => {
      const result = await simulatorApi.create(input);
      setSelectedUdid(result.device.udid);
      void refresh();
      return result.device;
    },
    [refresh],
  );

  return {
    inventory,
    devices,
    loading,
    error,
    errorReason,
    rowBusy,
    rowError,
    selectedUdid,
    setSelectedUdid,
    refresh,
    boot,
    shutdown,
    remove,
    preview,
    create,
  };
}
