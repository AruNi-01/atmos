"use client";

import * as React from "react";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  cn,
} from "@workspace/ui";
import {
  Braces,
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Clock3,
  Globe2,
  Github,
  LoaderCircle,
  Play,
  type LucideIcon,
} from "lucide-react";

import { AutomationGithubTriggerPanel } from "@/features/automations/components/AutomationGithubTriggerPanel";
import type { GithubInstallation, GithubRepository } from "@/features/automations/lib/github-trigger-relay";
import type { AutomationSchedulePreviewResponse } from "@/features/automations/types";
import type { GithubEventFamily, GithubInt64 } from "@/features/automations/types";
import {
  DAY_OPTIONS,
  TRIGGER_OPTIONS,
  type TriggerChoice,
} from "@/features/automations/lib/automation-schedule";
import {
  clampNumber,
  formatDateTime,
  timezoneOptionsWithCurrent,
  type TimezoneOption,
} from "@/features/automations/lib/automation-format";

const TRIGGER_ICON_BY_VALUE: Record<TriggerChoice, LucideIcon> = {
  manual: Play,
  github: Github,
  hourly: Clock3,
  daily: Calendar,
  weekly: CalendarDays,
  monthly: CalendarRange,
  cron: Braces,
};

export function AutomationTriggerPicker({
  trigger,
  timezone,
  hour,
  minute,
  dayOfWeek,
  dayOfMonth,
  cronExpr,
  preview,
  previewError,
  previewLoading,
  githubRelayReady,
  githubSetupMessage,
  githubInstallations,
  githubRepositories,
  githubLoading,
  githubRepositoriesLoading,
  githubError,
  githubInstallationId,
  githubRepositoryFullName,
  githubEventFamily,
  githubPullRequestAction,
  githubBranchFilter,
  githubCommentContains,
  githubSenderLogins,
  githubWorkflowConclusion,
  onTriggerChange,
  onTimezoneChange,
  onHourChange,
  onMinuteChange,
  onDayOfWeekChange,
  onDayOfMonthChange,
  onCronExprChange,
  onGithubStartSetup,
  onGithubOpenComputerSettings,
  onGithubInstallationChange,
  onGithubRepositoryChange,
  onGithubEventFamilyChange,
  onGithubPullRequestActionChange,
  onGithubBranchFilterChange,
  onGithubCommentContainsChange,
  onGithubSenderLoginsChange,
  onGithubWorkflowConclusionChange,
  surface = "card",
}: {
  trigger: TriggerChoice;
  timezone: string;
  hour: number;
  minute: number;
  dayOfWeek: number;
  dayOfMonth: number;
  cronExpr: string;
  preview: AutomationSchedulePreviewResponse | null;
  previewError: string | null;
  previewLoading: boolean;
  githubRelayReady: boolean;
  githubSetupMessage: string;
  githubInstallations: GithubInstallation[];
  githubRepositories: GithubRepository[];
  githubLoading: boolean;
  githubRepositoriesLoading: boolean;
  githubError: string | null;
  githubInstallationId: GithubInt64 | null;
  githubRepositoryFullName: string;
  githubEventFamily: GithubEventFamily;
  githubPullRequestAction: string;
  githubBranchFilter: string;
  githubCommentContains: string;
  githubSenderLogins: string;
  githubWorkflowConclusion: string;
  onTriggerChange: (trigger: TriggerChoice) => void;
  onTimezoneChange: (timezone: string) => void;
  onHourChange: (value: number) => void;
  onMinuteChange: (value: number) => void;
  onDayOfWeekChange: (value: number) => void;
  onDayOfMonthChange: (value: number) => void;
  onCronExprChange: (value: string) => void;
  onGithubStartSetup: () => void;
  onGithubOpenComputerSettings: () => void;
  onGithubInstallationChange: (installationId: GithubInt64) => void;
  onGithubRepositoryChange: (fullName: string) => void;
  onGithubEventFamilyChange: (family: GithubEventFamily) => void;
  onGithubPullRequestActionChange: (action: string) => void;
  onGithubBranchFilterChange: (value: string) => void;
  onGithubCommentContainsChange: (value: string) => void;
  onGithubSenderLoginsChange: (value: string) => void;
  onGithubWorkflowConclusionChange: (value: string) => void;
  surface?: "card" | "plain";
}) {
  const selectedTriggerOption =
    TRIGGER_OPTIONS.find((option) => option.value === trigger) ?? TRIGGER_OPTIONS[0];

  return (
    <section
      className={cn(
        surface === "card"
          ? "rounded-md border border-border bg-background p-4 shadow-xs"
          : "space-y-4",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 text-muted-foreground" />
          <div className="text-sm font-semibold text-foreground">Trigger</div>
        </div>
        <TimezoneSelect timezone={timezone} onTimezoneChange={onTimezoneChange} />
      </div>
      <div className="mt-4 grid gap-2">
        <Label htmlFor="automation-trigger-kind">Trigger type</Label>
        <Select
          value={trigger}
          onValueChange={(value) => onTriggerChange(value as TriggerChoice)}
        >
          <SelectTrigger
            id="automation-trigger-kind"
            className="w-full bg-background/35 [&_[data-trigger-option-description]]:hidden"
            onPointerDownCapture={(event) => event.stopPropagation()}
          >
            <SelectValue placeholder="Select trigger" />
          </SelectTrigger>
          <SelectContent>
            {TRIGGER_OPTIONS.map((option) => {
              const TriggerIcon = TRIGGER_ICON_BY_VALUE[option.value];

              return (
                <SelectItem key={option.value} value={option.value} textValue={option.label}>
                  <span className="flex items-start gap-2">
                    <TriggerIcon
                      data-trigger-option-icon
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    />
                    <span className="flex flex-col items-start gap-0.5">
                      <span data-trigger-option-label className="text-sm font-medium">
                        {option.label}
                      </span>
                      <span data-trigger-option-description className="text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {selectedTriggerOption ? (
          <p className="text-xs text-muted-foreground">
            {selectedTriggerOption.description}
          </p>
        ) : null}
      </div>

      {trigger === "github" ? (
        <AutomationGithubTriggerPanel
          relayReady={githubRelayReady}
          setupMessage={githubSetupMessage}
          installations={githubInstallations}
          repositories={githubRepositories}
          loading={githubLoading}
          repositoriesLoading={githubRepositoriesLoading}
          error={githubError}
          selectedInstallationId={githubInstallationId}
          selectedRepositoryFullName={githubRepositoryFullName}
          eventFamily={githubEventFamily}
          pullRequestAction={githubPullRequestAction}
          branchFilter={githubBranchFilter}
          commentContains={githubCommentContains}
          senderLogins={githubSenderLogins}
          workflowConclusion={githubWorkflowConclusion}
          onStartSetup={onGithubStartSetup}
          onOpenComputerSettings={onGithubOpenComputerSettings}
          onInstallationChange={onGithubInstallationChange}
          onRepositoryChange={onGithubRepositoryChange}
          onEventFamilyChange={onGithubEventFamilyChange}
          onPullRequestActionChange={onGithubPullRequestActionChange}
          onBranchFilterChange={onGithubBranchFilterChange}
          onCommentContainsChange={onGithubCommentContainsChange}
          onSenderLoginsChange={onGithubSenderLoginsChange}
          onWorkflowConclusionChange={onGithubWorkflowConclusionChange}
        />
      ) : trigger !== "manual" ? (
        <div className="mt-4 space-y-3">
          {trigger === "hourly" ? (
            <NumberField label="Minute" value={minute} min={0} max={59} onChange={onMinuteChange} />
          ) : null}
          {trigger === "daily" || trigger === "weekly" || trigger === "monthly" ? (
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Hour" value={hour} min={0} max={23} onChange={onHourChange} />
              <NumberField label="Minute" value={minute} min={0} max={59} onChange={onMinuteChange} />
            </div>
          ) : null}
          {trigger === "weekly" ? (
            <div className="space-y-2">
              <Label>Day</Label>
              <Select value={String(dayOfWeek)} onValueChange={(value) => onDayOfWeekChange(Number(value))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {trigger === "monthly" ? (
            <NumberField label="Day of month" value={dayOfMonth} min={1} max={31} onChange={onDayOfMonthChange} />
          ) : null}
          {trigger === "cron" ? (
            <div className="space-y-2">
              <Label htmlFor="automation-cron">Cron expression</Label>
              <Input
                id="automation-cron"
                value={cronExpr}
                onChange={(event) => onCronExprChange(event.target.value)}
                placeholder="0 9 * * 1"
              />
            </div>
          ) : null}
          <div className="rounded-xl border border-border/60 bg-background/35 px-3 py-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {previewLoading ? <LoaderCircle className="size-3.5 animate-spin" /> : <Clock3 className="size-3.5" />}
              Next runs
            </div>
            {previewError ? (
              <div className="mt-2 text-xs text-destructive">{previewError}</div>
            ) : preview?.occurrences.length ? (
              <div className="mt-2 space-y-1 text-xs text-foreground">
                {preview.occurrences.slice(0, 3).map((occurrence) => (
                  <div key={occurrence}>{formatDateTime(occurrence)}</div>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-xs text-muted-foreground">Preview will appear after a valid schedule.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-border/60 bg-background/35 px-3 py-2 text-sm text-muted-foreground">
          No schedule is saved. Use Run Now from the detail view.
        </div>
      )}
    </section>
  );
}

function TimezoneSelect({
  timezone,
  onTimezoneChange,
}: {
  timezone: string;
  onTimezoneChange: (timezone: string) => void;
}) {
  const groupedOptions = React.useMemo(
    () => groupTimezoneOptions(timezoneOptionsWithCurrent(timezone)),
    [timezone],
  );

  return (
    <Select value={timezone} onValueChange={onTimezoneChange}>
      <SelectTrigger
        aria-label="Trigger timezone"
        size="sm"
        className="h-8 max-w-[13rem] border-border/60 bg-background/35 px-2.5 text-xs [&_[data-timezone-option-value]]:hidden"
        onPointerDownCapture={(event) => event.stopPropagation()}
      >
        <Globe2 className="size-3.5" />
        <SelectValue placeholder="Timezone" />
      </SelectTrigger>
      <SelectContent align="end" className="max-h-[18rem] w-[18rem]">
        {groupedOptions.map((group, index) => (
          <React.Fragment key={group.group}>
            {index > 0 ? <SelectSeparator /> : null}
            <SelectGroup>
              <SelectLabel>{group.group}</SelectLabel>
              {group.options.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  textValue={`${option.label} ${option.value}`}
                >
                  <span className="flex min-w-0 flex-col items-start gap-0.5">
                    <span data-timezone-option-label className="max-w-[13rem] truncate">
                      {option.label}
                    </span>
                    <span data-timezone-option-value className="max-w-[13rem] truncate text-xs text-muted-foreground">
                      {option.value}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </React.Fragment>
        ))}
      </SelectContent>
    </Select>
  );
}

function groupTimezoneOptions(options: TimezoneOption[]) {
  return options.reduce<Array<{ group: string; options: TimezoneOption[] }>>(
    (groups, option) => {
      const existingGroup = groups.find((group) => group.group === option.group);
      if (existingGroup) {
        existingGroup.options.push(option);
      } else {
        groups.push({ group: option.group, options: [option] });
      }
      return groups;
    },
    [],
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = React.useState(String(value));

  React.useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commitValue = () => {
    if (draft.trim() === "") {
      setDraft(String(value));
      return;
    }
    const next = Number(draft);
    if (!Number.isFinite(next)) {
      setDraft(String(value));
      return;
    }
    const clamped = clampNumber(next, min, max);
    setDraft(String(clamped));
    onChange(clamped);
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        value={draft}
        min={min}
        max={max}
        onBlur={commitValue}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = event.currentTarget.valueAsNumber;
          if (!Number.isNaN(next)) {
            onChange(clampNumber(next, min, max));
          }
        }}
      />
    </div>
  );
}
