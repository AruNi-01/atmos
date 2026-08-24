"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@workspace/ui";
import {
  CheckCircle2,
  CircleDot,
  Computer,
  ExternalLink,
  Eye,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  Github,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Workflow,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import type { GithubInstallation, GithubRepository } from "@/features/automations/lib/github-trigger-relay";
import type { GithubEventFamily, GithubInt64 } from "@/features/automations/types";

const EVENT_OPTIONS: Array<{
  value: GithubEventFamily;
  Icon: LucideIcon;
}> = [
  { value: "pull_request", Icon: GitPullRequest },
  { value: "issues", Icon: CircleDot },
  { value: "pull_request_comment", Icon: MessageSquare },
  { value: "push", Icon: GitBranch },
  { value: "workflow_run", Icon: Workflow },
];

const PR_ACTIONS = [
  { value: "opened", Icon: GitPullRequest },
  { value: "reopened", Icon: RotateCcw },
  { value: "ready_for_review", Icon: Eye },
  { value: "closed", Icon: GitPullRequestClosed },
  { value: "merged", Icon: GitMerge },
];

const ISSUE_ACTIONS = [
  { value: "labeled", Icon: CircleDot },
  { value: "opened", Icon: GitPullRequest },
  { value: "reopened", Icon: RotateCcw },
  { value: "closed", Icon: XCircle },
];

const WORKFLOW_CONCLUSIONS = [
  { value: "any", Icon: CircleDot },
  { value: "success", Icon: CheckCircle2 },
  { value: "failure", Icon: XCircle },
  { value: "cancelled", Icon: XCircle },
];

export function AutomationGithubTriggerPanel({
  relayReady,
  setupMessage,
  installations,
  repositories,
  loading,
  repositoriesLoading,
  error,
  setupRefreshAvailable,
  selectedInstallationId,
  selectedRepositoryFullName,
  eventFamily,
  issueAction,
  issueLabel,
  pullRequestAction,
  branchFilter,
  commentContains,
  senderLogins,
  workflowName,
  workflowConclusion,
  onStartSetup,
  onRefreshInstallations,
  onOpenComputerSettings,
  onInstallationChange,
  onRepositoryChange,
  onEventFamilyChange,
  onIssueActionChange,
  onIssueLabelChange,
  onPullRequestActionChange,
  onBranchFilterChange,
  onCommentContainsChange,
  onSenderLoginsChange,
  onWorkflowNameChange,
  onWorkflowConclusionChange,
}: {
  relayReady: boolean;
  setupMessage: string;
  installations: GithubInstallation[];
  repositories: GithubRepository[];
  loading: boolean;
  repositoriesLoading: boolean;
  error: string | null;
  setupRefreshAvailable: boolean;
  selectedInstallationId: GithubInt64 | null;
  selectedRepositoryFullName: string;
  eventFamily: GithubEventFamily;
  issueAction: string;
  issueLabel: string;
  pullRequestAction: string;
  branchFilter: string;
  commentContains: string;
  senderLogins: string;
  workflowName: string;
  workflowConclusion: string;
  onStartSetup: () => void;
  onRefreshInstallations: () => void;
  onOpenComputerSettings: () => void;
  onInstallationChange: (installationId: GithubInt64) => void;
  onRepositoryChange: (fullName: string) => void;
  onEventFamilyChange: (family: GithubEventFamily) => void;
  onIssueActionChange: (action: string) => void;
  onIssueLabelChange: (value: string) => void;
  onPullRequestActionChange: (action: string) => void;
  onBranchFilterChange: (value: string) => void;
  onCommentContainsChange: (value: string) => void;
  onSenderLoginsChange: (value: string) => void;
  onWorkflowNameChange: (value: string) => void;
  onWorkflowConclusionChange: (value: string) => void;
}) {
  const t = useTranslations("automation.githubTrigger");
  const eventOptions = React.useMemo(
    () =>
      EVENT_OPTIONS.map((option) => ({
        ...option,
        label: t(`events.${option.value}.label`),
        description: t(`events.${option.value}.description`),
      })),
    [t],
  );
  const prActions = React.useMemo(
    () =>
      PR_ACTIONS.map((option) => ({
        ...option,
        label: t(`prActions.${option.value}`),
      })),
    [t],
  );
  const issueActions = React.useMemo(
    () =>
      ISSUE_ACTIONS.map((option) => ({
        ...option,
        label: t(`issueActions.${option.value}`),
      })),
    [t],
  );
  const workflowConclusions = React.useMemo(
    () =>
      WORKFLOW_CONCLUSIONS.map((option) => ({
        ...option,
        label: t(`workflowConclusions.${option.value}`),
      })),
    [t],
  );

  return (
    <div className="mt-4 space-y-3 rounded-md border border-border bg-muted/15 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Github className="size-4" />
            {t("title")}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{setupMessage}</div>
        </div>
        {relayReady ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={setupRefreshAvailable ? onRefreshInstallations : onStartSetup}
            disabled={loading}
            className="shrink-0"
          >
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : setupRefreshAvailable ? (
              <RefreshCw className="size-4" />
            ) : (
              <ExternalLink className="size-4" />
            )}
            {setupRefreshAvailable ? t("actions.refresh") : t("actions.connect")}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenComputerSettings}
            className="shrink-0"
          >
            <Computer className="size-4" />
            {t("actions.openSettings")}
          </Button>
        )}
      </div>

      {error ? <div className="text-xs text-destructive">{error}</div> : null}

      {relayReady ? (
        <>
          <div className="space-y-2">
            <Label>{t("fields.installation")}</Label>
            <Select
              value={selectedInstallationId ?? ""}
              onValueChange={onInstallationChange}
              disabled={loading || installations.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={loading ? t("placeholders.loadingInstallations") : t("placeholders.selectInstallation")} />
              </SelectTrigger>
              <SelectContent>
                {installations.map((installation) => (
                  <SelectItem key={installation.installation_id} value={String(installation.installation_id)}>
                    {installation.account_login
                      ? t("installationOption.withLogin", {
                          login: installation.account_login,
                          id: installation.installation_id,
                        })
                      : t("installationOption.fallback", { id: installation.installation_id })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("fields.repository")}</Label>
            <Select
              value={selectedRepositoryFullName}
              onValueChange={onRepositoryChange}
              disabled={!selectedInstallationId || repositoriesLoading || repositories.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={repositoriesLoading ? t("placeholders.loadingRepositories") : t("placeholders.selectRepository")} />
              </SelectTrigger>
              <SelectContent>
                {repositories.map((repo) => (
                  <SelectItem key={repo.id} value={repo.full_name}>
                    {repo.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("fields.event")}</Label>
            <Select value={eventFamily} onValueChange={(value) => onEventFamilyChange(value as GithubEventFamily)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {eventOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value} textValue={option.label}>
                    <IconOptionLabel Icon={option.Icon} label={option.label} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">
              {eventOptions.find((option) => option.value === eventFamily)?.description}
            </div>
          </div>

          {eventFamily === "pull_request" ? (
            <SelectField
              label={t("fields.action")}
              value={pullRequestAction}
              options={prActions}
              onChange={onPullRequestActionChange}
            />
          ) : null}

          {eventFamily === "issues" ? (
            <div className="grid gap-2">
              <SelectField
                label={t("fields.action")}
                value={issueAction}
                options={issueActions}
                onChange={onIssueActionChange}
              />
              {issueAction === "labeled" ? (
                <TextField
                  label={t("fields.issueLabel")}
                  value={issueLabel}
                  placeholder={t("placeholders.issueLabel")}
                  onChange={onIssueLabelChange}
                />
              ) : null}
            </div>
          ) : null}

          {eventFamily === "pull_request_comment" ? (
            <div className="grid gap-2">
              <TokenField
                label={t("fields.githubUsers")}
                value={senderLogins}
                placeholder={t("placeholders.githubUsers")}
                onChange={onSenderLoginsChange}
                caseInsensitive
              />
              <TokenField
                label={t("fields.commentContains")}
                value={commentContains}
                placeholder={t("placeholders.commentContains")}
                onChange={onCommentContainsChange}
              />
            </div>
          ) : null}

          {eventFamily === "push" ? (
            <TextField
              label={t("fields.branch")}
              value={branchFilter}
              placeholder={t("placeholders.branch")}
              onChange={onBranchFilterChange}
            />
          ) : null}

          {eventFamily === "workflow_run" ? (
            <div className="grid gap-2">
              <TextField
                label={t("fields.workflowName")}
                value={workflowName}
                placeholder={t("placeholders.workflowName")}
                onChange={onWorkflowNameChange}
              />
              <SelectField
                label={t("fields.conclusion")}
                value={workflowConclusion}
                options={workflowConclusions}
                onChange={onWorkflowConclusionChange}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function TokenField({
  label,
  value,
  placeholder,
  onChange,
  caseInsensitive = false,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  caseInsensitive?: boolean;
}) {
  const t = useTranslations("automation.githubTrigger");
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = React.useState("");
  const tokens = React.useMemo(
    () => parseTokenInput(value, caseInsensitive),
    [caseInsensitive, value],
  );

  const updateTokens = React.useCallback(
    (nextTokens: string[]) => {
      onChange(nextTokens.join(", "));
    },
    [onChange],
  );
  const commitDraft = React.useCallback(
    (raw: string) => {
      const nextTokens = mergeTokenLists(
        tokens,
        parseTokenInput(raw, caseInsensitive),
        caseInsensitive,
      );
      if (nextTokens.length === tokens.length) {
        setDraft("");
        return;
      }
      updateTokens(nextTokens);
      setDraft("");
    },
    [caseInsensitive, tokens, updateTokens],
  );
  const removeToken = React.useCallback(
    (index: number) => {
      updateTokens(tokens.filter((_, tokenIndex) => tokenIndex !== index));
    },
    [tokens, updateTokens],
  );

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div
        role="group"
        className={cn(
          "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 shadow-xs",
          "transition-shadow focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {tokens.map((token, index) => (
          <Badge
            key={`${token}:${index}`}
            variant="secondary"
            className="h-6 max-w-full gap-1 rounded-md px-2 text-xs font-normal"
          >
            <span className="truncate">{token}</span>
            <button
              type="button"
              className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("removeTokenAria", { token })}
              onClick={(event) => {
                event.stopPropagation();
                removeToken(index);
              }}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          ref={inputRef}
          value={draft}
          placeholder={tokens.length === 0 ? placeholder : ""}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "," || (event.key === "Tab" && draft.trim())) {
              event.preventDefault();
              commitDraft(draft);
              return;
            }
            if (event.key === "Backspace" && !draft && tokens.length > 0) {
              event.preventDefault();
              removeToken(tokens.length - 1);
            }
          }}
          onBlur={() => {
            if (draft.trim()) {
              commitDraft(draft);
            }
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text");
            if (/[,\n]/.test(text)) {
              event.preventDefault();
              commitDraft(`${draft}${draft ? "," : ""}${text}`);
            }
          }}
          className="h-7 min-w-[9rem] flex-1 border-0 bg-transparent px-1 py-0 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}

function parseTokenInput(value: string, caseInsensitive: boolean): string[] {
  return mergeTokenLists(
    [],
    value
      .split(/[,\n]+/)
      .map((token) => token.trim())
      .filter(Boolean),
    caseInsensitive,
  );
}

function mergeTokenLists(
  existing: string[],
  incoming: string[],
  caseInsensitive: boolean,
): string[] {
  const seen = new Set(existing.map((token) => tokenKey(token, caseInsensitive)));
  const merged = [...existing];
  for (const token of incoming) {
    const key = tokenKey(token, caseInsensitive);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(token);
  }
  return merged;
}

function tokenKey(value: string, caseInsensitive: boolean): string {
  return caseInsensitive ? value.toLowerCase() : value;
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; Icon?: LucideIcon }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} textValue={option.label}>
              <IconOptionLabel Icon={option.Icon} label={option.label} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function IconOptionLabel({
  Icon,
  label,
}: {
  Icon?: LucideIcon;
  label: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
      <span className="truncate">{label}</span>
    </span>
  );
}
