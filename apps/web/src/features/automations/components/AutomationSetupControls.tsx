"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Input,
  Label,
} from "@workspace/ui";
import { LoaderCircle, PencilLine } from "lucide-react";

import { AutomationEnvironmentPicker } from "@/features/automations/components/AutomationEnvironmentPicker";
import { AutomationTriggerPicker } from "@/features/automations/components/AutomationTriggerPicker";

type EnvironmentPickerProps = Omit<
  React.ComponentProps<typeof AutomationEnvironmentPicker>,
  "surface"
>;
type TriggerPickerProps = Omit<
  React.ComponentProps<typeof AutomationTriggerPicker>,
  "surface"
>;

export function AutomationSetupControls({
  displayName,
  submitError,
  onDisplayNameChange,
  environmentPickerProps,
  triggerPickerProps,
}: {
  displayName: string;
  submitError: string | null;
  onDisplayNameChange: (value: string) => void;
  environmentPickerProps: EnvironmentPickerProps;
  triggerPickerProps: TriggerPickerProps;
}) {
  const t = useTranslations("automation.setupControls");

  return (
    <div className="flex flex-col gap-8">
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <PencilLine className="size-4 text-muted-foreground" />
          <Label htmlFor="automation-display-name" className="text-sm font-semibold text-foreground">
            {t("name.label")}
          </Label>
        </div>
        <Input
          id="automation-display-name"
          value={displayName}
          onChange={(event) => onDisplayNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
            }
          }}
          placeholder={t("name.placeholder")}
          maxLength={80}
          className="h-10"
        />
      </section>

      <AutomationEnvironmentPicker {...environmentPickerProps} surface="plain" />
      <AutomationTriggerPicker {...triggerPickerProps} surface="plain" />

      {submitError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {submitError}
        </div>
      ) : null}
    </div>
  );
}

export function AutomationSetupSubmitButton({
  mode,
  disabledSubmit,
  isSubmitting,
}: {
  mode: "create" | "edit";
  disabledSubmit: boolean;
  isSubmitting: boolean;
}) {
  const t = useTranslations("automation.setupControls");
  return (
    <Button type="submit" disabled={disabledSubmit}>
      {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
      {isSubmitting
        ? t("submit.saving")
        : mode === "create"
          ? t("submit.create")
          : t("submit.update")}
    </Button>
  );
}
