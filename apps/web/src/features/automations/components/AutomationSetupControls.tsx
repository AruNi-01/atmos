"use client";

import * as React from "react";
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import {
  CalendarClock,
  FolderGit2,
  LoaderCircle,
  PencilLine,
  Timer,
  type LucideIcon,
} from "lucide-react";

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

const AUTOMATION_POPOVER_CONTENT_CLASS =
  "flex overflow-hidden rounded-[1.5rem] border border-border/60 bg-background p-0 shadow-2xl backdrop-blur-md";
const AUTOMATION_POPOVER_BODY_CLASS = "min-h-0 flex-1 overflow-y-auto p-4 sm:p-5";

export function AutomationSetupControls({
  displayName,
  displayNameValid,
  environmentLabel,
  environmentValid,
  triggerLabel,
  triggerValid,
  submitError,
  onDisplayNameChange,
  environmentPickerProps,
  triggerPickerProps,
}: {
  displayName: string;
  displayNameValid: boolean;
  environmentLabel: string;
  environmentValid: boolean;
  triggerLabel: string;
  triggerValid: boolean;
  submitError: string | null;
  onDisplayNameChange: (value: string) => void;
  environmentPickerProps: EnvironmentPickerProps;
  triggerPickerProps: TriggerPickerProps;
}) {
  const [openControl, setOpenControl] = React.useState<"environment" | "trigger" | null>(null);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <Popover
          modal={false}
          open={openControl === "trigger"}
          onOpenChange={(open) => setOpenControl(open ? "trigger" : null)}
        >
          <PopoverTrigger asChild>
            <ControlButton
              icon={CalendarClock}
              label="Trigger"
              value={triggerLabel}
              valid={triggerValid}
            />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="top"
            sideOffset={8}
            collisionPadding={16}
            className={cn(
              AUTOMATION_POPOVER_CONTENT_CLASS,
              "w-[min(calc(100vw-2rem),30rem)]",
            )}
            style={{ maxHeight: "var(--radix-popover-content-available-height)" }}
          >
            <div className={AUTOMATION_POPOVER_BODY_CLASS}>
              <AutomationTriggerPicker {...triggerPickerProps} surface="plain" />
            </div>
          </PopoverContent>
        </Popover>

        <NameInlineControl
          value={displayName}
          valid={displayNameValid}
          onChange={onDisplayNameChange}
        />

        <Popover
          modal={false}
          open={openControl === "environment"}
          onOpenChange={(open) => setOpenControl(open ? "environment" : null)}
        >
          <PopoverTrigger asChild>
            <ControlButton
              icon={FolderGit2}
              label="Environment"
              value={environmentLabel}
              valid={environmentValid}
            />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="top"
            sideOffset={8}
            collisionPadding={16}
            className={cn(
              AUTOMATION_POPOVER_CONTENT_CLASS,
              "w-[min(calc(100vw-2rem),36rem)]",
            )}
            style={{ maxHeight: "var(--radix-popover-content-available-height)" }}
          >
            <div className={AUTOMATION_POPOVER_BODY_CLASS}>
              <AutomationEnvironmentPicker {...environmentPickerProps} surface="plain" />
            </div>
          </PopoverContent>
        </Popover>

        {submitError ? (
          <div className="w-full rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive md:basis-full">
            {submitError}
          </div>
        ) : null}
      </div>
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
  return (
    <div className="flex justify-end">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="submit"
            size="icon"
            className="size-9 shrink-0 rounded-md"
            disabled={disabledSubmit}
            aria-label={
              isSubmitting
                ? "Saving automation"
                : mode === "create"
                  ? "Create automation"
                  : "Update automation"
            }
          >
            {isSubmitting ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Timer className="size-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {mode === "create" ? "Create Automation" : "Update Automation"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function NameInlineControl({
  value,
  valid,
  onChange,
}: {
  value: string;
  valid: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className={cn(
        "inline-flex h-9 max-w-full items-center gap-2 rounded-md border border-border/60 bg-background/25 px-3 text-sm text-muted-foreground backdrop-blur-sm transition-colors focus-within:border-border focus-within:bg-background/45",
        !valid && "border-dashed border-destructive/45 text-destructive/90",
      )}
    >
      <PencilLine className="size-3.5 shrink-0" />
      <label
        htmlFor="automation-display-name"
        className="shrink-0 font-medium text-foreground/88"
      >
        Name
      </label>
      <Input
        id="automation-display-name"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
          }
        }}
        placeholder="Daily repo health"
        maxLength={80}
        className="h-7 !w-[8rem] min-w-0 flex-none rounded-none border-0 !bg-transparent px-1.5 py-0 text-sm text-foreground shadow-none placeholder:text-muted-foreground/70 focus-visible:border-transparent focus-visible:ring-0 dark:!bg-transparent sm:!w-[9rem]"
      />
    </div>
  );
}

const ControlButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string;
  value: string;
  valid: boolean;
}>(
  function ControlButton({
    icon: Icon,
    label,
    value,
    valid,
    className,
    ...props
  }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        {...props}
        className={cn(
          "inline-flex h-9 max-w-full items-center gap-2 rounded-md border border-border/60 bg-background/25 px-3 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-muted",
          !valid && "border-dashed border-destructive/45 text-destructive/90",
          className,
        )}
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="font-medium text-foreground/88">{label}</span>
        <span className="max-w-[18rem] truncate" title={value}>
          {value}
        </span>
      </button>
    );
  },
);
