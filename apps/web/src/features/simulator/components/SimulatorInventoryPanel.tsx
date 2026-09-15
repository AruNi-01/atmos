"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button, ScrollArea, cn } from "@workspace/ui";
import type { SimulatorDevice } from "@atmos/api-types/ws/dto/simulator";
import { SimulatorPlatformIcon } from "./SimulatorTabIcon";
import { SimulatorCreateDeviceDialog } from "./SimulatorCreateDeviceDialog";
import type { useSimulatorInventory } from "../hooks/use-simulator-inventory";
import { bootStateKey, devicePower } from "../lib/simulator-inventory";

type Inventory = ReturnType<typeof useSimulatorInventory>;

export function SimulatorInventoryPanel({
  workspaceId,
  inventory,
  collapsed,
  onCollapsedChange,
  actionsEnabled,
  claimedUdid,
  onPreview,
  onReleasedClaim,
}: {
  workspaceId: string | null;
  inventory: Inventory;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  actionsEnabled: boolean;
  claimedUdid: string | null;
  onPreview: (device: SimulatorDevice) => Promise<void>;
  onReleasedClaim: (device: SimulatorDevice) => void;
}) {
  const t = useTranslations("features.simulator");
  const [createOpen, setCreateOpen] = React.useState(false);

  if (collapsed) {
    return (
      <div className="flex h-full w-9 shrink-0 flex-col items-center border-r border-border py-2">
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={t("inventory.expand")}
          onClick={() => onCollapsedChange(false)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      data-atmos-simulator-inventory=""
      className="flex h-full w-64 shrink-0 flex-col border-r border-border"
    >
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{t("inventory.title")}</h2>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={!actionsEnabled}
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-3.5" />
          {t("actions.addDevice")}
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={t("inventory.collapse")}
          onClick={() => onCollapsedChange(true)}
        >
          <ChevronLeft className="size-4" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 p-2">
          {inventory.loading && inventory.devices.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">{t("checking")}</p>
          ) : null}
          {inventory.errorReason || inventory.error ? (
            <p className="px-1 text-xs text-destructive">
              {inventory.errorReason
                ? t(`reasons.${inventory.errorReason}.title`)
                : inventory.error}
            </p>
          ) : null}
          {!inventory.loading && inventory.devices.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">{t("inventory.empty")}</p>
          ) : null}
          {inventory.devices.map((device) => (
            <InventoryRow
              key={`${device.platform}:${device.udid}`}
              device={device}
              workspaceId={workspaceId}
              selected={inventory.selectedUdid === device.udid}
              claimedUdid={claimedUdid}
              actionsEnabled={actionsEnabled}
              busy={inventory.rowBusy}
              error={inventory.rowError}
              onSelect={() => inventory.setSelectedUdid(device.udid)}
              onBoot={() => void inventory.boot(device)}
              onShutdown={() => {
                void (async () => {
                  const ok = await inventory.shutdown(device);
                  if (ok && claimedUdid === device.udid) onReleasedClaim(device);
                })();
              }}
              onDelete={() => {
                void (async () => {
                  const ok = await inventory.remove(device);
                  if (ok && claimedUdid === device.udid) onReleasedClaim(device);
                })();
              }}
              onPreview={() => {
                inventory.setSelectedUdid(device.udid);
                void inventory.preview(device, async () => {
                  await onPreview(device);
                });
              }}
            />
          ))}
        </div>
      </ScrollArea>
      <SimulatorCreateDeviceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        inventory={inventory.inventory}
        onCreate={inventory.create}
      />
    </div>
  );
}

function InventoryRow({
  device,
  workspaceId,
  selected,
  claimedUdid,
  actionsEnabled,
  busy,
  error,
  onSelect,
  onBoot,
  onShutdown,
  onDelete,
  onPreview,
}: {
  device: SimulatorDevice;
  workspaceId: string | null;
  selected: boolean;
  claimedUdid: string | null;
  actionsEnabled: boolean;
  busy: { udid: string; action: string } | null;
  error: { udid: string; reason: string | null; message: string } | null;
  onSelect: () => void;
  onBoot: () => void;
  onShutdown: () => void;
  onDelete: () => void;
  onPreview: () => void;
}) {
  const t = useTranslations("features.simulator");
  const power = devicePower(device.state);
  const foreign =
    Boolean(device.claimed_by_workspace) &&
    device.claimed_by_workspace !== workspaceId;
  const ours = device.claimed_by_workspace === workspaceId;
  const rowBusy = busy?.udid === device.udid;
  const actionBusy = (action: string) => rowBusy && busy?.action === action;
  const disableAll = !actionsEnabled || !workspaceId || rowBusy || foreign;
  const showError = error?.udid === device.udid;

  return (
    <div
      className={cn(
        "rounded-lg border border-transparent px-2 py-1.5",
        selected && "border-border bg-accent/60",
        rowBusy && "opacity-70",
      )}
    >
      <button
        type="button"
        className="flex w-full min-w-0 items-start gap-2 text-left"
        onClick={onSelect}
      >
        <SimulatorPlatformIcon platform={device.platform} className="mt-0.5 size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-foreground">{device.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {device.platform === "ios" ? t("platformIos") : t("platformAndroid")}
            {" · "}
            {t(`inventory.${bootStateKey(device.state)}`)}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {ours
              ? t("inventory.claimedThis")
              : foreign
                ? t("inventory.claimedOther")
                : t("inventory.unclaimed")}
          </span>
        </span>
      </button>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {power === "off" ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            loading={actionBusy("boot")}
            disabled={disableAll}
            onClick={onBoot}
          >
            {t("actions.boot")}
          </Button>
        ) : null}
        {power === "on" ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            loading={actionBusy("shutdown")}
            disabled={disableAll}
            onClick={onShutdown}
          >
            {t("actions.shutdown")}
          </Button>
        ) : null}
        <Button
          type="button"
          size="xs"
          variant="outline"
          loading={actionBusy("preview")}
          disabled={disableAll || claimedUdid === device.udid}
          onClick={onPreview}
        >
          {t("actions.preview")}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          loading={actionBusy("delete")}
          disabled={disableAll}
          onClick={onDelete}
        >
          {t("actions.delete")}
        </Button>
      </div>
      {showError ? (
        <p className="mt-1 text-xs text-destructive">
          {error.reason ? t(`reasons.${error.reason}.title`) : error.message}
        </p>
      ) : null}
    </div>
  );
}
