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
import {
  MultiToggleGroup,
  TemplateFormField,
  requiredMessage,
} from "@/features/task/components/TaskGithubTemplateFormFields";
import type { ProjectGithubRepo } from "@/features/task/hooks/use-project-github-repos";
import {
  composeIssueBodyFromForm,
  defaultFieldValuesForTemplate,
  isFieldValueEmpty,
  parseGithubIssueTemplates,
  type IssueFormField,
  type ParsedIssueTemplate,
} from "@/features/task/lib/github-issue-templates";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";

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
    () =>
      parseGithubIssueTemplates(
        templatesQuery.data?.files ?? [],
        templatesQuery.data?.security_policy,
      ),
    [templatesQuery.data?.files, templatesQuery.data?.security_policy],
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

  const isSecurityTemplate = activeTemplate.kind === "security";
  const isContactTemplate = activeTemplate.kind === "contact";
  const isExternalTemplate = isSecurityTemplate || isContactTemplate;

  // Keep selection valid when templates reload (e.g. repo switch / missing SECURITY.md).
  useEffect(() => {
    if (!open || !projectPicked) return;
    if (templatesQuery.isLoading || templatesQuery.isFetching) return;
    if (parsed.templates.length === 0) return;
    if (!parsed.templates.some((tpl) => tpl.id === templateId)) {
      setTemplateId(parsed.templates[0]?.id ?? BLANK_ID);
    }
  }, [
    open,
    parsed.templates,
    projectPicked,
    templateId,
    templatesQuery.isFetching,
    templatesQuery.isLoading,
  ]);

  const externalLinkUrl = useMemo(() => {
    if (isContactTemplate) {
      return activeTemplate.htmlUrl?.trim() || null;
    }
    if (!isSecurityTemplate) return null;
    if (activeTemplate.htmlUrl) return activeTemplate.htmlUrl;
    if (!selectedRepo) return null;
    return `https://github.com/${selectedRepo.owner}/${selectedRepo.repo}/security/policy`;
  }, [
    activeTemplate.htmlUrl,
    isContactTemplate,
    isSecurityTemplate,
    selectedRepo,
  ]);

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
      // Security / contact links are not issue create paths.
      if (activeTemplate.kind === "security" || activeTemplate.kind === "contact") return;
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
                  if (!v) return;
                  setTemplateId(v);
                  // contact_links are pure outbound links — open immediately (GitHub chooser behavior).
                  const selected = parsed.templates.find((tpl) => tpl.id === v);
                  if (selected?.kind === "contact" && selected.htmlUrl?.trim()) {
                    window.open(selected.htmlUrl, "_blank", "noopener,noreferrer");
                  }
                }}
                disabled={templatesQuery.isLoading}
              >
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue placeholder={t("template.placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  {parsed.templates.map((tpl) => {
                    const name =
                      tpl.kind === "blank"
                        ? t("blank.name")
                        : tpl.kind === "security"
                          ? t("security.name")
                          : tpl.name;
                    const description =
                      tpl.kind === "blank"
                        ? parsed.config.blankIssuesEnabled
                          ? t("blank.description")
                          : t("blank.descriptionMaintainers")
                        : tpl.kind === "security"
                          ? t("security.description")
                          : tpl.description;
                    return (
                      <SelectItem key={tpl.id} value={tpl.id} className="text-sm">
                        <span className="font-medium">{name}</span>
                        {description ? (
                          <span className="ml-1.5 text-muted-foreground">— {description}</span>
                        ) : null}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {templatesQuery.isLoading ? (
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  {t("template.loading")}
                </p>
              ) : null}
            </div>

            {isSecurityTemplate ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-medium">{t("security.previewLabel")}</Label>
                  {activeTemplate.filename ? (
                    <span className="truncate text-[11px] text-muted-foreground">
                      {activeTemplate.filename}
                    </span>
                  ) : null}
                </div>
                <div className="max-h-[min(52vh,560px)] overflow-y-auto rounded-md border border-border/60 bg-muted/15 px-3 py-3">
                  <MarkdownRenderer className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed">
                    {activeTemplate.bodyMarkdown?.trim() || t("security.empty")}
                  </MarkdownRenderer>
                </div>
              </div>
            ) : isContactTemplate ? (
              <div className="space-y-3 rounded-md border border-border/60 bg-muted/15 px-4 py-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{activeTemplate.name}</p>
                  {activeTemplate.description ? (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {activeTemplate.description}
                    </p>
                  ) : null}
                </div>
                {externalLinkUrl ? (
                  <a
                    href={externalLinkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full break-all text-xs text-primary underline-offset-2 hover:underline"
                  >
                    {externalLinkUrl}
                  </a>
                ) : null}
                <p className="text-[11px] text-muted-foreground">{t("contact.hint")}</p>
              </div>
            ) : (
              <>
                {/* Title — always required for real issue creates */}
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
                        <p className="text-[11px] text-destructive">
                          {String(field.state.meta.errors[0])}
                        </p>
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
              </>
            )}

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
            {isExternalTemplate ? (
              externalLinkUrl ? (
                <Button
                  type="button"
                  size="sm"
                  asChild
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <a href={externalLinkUrl} target="_blank" rel="noopener noreferrer">
                    {isContactTemplate ? t("contact.openLink") : t("security.openOnGithub")}
                  </a>
                </Button>
              ) : null
            ) : (
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
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

