"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui";
import type {
  SimulatorDevicePlatform,
  SimulatorInventory,
} from "@atmos/api-types/ws/dto/simulator";
import {
  parseSimulatorError,
  simulatorErrorText,
  type SimulatorChromeReason,
} from "../lib/simulator-errors";
import { isAndroidAvdName } from "../lib/simulator-inventory";

export function SimulatorCreateDeviceDialog({
  open,
  onOpenChange,
  inventory,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inventory: SimulatorInventory | null;
  onCreate: (input: {
    platform: SimulatorDevicePlatform;
    device_type: string;
    runtime: string;
    name?: string;
  }) => Promise<unknown>;
}) {
  const t = useTranslations("features.simulator");
  const [platform, setPlatform] = React.useState<SimulatorDevicePlatform>("ios");
  const [runtimeId, setRuntimeId] = React.useState("");
  const [deviceTypeId, setDeviceTypeId] = React.useState("");
  const [name, setName] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [errorReason, setErrorReason] = React.useState<SimulatorChromeReason | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setPlatform("ios");
    setRuntimeId("");
    setDeviceTypeId("");
    setName("");
    setSubmitting(false);
    setError(null);
    setErrorReason(null);
  }, [open]);

  const runtimes = platform === "ios" ? inventory?.ios.runtimes ?? [] : inventory?.android.runtimes ?? [];
  const selectedRuntime = runtimes.find((runtime) => runtime.id === runtimeId) ?? null;
  const deviceTypes =
    platform === "ios"
      ? selectedRuntime?.supported_device_types ?? []
      : inventory?.android.device_types ?? [];

  const trimmedName = name.trim();
  const androidNameInvalid =
    platform === "android" && trimmedName.length > 0 && !isAndroidAvdName(trimmedName);
  const canSubmit =
    Boolean(runtimeId && deviceTypeId) && !androidNameInvalid && !submitting;

  const onSubmit = React.useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setErrorReason(null);
    try {
      await onCreate({
        platform,
        device_type: deviceTypeId,
        runtime: runtimeId,
        name: trimmedName ? trimmedName : undefined,
      });
      onOpenChange(false);
    } catch (err) {
      setErrorReason(parseSimulatorError(err));
      setError(simulatorErrorText(err));
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, deviceTypeId, onCreate, onOpenChange, platform, runtimeId, trimmedName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("createDialog.title")}</DialogTitle>
          <DialogDescription>{t("createDialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>{t("createDialog.platform")}</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={platform}
              onValueChange={(next) => {
                if (next !== "ios" && next !== "android") return;
                setPlatform(next);
                setRuntimeId("");
                setDeviceTypeId("");
              }}
            >
              <ToggleGroupItem value="ios">{t("platformIos")}</ToggleGroupItem>
              <ToggleGroupItem value="android">{t("platformAndroid")}</ToggleGroupItem>
            </ToggleGroup>
          </div>

          {platform === "ios" ? (
            <>
              <FieldSelect
                label={t("createDialog.runtime")}
                placeholder={t("createDialog.runtime")}
                value={runtimeId}
                onChange={(next) => {
                  setRuntimeId(next);
                  setDeviceTypeId("");
                }}
                options={runtimes.map((runtime) => ({ id: runtime.id, name: runtime.name }))}
                empty={t("createDialog.missingRuntime")}
              />
              <FieldSelect
                label={t("createDialog.deviceType")}
                placeholder={t("createDialog.deviceType")}
                value={deviceTypeId}
                onChange={setDeviceTypeId}
                options={deviceTypes.map((type) => ({ id: type.id, name: type.name }))}
                empty={runtimeId ? t("createDialog.missingType") : t("createDialog.deviceType")}
                disabled={!runtimeId}
              />
            </>
          ) : (
            <>
              <FieldSelect
                label={t("createDialog.profile")}
                placeholder={t("createDialog.profile")}
                value={deviceTypeId}
                onChange={setDeviceTypeId}
                options={deviceTypes.map((type) => ({ id: type.id, name: type.name }))}
                empty={t("createDialog.missingType")}
              />
              <FieldSelect
                label={t("createDialog.systemImage")}
                placeholder={t("createDialog.systemImage")}
                value={runtimeId}
                onChange={setRuntimeId}
                options={runtimes.map((runtime) => ({ id: runtime.id, name: runtime.name }))}
                empty={t("createDialog.missingImage")}
              />
            </>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="simulator-device-name">
              {t("createDialog.name")}{" "}
              <span className="font-normal text-muted-foreground">
                ({t("createDialog.nameOptional")})
              </span>
            </Label>
            <Input
              id="simulator-device-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
            />
            {platform === "android" ? (
              <p className="text-xs text-muted-foreground">{t("createDialog.androidNameHint")}</p>
            ) : null}
            {androidNameInvalid ? (
              <p className="text-xs text-destructive">{t("createDialog.androidNameInvalid")}</p>
            ) : null}
          </div>

          {errorReason || error ? (
            <p className="text-sm text-destructive">
              {errorReason ? t(`reasons.${errorReason}.body`) : error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("actions.cancel")}
          </Button>
          <Button type="button" loading={submitting} disabled={!canSubmit} onClick={() => void onSubmit()}>
            {t("createDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldSelect({
  label,
  placeholder,
  value,
  onChange,
  options,
  empty,
  disabled,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; name: string }>;
  empty: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <Select
          value={value || undefined}
          onValueChange={onChange}
          disabled={disabled}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
