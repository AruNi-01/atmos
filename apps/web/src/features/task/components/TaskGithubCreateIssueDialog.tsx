"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Checkbox,
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
  cn,
} from "@workspace/ui";
import { Loader2 } from "lucide-react";
import { wsGithubApi } from "@/api/ws/github-api";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { queryKeys } from "@/api/query/query-keys";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { wsQueryOptions } from "@/api/query/computer-query-options";
import {
  githubRepoAssigneesQueryOptions,
  githubRepoLabelsQueryOptions,
} from "@/features/github/lib/github-query-options";
import { GithubMarkdownField } from "@/features/task/components/GithubMarkdownField";
import type { ProjectGithubRepo } from "@/features/task/hooks/use-project-github-repos";
import {
  composeIssueBodyFromForm,
  defaultFieldValuesForTemplate,
  isFieldValueEmpty,
  parseGithubIssueTemplates,
  type IssueFormField,
  type ParsedIssueTemplate,
} from "@/features/task/lib/github-issue-templates";

export type TaskGithubCreateIssueDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Candidate repos from Atmos projects. */
  repos: ProjectGithubRepo[];
  /** Prefill when opened from a single known repo. */
  initialRepoFullName?: string | null;
  onCreated?: (result: { owner: string; repo: string; number?: number | null; url: string }) => void;
};

type CreateIssueFormValues = {
  title: string;
  /** Dynamic template fields + blank/markdown `description`. */
  fields: Record<string, string | string[] | boolean | undefined>;
  assignees: string[];
  labels: string[];
};

const BLANK_ID = "blank";

function requiredMessage(label: string, tRequired: (values: { field: string }) => string) {
  return tRequired({ field: label });
}

export function TaskGithubCreateIssueDialog({
  open,
  onOpenChange,
  repos,
  initialRepoFullName,
  onCreated,
}: TaskGithubCreateIssueDialogProps) {
  const t = useTranslations("appShell.task.github.createIssue");
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);

  // Step: pick project when multiple / not preselected.
  const [selectedFullName, setSelectedFullName] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState(BLANK_ID);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const selectedRepo = useMemo(() => {
    const key = selectedFullName ?? initialRepoFullName ?? null;
    if (key) {
      return repos.find((r) => r.fullName === key) ?? null;
    }
    // Single linked repo → skip picker; multiple → force explicit choice.
    if (repos.length === 1) return repos[0] ?? null;
    return null;
  }, [initialRepoFullName, repos, selectedFullName]);

  // Reset when dialog opens.
  useEffect(() => {
    if (!open) return;
    setSelectedFullName(initialRepoFullName ?? (repos.length === 1 ? repos[0]?.fullName ?? null : null));
    setTemplateId(BLANK_ID);
    setSubmitError(null);
    setSubmitting(false);
  }, [open, initialRepoFullName, repos]);

  const projectPicked = Boolean(selectedRepo);

  const templatesQuery = useQuery(
    wsQueryOptions({
      scope,
      connectionState,
      queryKey: queryKeys.computer.githubIssueTemplates(
        scope,
        selectedRepo ? `${selectedRepo.owner}/${selectedRepo.repo}` : "",
      ),
      queryFn: () =>
        wsGithubApi.listIssueTemplates({
          owner: selectedRepo!.owner,
          repo: selectedRepo!.repo,
        }),
      enabled: open && projectPicked && Boolean(selectedRepo),
      staleTime: 5 * 60_000,
    }),
  );

  const parsed = useMemo(
    () => parseGithubIssueTemplates(templatesQuery.data?.files ?? []),
    [templatesQuery.data?.files],
  );

  const activeTemplate: ParsedIssueTemplate = useMemo(() => {
    return (
      parsed.templates.find((tpl) => tpl.id === templateId) ??
      parsed.templates[0] ?? {
        id: BLANK_ID,
        filename: "",
        name: t("blank.name"),
        description: t("blank.description"),
        title: "",
        labels: [],
        assignees: [],
        kind: "blank" as const,
      }
    );
  }, [parsed.templates, t, templateId]);

  const assigneesQuery = useQuery(
    githubRepoAssigneesQueryOptions(
      scope,
      connectionState,
      selectedRepo
        ? { owner: selectedRepo.owner, repo: selectedRepo.repo }
        : { owner: "", repo: "" },
      { enabled: open && projectPicked && Boolean(selectedRepo) },
    ),
  );

  const labelsQuery = useQuery(
    githubRepoLabelsQueryOptions(
      scope,
      connectionState,
      selectedRepo
        ? { owner: selectedRepo.owner, repo: selectedRepo.repo }
        : { owner: "", repo: "" },
      { enabled: open && projectPicked && Boolean(selectedRepo) },
    ),
  );

  const form = useForm({
    defaultValues: {
      title: "",
      fields: defaultFieldValuesForTemplate(activeTemplate),
      assignees: [] as string[],
      labels: [] as string[],
    } satisfies CreateIssueFormValues,
    onSubmit: async ({ value }) => {
      if (!selectedRepo) return;
      setSubmitting(true);
      setSubmitError(null);
      try {
        let body = "";
        if (activeTemplate.kind === "form") {
          body = composeIssueBodyFromForm(activeTemplate.formFields ?? [], value.fields);
        } else {
          body = String(value.fields.description ?? "");
        }
        const labels = Array.from(
          new Set([...(activeTemplate.labels ?? []), ...value.labels].map((l) => l.trim()).filter(Boolean)),
        );
        const assignees = Array.from(
          new Set(
            [...(activeTemplate.assignees ?? []), ...value.assignees]
              .map((a) => a.trim())
              .filter(Boolean),
          ),
        );
        const result = await wsGithubApi.createIssue({
          owner: selectedRepo.owner,
          repo: selectedRepo.repo,
          title: value.title.trim(),
          body,
          labels,
          assignees,
        });
        onCreated?.({
          owner: selectedRepo.owner,
          repo: selectedRepo.repo,
          number: result.number,
          url: result.url,
        });
        onOpenChange(false);
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : t("errors.createFailed"));
      } finally {
        setSubmitting(false);
      }
    },
  });

  // When template or repo changes, reseed form defaults (keep dialog open).
  useEffect(() => {
    if (!open || !projectPicked) return;
    form.reset({
      title: activeTemplate.title || "",
      fields: defaultFieldValuesForTemplate(activeTemplate),
      assignees: [...(activeTemplate.assignees ?? [])],
      labels: [...(activeTemplate.labels ?? [])],
    });
    // form identity is stable from useForm; activeTemplate drives reseed.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reseed on template/repo only
  }, [activeTemplate.id, open, projectPicked, selectedRepo?.fullName]);

  const assigneeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of assigneesQuery.data ?? []) {
      if (a.login) set.add(a.login);
    }
    for (const a of activeTemplate.assignees) set.add(a);
    return Array.from(set).sort((x, y) => x.localeCompare(y));
  }, [activeTemplate.assignees, assigneesQuery.data]);

  const labelOptions = useMemo(() => {
    const map = new Map<string, { name: string; color?: string | null }>();
    for (const label of labelsQuery.data ?? []) {
      if (label.name) map.set(label.name, { name: label.name, color: label.color });
    }
    for (const name of activeTemplate.labels) {
      if (!map.has(name)) map.set(name, { name, color: null });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeTemplate.labels, labelsQuery.data]);

  // —— Project picker step ——
  if (open && !projectPicked) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md gap-0 p-0 sm:max-w-md">
          <DialogHeader className="border-b border-border/70 px-4 py-3">
            <DialogTitle className="text-base">{t("projectSelect.title")}</DialogTitle>
            <DialogDescription className="text-xs">{t("projectSelect.description")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto p-2">
            {repos.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                {t("projectSelect.empty")}
              </p>
            ) : (
              <ul className="m-0 list-none space-y-0.5 p-0">
                {repos.map((repo) => (
                  <li key={repo.fullName}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
                      onClick={() => setSelectedFullName(repo.fullName)}
                    >
                      <span className="text-sm font-medium text-foreground">{repo.fullName}</span>
                      <span className="text-[11px] text-muted-foreground">{repo.projectName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter className="border-t border-border/70 px-4 py-3">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t("actions.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const formFields = activeTemplate.formFields ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,840px)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-border/70 px-4 py-3">
          <DialogTitle className="text-base">
            {t("title", { repo: selectedRepo?.fullName ?? "" })}
          </DialogTitle>
          <DialogDescription className="text-xs">{t("description")}</DialogDescription>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
            {/* Template select */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("template.label")}</Label>
              <Select
                value={templateId}
                onValueChange={(v) => {
                  if (v) setTemplateId(v);
                }}
                disabled={templatesQuery.isLoading}
              >
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue placeholder={t("template.placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  {parsed.templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id} className="text-sm">
                      <span className="font-medium">{tpl.name}</span>
                      {tpl.description ? (
                        <span className="ml-1.5 text-muted-foreground">— {tpl.description}</span>
                      ) : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {templatesQuery.isLoading ? (
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  {t("template.loading")}
                </p>
              ) : null}
            </div>

            {/* Title — always required */}
            <form.Field
              name="title"
              validators={{
                onChange: ({ value }) =>
                  !String(value ?? "").trim()
                    ? requiredMessage(t("fields.title"), (p) => t("errors.required", p))
                    : undefined,
                onSubmit: ({ value }) =>
                  !String(value ?? "").trim()
                    ? requiredMessage(t("fields.title"), (p) => t("errors.required", p))
                    : undefined,
              }}
            >
              {(field) => (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium" htmlFor={field.name}>
                    {t("fields.title")}
                    <span className="text-destructive"> *</span>
                  </Label>
                  <Input
                    id={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder={t("fields.titlePlaceholder")}
                    className={cn(
                      "h-9 text-sm",
                      field.state.meta.errors.length > 0 && "border-destructive/60",
                    )}
                    autoFocus
                  />
                  {field.state.meta.errors[0] ? (
                    <p className="text-[11px] text-destructive">{String(field.state.meta.errors[0])}</p>
                  ) : null}
                </div>
              )}
            </form.Field>

            {/* Blank / Markdown: single description field */}
            {(activeTemplate.kind === "blank" || activeTemplate.kind === "markdown") && (
              <form.Field name="fields.description">
                {(field) => (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">{t("fields.description")}</Label>
                    <GithubMarkdownField
                      value={String(field.state.value ?? "")}
                      onChange={(v) => field.handleChange(v)}
                      onBlur={field.handleBlur}
                      placeholder={t("fields.descriptionPlaceholder")}
                      aria-label={t("fields.description")}
                    />
                  </div>
                )}
              </form.Field>
            )}

            {/* YAML issue form fields */}
            {activeTemplate.kind === "form"
              ? formFields.map((templateField) => (
                  <TemplateFormField
                    key={templateField.id}
                    field={templateField}
                    form={form}
                    tRequired={(p) => t("errors.required", p)}
                  />
                ))
              : null}

            {/* Assignees */}
            <form.Field name="assignees">
              {(field) => (
                <MultiToggleGroup
                  label={t("fields.assignees")}
                  options={assigneeOptions.map((login) => ({ value: login, label: login }))}
                  value={(field.state.value as string[]) ?? []}
                  onChange={(next) => field.handleChange(next)}
                  emptyLabel={t("fields.noAssignees")}
                />
              )}
            </form.Field>

            {/* Labels */}
            <form.Field name="labels">
              {(field) => (
                <MultiToggleGroup
                  label={t("fields.labels")}
                  options={labelOptions.map((l) => ({
                    value: l.name,
                    label: l.name,
                    color: l.color,
                  }))}
                  value={(field.state.value as string[]) ?? []}
                  onChange={(next) => field.handleChange(next)}
                  emptyLabel={t("fields.noLabels")}
                />
              )}
            </form.Field>

            {submitError ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {submitError}
              </p>
            ) : null}
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border/70 px-4 py-3 sm:justify-end">
            {repos.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mr-auto"
                onClick={() => {
                  setSelectedFullName(null);
                  setTemplateId(BLANK_ID);
                }}
              >
                {t("actions.changeProject")}
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t("actions.cancel")}
            </Button>
            <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
              {([canSubmit, isSubmitting]) => (
                <Button
                  type="submit"
                  size="sm"
                  disabled={!canSubmit || isSubmitting || submitting || !selectedRepo}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {submitting || isSubmitting ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : null}
                  {t("actions.create")}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TemplateFormField({
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

function MultiToggleGroup({
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
