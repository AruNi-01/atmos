import React, { useState } from "react";
import { Check, Languages, LoaderCircle, Save } from "lucide-react";
import {
  Button,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@workspace/ui";

import {
  FEATURE_LANGUAGE_OPTIONS,
  featureSelectValue,
  languageButtonLabel,
  normalizeFeatureLanguage,
  resolveFeatureLanguagePreset,
  type SaveState,
} from "@/app-shell/llm-providers-modal-utils";

export function FeatureSelect({
  label,
  value,
  providerOptions,
  noneLabel,
  action,
  onChange,
}: {
  label: string;
  value?: string | null;
  providerOptions: Array<{ value: string; label: string }>;
  noneLabel: string;
  action?: React.ReactNode;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        {action}
      </div>
      <Select
        value={featureSelectValue(value)}
        onValueChange={(next) => onChange(next === "__none__" ? null : next)}
      >
        <SelectTrigger>
          <SelectValue placeholder={noneLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">{noneLabel}</SelectItem>
          {providerOptions.map((provider) => (
            <SelectItem key={provider.value} value={provider.value}>
              {provider.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function FeatureLanguageAction({
  value,
  onChange,
}: {
  value?: string | null;
  onChange: (value: string | null) => void;
}) {
  const preset = resolveFeatureLanguagePreset(value);
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState(preset);
  const [customValue, setCustomValue] = useState(
    preset === "other" ? normalizeFeatureLanguage(value) ?? "" : "",
  );

  const applySelection = (nextSelection: string, nextCustomValue?: string) => {
    if (!nextSelection) {
      onChange(null);
      return;
    }

    if (nextSelection === "other") {
      const customLanguage = (nextCustomValue ?? customValue).trim();
      onChange(customLanguage || null);
      return;
    }

    const option = FEATURE_LANGUAGE_OPTIONS.find(
      (item) => item.value === nextSelection,
    );
    onChange(option?.label ?? null);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          const nextPreset = resolveFeatureLanguagePreset(value);
          setSelection(nextPreset);
          setCustomValue(
            nextPreset === "other"
              ? normalizeFeatureLanguage(value) ?? ""
              : "",
          );
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-7 w-7",
            normalizeFeatureLanguage(value) && "text-primary",
          )}
          title={languageButtonLabel(value)}
          aria-label={languageButtonLabel(value)}
        >
          <Languages className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-72 space-y-3 p-4"
      >
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Output language</p>
          <p className="text-xs text-muted-foreground">
            Force this feature to respond in a specific language.
          </p>
        </div>

        <Select
          value={selection || "__none__"}
          onValueChange={(next) => {
            const normalized = next === "__none__" ? "" : next;
            setSelection(normalized);
            if (normalized && normalized !== "other") {
              applySelection(normalized);
            }
            if (!normalized) {
              applySelection("");
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Use prompt default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Use prompt default</SelectItem>
            {FEATURE_LANGUAGE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
            <SelectItem value="other">Other (custom)</SelectItem>
          </SelectContent>
        </Select>

        {selection === "other" && (
          <Input
            value={customValue}
            placeholder="e.g. 简体中文"
            onChange={(event) => {
              const nextCustomValue = event.target.value;
              setCustomValue(nextCustomValue);
              applySelection("other", nextCustomValue);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

export function SaveStateButton({
  state,
  idleLabel,
  savingLabel,
  savedLabel,
  measureLabel,
  variant,
  disabled,
  onClick,
}: {
  state: SaveState;
  idleLabel: string;
  savingLabel: string;
  savedLabel: string;
  measureLabel: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  disabled?: boolean;
  onClick: () => void;
}) {
  const states = [
    {
      key: "idle" as const,
      label: idleLabel,
      icon: <Save className="size-4" />,
      className: "opacity-100 translate-y-0 scale-100",
    },
    {
      key: "saving" as const,
      label: savingLabel,
      icon: <LoaderCircle className="size-4 animate-spin" />,
      className: "opacity-100 translate-y-0 scale-100",
    },
    {
      key: "saved" as const,
      label: savedLabel,
      icon: <Check className="size-4" />,
      className: "opacity-100 translate-y-0 scale-100",
    },
  ];

  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      variant={variant}
      className={cn(
        "relative justify-center overflow-hidden transition-[background-color,border-color,color,box-shadow] duration-300",
        state === "saved" &&
          !variant &&
          "bg-emerald-600 text-white hover:bg-emerald-600",
        state === "saved" &&
          variant === "outline" &&
          "border-emerald-500/50 bg-emerald-500/12 text-emerald-200 hover:bg-emerald-500/12",
      )}
    >
      <span className="pointer-events-none invisible inline-flex items-center gap-2">
        <Save className="size-4" />
        {measureLabel}
      </span>

      {states.map((item) => {
        const active = state === item.key;
        return (
          <span
            key={item.key}
            className={cn(
              "pointer-events-none absolute inset-0 inline-flex items-center justify-center gap-2 transition-all duration-250",
              active ? item.className : "translate-y-1 scale-95 opacity-0",
            )}
          >
            {item.icon}
            {item.label}
          </span>
        );
      })}
    </Button>
  );
}

export function Field({
  label,
  labelAccessory,
  className,
  description,
  error = false,
  children,
}: {
  label: string;
  labelAccessory?: React.ReactNode;
  className?: string;
  description?: string;
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <Label
          className={cn(
            "text-xs font-semibold text-muted-foreground",
            error && "text-destructive",
          )}
        >
          {label}
        </Label>
        {labelAccessory}
      </div>
      {children}
      {description ? (
        <p
          className={cn(
            "text-xs text-muted-foreground",
            error && "text-destructive",
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
