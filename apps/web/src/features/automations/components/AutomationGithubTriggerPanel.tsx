"use client";

import * as React from "react";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui";
import { Computer, ExternalLink, Github, LoaderCircle } from "lucide-react";

import type { GithubInstallation, GithubRepository } from "@/features/automations/lib/github-trigger-relay";
import type { GithubEventFamily } from "@/features/automations/types";

const EVENT_OPTIONS: Array<{
  value: GithubEventFamily;
  label: string;
  description: string;
}> = [
  { value: "pull_request", label: "Pull request", description: "Opened, reopened, ready, closed, or merged" },
  { value: "pull_request_comment", label: "PR comment", description: "Issue comments on pull requests" },
  { value: "push", label: "Push", description: "Branch updates" },
  { value: "workflow_run", label: "Workflow run", description: "GitHub Actions completion" },
];

const PR_ACTIONS = [
  { value: "opened", label: "Opened" },
  { value: "reopened", label: "Reopened" },
  { value: "ready_for_review", label: "Ready for review" },
  { value: "closed", label: "Closed" },
  { value: "merged", label: "Merged" },
];

const WORKFLOW_CONCLUSIONS = [
  { value: "any", label: "Any conclusion" },
  { value: "success", label: "Success" },
  { value: "failure", label: "Failure" },
  { value: "cancelled", label: "Cancelled" },
];

export function AutomationGithubTriggerPanel({
  relayReady,
  setupMessage,
  installations,
  repositories,
  loading,
  repositoriesLoading,
  error,
  selectedInstallationId,
  selectedRepositoryFullName,
  eventFamily,
  pullRequestAction,
  branchFilter,
  commentContains,
  senderLogins,
  workflowConclusion,
  onStartSetup,
  onOpenComputerSettings,
  onInstallationChange,
  onRepositoryChange,
  onEventFamilyChange,
  onPullRequestActionChange,
  onBranchFilterChange,
  onCommentContainsChange,
  onSenderLoginsChange,
  onWorkflowConclusionChange,
}: {
  relayReady: boolean;
  setupMessage: string;
  installations: GithubInstallation[];
  repositories: GithubRepository[];
  loading: boolean;
  repositoriesLoading: boolean;
  error: string | null;
  selectedInstallationId: number | null;
  selectedRepositoryFullName: string;
  eventFamily: GithubEventFamily;
  pullRequestAction: string;
  branchFilter: string;
  commentContains: string;
  senderLogins: string;
  workflowConclusion: string;
  onStartSetup: () => void;
  onOpenComputerSettings: () => void;
  onInstallationChange: (installationId: number) => void;
  onRepositoryChange: (fullName: string) => void;
  onEventFamilyChange: (family: GithubEventFamily) => void;
  onPullRequestActionChange: (action: string) => void;
  onBranchFilterChange: (value: string) => void;
  onCommentContainsChange: (value: string) => void;
  onSenderLoginsChange: (value: string) => void;
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
            onClick={onStartSetup}
            disabled={loading}
            className="shrink-0"
          >
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
            Connect
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
              value={selectedInstallationId ? String(selectedInstallationId) : ""}
              onValueChange={(value) => onInstallationChange(Number(value))}
              disabled={loading || installations.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={loading ? "Loading installations" : "Select installation"} />
              </SelectTrigger>
              <SelectContent>
                {installations.map((installation) => (
                  <SelectItem key={installation.installation_id} value={String(installation.installation_id)}>
                    {installation.account_login ?? `Installation ${installation.installation_id}`}
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
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
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

          {eventFamily === "pull_request_comment" ? (
            <div className="grid gap-2">
              <TextField
                label="Comment contains"
                value={commentContains}
                placeholder="/atmos review"
                onChange={onCommentContainsChange}
              />
              <TextField
                label="Sender logins"
                value={senderLogins}
                placeholder="alice,octocat"
                onChange={onSenderLoginsChange}
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
            <SelectField
              label="Conclusion"
              value={workflowConclusion}
              options={WORKFLOW_CONCLUSIONS}
              onChange={onWorkflowConclusionChange}
            />
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

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
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
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
