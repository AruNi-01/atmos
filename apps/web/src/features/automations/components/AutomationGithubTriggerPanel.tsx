"use client";

import * as React from "react";
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
  label: string;
  description: string;
  Icon: LucideIcon;
}> = [
  {
    value: "pull_request",
    label: "Pull request",
    description: "Opened, reopened, ready, closed, or merged",
    Icon: GitPullRequest,
  },
  {
    value: "issues",
    label: "Issue",
    description: "Opened, labeled, assigned, or updated",
    Icon: CircleDot,
  },
  {
    value: "pull_request_comment",
    label: "PR comment",
    description: "Issue comments on pull requests",
    Icon: MessageSquare,
  },
  { value: "push", label: "Push", description: "Branch updates", Icon: GitBranch },
  {
    value: "workflow_run",
    label: "Workflow run",
    description: "GitHub Actions completion",
    Icon: Workflow,
  },
];

const PR_ACTIONS = [
  { value: "opened", label: "Opened", Icon: GitPullRequest },
  { value: "reopened", label: "Reopened", Icon: RotateCcw },
  { value: "ready_for_review", label: "Ready for review", Icon: Eye },
  { value: "closed", label: "Closed", Icon: GitPullRequestClosed },
  { value: "merged", label: "Merged", Icon: GitMerge },
];

const ISSUE_ACTIONS = [
  { value: "labeled", label: "Labeled", Icon: CircleDot },
  { value: "opened", label: "Opened", Icon: GitPullRequest },
  { value: "reopened", label: "Reopened", Icon: RotateCcw },
  { value: "closed", label: "Closed", Icon: XCircle },
];

const WORKFLOW_CONCLUSIONS = [
  { value: "any", label: "Any conclusion", Icon: CircleDot },
  { value: "success", label: "Success", Icon: CheckCircle2 },
  { value: "failure", label: "Failure", Icon: XCircle },
  { value: "cancelled", label: "Cancelled", Icon: XCircle },
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
  return (
    <div className="mt-4 space-y-3 rounded-md border border-border bg-muted/15 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Github className="size-4" />
            GitHub App
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
            {setupRefreshAvailable ? "Refresh" : "Connect"}
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
            Open Settings
          </Button>
        )}
      </div>

      {error ? <div className="text-xs text-destructive">{error}</div> : null}

      {relayReady ? (
        <>
          <div className="space-y-2">
            <Label>Installation</Label>
            <Select
              value={selectedInstallationId ?? ""}
              onValueChange={onInstallationChange}
              disabled={loading || installations.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={loading ? "Loading installations" : "Select installation"} />
              </SelectTrigger>
              <SelectContent>
                {installations.map((installation) => (
                  <SelectItem key={installation.installation_id} value={String(installation.installation_id)}>
                    {installation.account_login
                      ? `${installation.account_login} (#${installation.installation_id})`
                      : `Installation ${installation.installation_id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Repository</Label>
            <Select
              value={selectedRepositoryFullName}
              onValueChange={onRepositoryChange}
              disabled={!selectedInstallationId || repositoriesLoading || repositories.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={repositoriesLoading ? "Loading repositories" : "Select repository"} />
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
            <Label>Event</Label>
            <Select value={eventFamily} onValueChange={(value) => onEventFamilyChange(value as GithubEventFamily)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value} textValue={option.label}>
                    <IconOptionLabel Icon={option.Icon} label={option.label} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">
              {EVENT_OPTIONS.find((option) => option.value === eventFamily)?.description}
            </div>
          </div>

          {eventFamily === "pull_request" ? (
            <SelectField
              label="Action"
              value={pullRequestAction}
              options={PR_ACTIONS}
              onChange={onPullRequestActionChange}
            />
          ) : null}

          {eventFamily === "issues" ? (
            <div className="grid gap-2">
              <SelectField
                label="Action"
                value={issueAction}
                options={ISSUE_ACTIONS}
                onChange={onIssueActionChange}
              />
              {issueAction === "labeled" ? (
                <TextField
                  label="Issue label"
                  value={issueLabel}
                  placeholder="atmos-judge-approve"
                  onChange={onIssueLabelChange}
                />
              ) : null}
            </div>
          ) : null}

          {eventFamily === "pull_request_comment" ? (
            <div className="grid gap-2">
              <TokenField
                label="GitHub users"
                value={senderLogins}
                placeholder="alice, dependabot[bot]"
                onChange={onSenderLoginsChange}
                caseInsensitive
              />
              <TokenField
                label="Comment contains"
                value={commentContains}
                placeholder="/atmos review"
                onChange={onCommentContainsChange}
              />
            </div>
          ) : null}

          {eventFamily === "push" ? (
            <TextField
              label="Branch"
              value={branchFilter}
              placeholder="main or release/*"
              onChange={onBranchFilterChange}
            />
          ) : null}

          {eventFamily === "workflow_run" ? (
            <div className="grid gap-2">
              <TextField
                label="Workflow name"
                value={workflowName}
                placeholder="CI"
                onChange={onWorkflowNameChange}
              />
              <SelectField
                label="Conclusion"
                value={workflowConclusion}
                options={WORKFLOW_CONCLUSIONS}
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
          "transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
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
              className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Remove ${token}`}
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
