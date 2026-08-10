"use client";

import React from "react";
import {
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@workspace/ui";
import { GithubMarkdownField } from "@/features/task/components/GithubMarkdownField";
import {
  isFieldValueEmpty,
  type IssueFormField,
} from "@/features/task/lib/github-issue-templates";

export function requiredMessage(label: string, tRequired: (values: { field: string }) => string) {
  return tRequired({ field: label });
}

export function TemplateFormField({
  field,
  form,
  tRequired,
}: {
  field: IssueFormField;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tanstack form instance is deeply generic
  form: any;
  tRequired: (values: { field: string }) => string;
}) {
  if (field.type === "markdown") {
    return (
      <div className="prose prose-sm max-w-none rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-[13px] text-muted-foreground dark:prose-invert">
        {/* Static markdown from template — not an input */}
        <pre className="m-0 whitespace-pre-wrap font-sans text-[13px]">{field.value}</pre>
      </div>
    );
  }

  const label = field.label || field.id;

  const validators = {
    onChange: ({ value }: { value: string | string[] | boolean | undefined }) => {
      if (!field.required && field.type !== "checkboxes") return undefined;
      if (isFieldValueEmpty(field, value)) {
        return requiredMessage(label, tRequired);
      }
      return undefined;
    },
    onSubmit: ({ value }: { value: string | string[] | boolean | undefined }) => {
      if (isFieldValueEmpty(field, value) && (field.required || field.type === "checkboxes")) {
        // checkboxes always run isFieldValueEmpty (handles option-level required)
        if (field.type === "checkboxes" || field.required) {
          return requiredMessage(label, tRequired);
        }
      }
      return undefined;
    },
  };

  // Dynamic nested field API is loosely typed (template ids are runtime strings).
  type AnyFieldApi = {
    state: {
      value: unknown;
      meta: { errors: unknown[] };
    };
    handleBlur: () => void;
    handleChange: (value: unknown) => void;
  };

  if (field.type === "textarea") {
    return (
      <form.Field name={`fields.${field.id}` as never} validators={validators as never}>
        {(f: AnyFieldApi) => {
          const value = String(f.state.value ?? "");
          const errors = f.state.meta.errors;
          return (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                {label}
                {field.required ? <span className="text-destructive"> *</span> : null}
              </Label>
              {field.description ? (
                <p className="text-[11px] text-muted-foreground">{field.description}</p>
              ) : null}
              <GithubMarkdownField
                value={value}
                onChange={(v) => f.handleChange(v)}
                onBlur={f.handleBlur}
                placeholder={field.placeholder}
                aria-label={label}
                error={errors[0] ? String(errors[0]) : null}
              />
            </div>
          );
        }}
      </form.Field>
    );
  }

  if (field.type === "input") {
    return (
      <form.Field
        name={`fields.${field.id}` as never}
        validators={validators as never}
      >
        {(f: AnyFieldApi) => (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              {label}
              {field.required ? <span className="text-destructive"> *</span> : null}
            </Label>
            {field.description ? (
              <p className="text-[11px] text-muted-foreground">{field.description}</p>
            ) : null}
            <Input
              value={String(f.state.value ?? "")}
              onBlur={f.handleBlur}
              onChange={(e) => f.handleChange(e.target.value)}
              placeholder={field.placeholder}
              className={cn(
                "h-9 text-sm",
                f.state.meta.errors.length > 0 && "border-destructive/60",
              )}
            />
            {f.state.meta.errors[0] ? (
              <p className="text-[11px] text-destructive">{String(f.state.meta.errors[0])}</p>
            ) : null}
          </div>
        )}
      </form.Field>
    );
  }

  if (field.type === "dropdown") {
    const options = field.options ?? [];
    return (
      <form.Field name={`fields.${field.id}` as never} validators={validators as never}>
        {(f: AnyFieldApi) => (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              {label}
              {field.required ? <span className="text-destructive"> *</span> : null}
            </Label>
            {field.description ? (
              <p className="text-[11px] text-muted-foreground">{field.description}</p>
            ) : null}
            {field.multiple ? (
              <MultiToggleGroup
                label=""
                hideLabel
                options={options.map((o) => ({ value: o, label: o }))}
                value={Array.isArray(f.state.value) ? (f.state.value as string[]) : []}
                onChange={(next) => f.handleChange(next)}
                emptyLabel="—"
              />
            ) : (
              <Select
                value={String(f.state.value ?? "") || undefined}
                onValueChange={(v) => f.handleChange(v ?? "")}
              >
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue placeholder={field.placeholder || label} />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o} value={o} className="text-sm">
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {f.state.meta.errors[0] ? (
              <p className="text-[11px] text-destructive">{String(f.state.meta.errors[0])}</p>
            ) : null}
          </div>
        )}
      </form.Field>
    );
  }

  // checkboxes
  const opts = field.checkboxOptions ?? [];
  return (
    <form.Field name={`fields.${field.id}` as never} validators={validators as never}>
      {(f: AnyFieldApi) => {
        const selected = Array.isArray(f.state.value) ? (f.state.value as string[]) : [];
        return (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              {label}
              {field.required ? <span className="text-destructive"> *</span> : null}
            </Label>
            {field.description ? (
              <p className="text-[11px] text-muted-foreground">{field.description}</p>
            ) : null}
            <div className="space-y-1.5 rounded-md border border-border/60 p-2.5">
              {opts.map((opt) => {
                const checked = selected.includes(opt.label);
                return (
                  <label
                    key={opt.label}
                    className="flex cursor-pointer items-start gap-2 text-xs leading-snug"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => {
                        const on = Boolean(next);
                        const set = new Set(selected);
                        if (on) set.add(opt.label);
                        else set.delete(opt.label);
                        f.handleChange(Array.from(set));
                      }}
                      className="mt-0.5"
                    />
                    <span>
                      {opt.label}
                      {opt.required ? <span className="text-destructive"> *</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>
            {f.state.meta.errors[0] ? (
              <p className="text-[11px] text-destructive">{String(f.state.meta.errors[0])}</p>
            ) : null}
          </div>
        );
      }}
    </form.Field>
  );
}

export function MultiToggleGroup({
  label,
  hideLabel,
  options,
  value,
  onChange,
  emptyLabel,
}: {
  label: string;
  hideLabel?: boolean;
  options: Array<{ value: string; label: string; color?: string | null }>;
  value: string[];
  onChange: (next: string[]) => void;
  emptyLabel: string;
}) {
  const selected = new Set(value);
  return (
    <div className="space-y-1.5">
      {!hideLabel && label ? (
        <Label className="text-xs font-medium">{label}</Label>
      ) : null}
      {options.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
          {options.map((opt) => {
            const on = selected.has(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  const next = new Set(selected);
                  if (on) next.delete(opt.value);
                  else next.add(opt.value);
                  onChange(Array.from(next));
                }}
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                  on
                    ? "border-foreground/30 bg-muted text-foreground"
                    : "border-border/70 text-muted-foreground hover:bg-muted/50",
                )}
                style={
                  opt.color
                    ? {
                        borderColor: on ? `#${opt.color.replace(/^#/, "")}` : undefined,
                        color: on ? `#${opt.color.replace(/^#/, "")}` : undefined,
                      }
                    : undefined
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
