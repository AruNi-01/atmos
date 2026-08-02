import React from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toastManager,
} from '@workspace/ui';
import {
  Check,
  CheckCircle2,
  CircleDot,
  Code,
  Eye,
  Loader2,
  MessageSquare,
  Plus,
  Settings2,
  Tag,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useComputerQueryScope } from '@/api/query/query-scope';
import { queryKeys } from '@/api/query/query-keys';
import { wsRequest } from '@/api/ws/request';
import {
  useGithubRepoAssigneesQuery,
  useGithubRepoLabelsQuery,
} from '@/features/github/hooks/use-github-pr-query';
import type {
  GithubRepoAssignee,
  GithubRepoLabel,
} from '@/features/github/lib/github-query-options';
import {
  SidebarSection,
  type Assignee,
  type ClosingIssue,
  type Label,
  type Reviewer,
} from './pr-detail-parts';

interface PRSidebarData {
  participants?: Array<{ login: string; avatar_url?: string }>;
  closingIssuesReferences?: ClosingIssue[];
}

interface PRSidebarModel {
  reviews?: Array<{ author?: { login?: string; avatarUrl?: string; avatar_url?: string }; state?: string }>;
  reviewRequests?: Array<{ login?: string; name?: string; avatarUrl?: string; avatar_url?: string }>;
  assignees?: Assignee[];
  labels?: Label[];
}

interface PRMetadataSidebarProps {
  owner: string;
  repo: string;
  prNumber: number;
  pr: PRSidebarModel;
  sidebarData?: PRSidebarData | null;
  sidebarLoading: boolean;
  isSidebarCollapsed: boolean;
  onPrMetadataChanged?: () => void;
  /** Click a reviewer to jump to their review comments in Files changed. */
  onReviewerClick?: (login: string) => void;
  /** Logins that have at least one file review comment (enables jump affordance). */
  jumpableReviewerLogins?: ReadonlySet<string>;
}

export function PRMetadataSidebar({
  owner,
  repo,
  prNumber,
  pr,
  sidebarData,
  sidebarLoading,
  isSidebarCollapsed,
  onPrMetadataChanged,
  onReviewerClick,
  jumpableReviewerLogins,
}: PRMetadataSidebarProps) {
  const t = useTranslations('github.prDetailSidebar');
  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn(
        "shrink-0 hidden lg:flex flex-col overflow-y-auto no-scrollbar overflow-x-hidden transition-[max-width,opacity] duration-200 ease-out",
        isSidebarCollapsed ? "max-w-0 opacity-0" : "max-w-[240px] opacity-100"
      )}>
        <div className="flex flex-col gap-5 text-xs pr-2 pt-1 pb-16 w-[240px]">
          <SidebarSection title={t('sections.reviewers')} icon={<Eye className="size-3.5" />}>
            <ReviewersList
              pr={pr}
              onReviewerClick={onReviewerClick}
              jumpableReviewerLogins={jumpableReviewerLogins}
            />
          </SidebarSection>

          <SidebarSection
            title={t('sections.assignees')}
            icon={<User className="size-3.5" />}
            action={
              <AssigneesEditor
                owner={owner}
                repo={repo}
                prNumber={prNumber}
                assignees={pr.assignees}
                onChanged={onPrMetadataChanged}
              />
            }
          >
            <AssigneesList assignees={pr.assignees} />
          </SidebarSection>

          <SidebarSection
            title={t('sections.labels')}
            icon={<Tag className="size-3.5" />}
            action={
              <LabelsEditor
                owner={owner}
                repo={repo}
                prNumber={prNumber}
                labels={pr.labels}
                onChanged={onPrMetadataChanged}
              />
            }
          >
            <LabelsList labels={pr.labels} />
          </SidebarSection>

          <SidebarSection title={t('sections.participants')} icon={<Users className="size-3.5" />}>
            <ParticipantsList sidebarData={sidebarData} sidebarLoading={sidebarLoading} />
          </SidebarSection>

          {sidebarLoading && (
            <SidebarSection title={t('sections.development')} icon={<Code className="size-3.5" />}>
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="h-8 w-full rounded mt-1" />
            </SidebarSection>
          )}
          {!sidebarLoading && sidebarData?.closingIssuesReferences && Array.isArray(sidebarData.closingIssuesReferences) && sidebarData.closingIssuesReferences.length > 0 && (
            <DevelopmentIssues issues={sidebarData.closingIssuesReferences} />
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

function ReviewersList({
  pr,
  onReviewerClick,
  jumpableReviewerLogins,
}: {
  pr: PRSidebarModel;
  onReviewerClick?: (login: string) => void;
  jumpableReviewerLogins?: ReadonlySet<string>;
}) {
  const t = useTranslations('github.prDetailSidebar');
  const reviewers: Reviewer[] = [];
  const seen = new Map<string, number>();

  if (pr.reviews && Array.isArray(pr.reviews)) {
    for (const review of pr.reviews) {
      const login = review.author?.login;
      if (!login) continue;
      const existingIdx = seen.get(login);
      if (existingIdx !== undefined) {
        reviewers[existingIdx] = {
          login,
          avatar_url: review.author?.avatarUrl || review.author?.avatar_url,
          state: review.state,
        };
      } else {
        seen.set(login, reviewers.length);
        reviewers.push({
          login,
          avatar_url: review.author?.avatarUrl || review.author?.avatar_url,
          state: review.state,
        });
      }
    }
  }

  if (pr.reviewRequests && Array.isArray(pr.reviewRequests)) {
    for (const req of pr.reviewRequests) {
      const login = req.login || req.name;
      if (login && !seen.has(login)) {
        seen.set(login, reviewers.length);
        reviewers.push({
          login,
          avatar_url: req.avatarUrl || req.avatar_url,
          state: 'PENDING',
        });
      }
    }
  }

  if (reviewers.length === 0) {
    return <span className="text-muted-foreground/60 italic">{t('empty.reviewers')}</span>;
  }

  return reviewers.map((r) => {
    const canJump = Boolean(onReviewerClick && jumpableReviewerLogins?.has(r.login));
    const row = (
      <div
        className={cn(
          "flex items-center gap-2 py-0.5 rounded-md px-1 -mx-1 min-w-0",
          canJump &&
            "cursor-pointer hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        )}
      >
        <Avatar className="size-5 border border-border/50 shrink-0">
          <AvatarImage src={r.avatar_url || `https://github.com/${r.login.replace('[bot]', '')}.png?size=32`} />
          <AvatarFallback className="text-[7px]">{r.login.substring(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="font-medium text-foreground/90 truncate flex-1">{r.login}</span>
        {r.state === 'APPROVED' && <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />}
        {r.state === 'CHANGES_REQUESTED' && <XCircle className="size-3.5 text-red-500 shrink-0" />}
        {r.state === 'COMMENTED' && <MessageSquare className="size-3.5 text-muted-foreground shrink-0" />}
        {r.state === 'PENDING' && <Eye className="size-3.5 text-amber-500 shrink-0" />}
      </div>
    );

    if (!canJump) {
      return <div key={r.login}>{row}</div>;
    }

    return (
      <Tooltip key={r.login}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="w-full text-left"
            onClick={() => onReviewerClick?.(r.login)}
          >
            {row}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">
          {t('reviewers.jumpToFiles')}
        </TooltipContent>
      </Tooltip>
    );
  });
}

function AssigneesList({ assignees }: { assignees?: Assignee[] }) {
  const t = useTranslations('github.prDetailSidebar');
  if (!assignees || !Array.isArray(assignees) || assignees.length === 0) {
    return <span className="text-muted-foreground/60 italic">{t('empty.assignees')}</span>;
  }

  return assignees.map((a) => (
    <div key={a.login} className="flex items-center gap-2 py-0.5">
      <Avatar className="size-5 border border-border/50">
        <AvatarImage src={a.avatar_url || a.avatarUrl || `https://github.com/${a.login.replace('[bot]', '')}.png?size=32`} />
        <AvatarFallback className="text-[7px]">{a.login.substring(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="font-medium text-foreground/90 truncate">{a.login}</span>
    </div>
  ));
}

function LabelsList({ labels }: { labels?: Label[] }) {
  const t = useTranslations('github.prDetailSidebar');
  if (!labels || !Array.isArray(labels) || labels.length === 0) {
    return <span className="text-muted-foreground/60 italic">{t('empty.labels')}</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((l) => (
        <span
          key={l.name}
          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
          style={{
            backgroundColor: l.color ? `#${l.color}20` : undefined,
            color: l.color ? `#${l.color}` : undefined,
            border: l.color ? `1px solid #${l.color}40` : '1px solid var(--border)',
          }}
        >
          {l.name}
        </span>
      ))}
    </div>
  );
}

function ParticipantsList({
  sidebarData,
  sidebarLoading,
}: {
  sidebarData?: PRSidebarData | null;
  sidebarLoading: boolean;
}) {
  const t = useTranslations('github.prDetailSidebar');
  if (sidebarLoading) {
    return (
      <div className="flex gap-1">
        <Skeleton className="size-6 rounded-full" />
        <Skeleton className="size-6 rounded-full" />
      </div>
    );
  }

  if (!sidebarData?.participants || !Array.isArray(sidebarData.participants) || sidebarData.participants.length === 0) {
    return <span className="text-muted-foreground/60 italic">{t('empty.participants')}</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {sidebarData.participants.map((p) => (
        <Tooltip key={p.login}>
          <TooltipTrigger asChild>
            <Avatar className="size-6 border border-border/50 cursor-default hover:ring-2 hover:ring-primary/30 transition-all">
              <AvatarImage src={p.avatar_url || `https://github.com/${p.login}.png?size=32`} />
              <AvatarFallback className="text-[7px]">{p.login.substring(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">{p.login}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

function DevelopmentIssues({ issues }: { issues: ClosingIssue[] }) {
  const t = useTranslations('github.prDetailSidebar');
  return (
    <SidebarSection title={t('sections.development')} icon={<Code className="size-3.5" />}>
      <div className="text-[11px] text-muted-foreground mb-1">
        {t('development.description')}
      </div>
      <div className="flex flex-col gap-1.5">
        {issues.map((issue) => {
          const isClosed = issue.state === 'closed' || issue.state === 'CLOSED';
          return (
            <Tooltip key={issue.number}>
              <TooltipTrigger asChild>
                <a
                  href={issue.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-2 py-1 px-1.5 -mx-1.5 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <CircleDot className={cn(
                    "size-3.5 shrink-0 mt-0.5",
                    isClosed ? "text-purple-500" : "text-emerald-500"
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground/90 leading-snug line-clamp-2">
                      {issue.title || t('development.issueFallback', { number: issue.number })}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      #{issue.number} · {isClosed ? t('development.closed') : t('development.open')}
                    </div>
                  </div>
                </a>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs max-w-[280px]">
                <div className="font-semibold">{issue.title || t('development.issueFallback', { number: issue.number })}</div>
                <div className="text-muted-foreground mt-0.5">#{issue.number} · {isClosed ? t('development.closed') : t('development.open')}</div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </SidebarSection>
  );
}

const MetadataEditTrigger = React.forwardRef<
  HTMLButtonElement,
  {
    label: string;
    busy?: boolean;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function MetadataEditTrigger({ label, busy, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(
        "inline-flex size-5 items-center justify-center rounded text-muted-foreground/70",
        "hover:bg-muted hover:text-foreground transition-colors",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      {busy ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <Settings2 className="size-3" />
      )}
    </button>
  );
});

function LabelsEditor({
  owner,
  repo,
  prNumber,
  labels,
  onChanged,
}: {
  owner: string;
  repo: string;
  prNumber: number;
  labels?: Label[];
  onChanged?: () => void;
}) {
  const t = useTranslations('github.prDetailSidebar');
  const scope = useComputerQueryScope();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState<string | null>(null);

  const selectedNames = React.useMemo(
    () => new Set((labels ?? []).map((l) => l.name).filter(Boolean)),
    [labels],
  );

  const { data: repoLabels = [], isLoading, isError, refetch } = useGithubRepoLabelsQuery({
    owner,
    repo,
    enabled: open && Boolean(owner && repo),
  });

  const applyLabelToggle = async (label: GithubRepoLabel, currentlySelected: boolean) => {
    if (!label.name || pending) return;
    setPending(label.name);

    const detailKey = queryKeys.computer.githubPrDetail(scope, { owner, repo, prNumber });
    const previous = queryClient.getQueryData(detailKey);

    // Optimistic update on PR detail cache
    queryClient.setQueryData(detailKey, (old: Record<string, unknown> | undefined) => {
      if (!old || typeof old !== 'object') return old;
      const current = Array.isArray(old.labels) ? (old.labels as Label[]) : [];
      const nextLabels = currentlySelected
        ? current.filter((l) => l.name !== label.name)
        : [
            ...current,
            {
              name: label.name,
              color: label.color ?? undefined,
              description: label.description ?? undefined,
            },
          ];
      return { ...old, labels: nextLabels };
    });

    try {
      await wsRequest('github_pr_update_labels', {
        owner,
        repo,
        pr_number: prNumber,
        add: currentlySelected ? [] : [label.name],
        remove: currentlySelected ? [label.name] : [],
      });
      onChanged?.();
      void queryClient.invalidateQueries({ queryKey: detailKey });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.computer.githubPrTimeline(scope, { owner, repo, prNumber }),
      });
    } catch (error) {
      if (previous !== undefined) {
        queryClient.setQueryData(detailKey, previous);
      }
      console.error(error);
      toastManager.add({
        title: t('edit.errorTitle'),
        description: t('edit.labelsFailed'),
        type: 'error',
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <MetadataEditTrigger label={t('edit.labelsAria')} busy={Boolean(pending)} />
      </PopoverTrigger>
      <PopoverContent align="end" side="left" className="w-[280px] p-0">
        <Command>
          <CommandInput placeholder={t('edit.filterLabels')} />
          <CommandList className="max-h-[280px]">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                {t('edit.loading')}
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center gap-2 py-6 px-3 text-center">
                <div className="text-xs text-muted-foreground">{t('edit.loadFailed')}</div>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => void refetch()}
                >
                  {t('edit.retry')}
                </button>
              </div>
            ) : (
              <>
                <CommandEmpty>{t('edit.noLabels')}</CommandEmpty>
                <CommandGroup>
                  {repoLabels.map((label) => {
                    const selected = selectedNames.has(label.name);
                    const color = label.color?.replace(/^#/, '') || undefined;
                    const isBusy = pending === label.name;
                    return (
                      <CommandItem
                        key={label.name}
                        value={`${label.name} ${label.description ?? ''}`}
                        disabled={Boolean(pending)}
                        onSelect={() => void applyLabelToggle(label, selected)}
                        className="gap-2"
                      >
                        <span
                          className="size-2.5 shrink-0 rounded-full border border-black/10"
                          style={{ backgroundColor: color ? `#${color}` : 'var(--muted)' }}
                        />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-xs font-medium">{label.name}</span>
                          {label.description ? (
                            <span className="truncate text-[10px] text-muted-foreground">
                              {label.description}
                            </span>
                          ) : null}
                        </div>
                        {isBusy ? (
                          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                        ) : selected ? (
                          <Check className="size-3.5 shrink-0 text-foreground" />
                        ) : (
                          <Plus className="size-3.5 shrink-0 text-muted-foreground/40" />
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function AssigneesEditor({
  owner,
  repo,
  prNumber,
  assignees,
  onChanged,
}: {
  owner: string;
  repo: string;
  prNumber: number;
  assignees?: Assignee[];
  onChanged?: () => void;
}) {
  const t = useTranslations('github.prDetailSidebar');
  const scope = useComputerQueryScope();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState<string | null>(null);

  const selectedLogins = React.useMemo(
    () => new Set((assignees ?? []).map((a) => a.login).filter(Boolean)),
    [assignees],
  );

  const { data: repoAssignees = [], isLoading, isError, refetch } = useGithubRepoAssigneesQuery({
    owner,
    repo,
    enabled: open && Boolean(owner && repo),
  });

  const applyAssigneeToggle = async (user: GithubRepoAssignee, currentlySelected: boolean) => {
    if (!user.login || pending) return;
    setPending(user.login);

    const detailKey = queryKeys.computer.githubPrDetail(scope, { owner, repo, prNumber });
    const previous = queryClient.getQueryData(detailKey);

    queryClient.setQueryData(detailKey, (old: Record<string, unknown> | undefined) => {
      if (!old || typeof old !== 'object') return old;
      const current = Array.isArray(old.assignees) ? (old.assignees as Assignee[]) : [];
      const nextAssignees = currentlySelected
        ? current.filter((a) => a.login !== user.login)
        : [
            ...current,
            {
              login: user.login,
              avatar_url: user.avatar_url ?? undefined,
              avatarUrl: user.avatar_url ?? undefined,
            },
          ];
      return { ...old, assignees: nextAssignees };
    });

    try {
      await wsRequest('github_pr_update_assignees', {
        owner,
        repo,
        pr_number: prNumber,
        add: currentlySelected ? [] : [user.login],
        remove: currentlySelected ? [user.login] : [],
      });
      onChanged?.();
      void queryClient.invalidateQueries({ queryKey: detailKey });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.computer.githubPrTimeline(scope, { owner, repo, prNumber }),
      });
    } catch (error) {
      if (previous !== undefined) {
        queryClient.setQueryData(detailKey, previous);
      }
      console.error(error);
      toastManager.add({
        title: t('edit.errorTitle'),
        description: t('edit.assigneesFailed'),
        type: 'error',
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <MetadataEditTrigger label={t('edit.assigneesAria')} busy={Boolean(pending)} />
      </PopoverTrigger>
      <PopoverContent align="end" side="left" className="w-[280px] p-0">
        <Command>
          <CommandInput placeholder={t('edit.filterAssignees')} />
          <CommandList className="max-h-[280px]">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                {t('edit.loading')}
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center gap-2 py-6 px-3 text-center">
                <div className="text-xs text-muted-foreground">{t('edit.loadFailed')}</div>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => void refetch()}
                >
                  {t('edit.retry')}
                </button>
              </div>
            ) : (
              <>
                <CommandEmpty>{t('edit.noAssignees')}</CommandEmpty>
                <CommandGroup>
                  {repoAssignees.map((user) => {
                    const selected = selectedLogins.has(user.login);
                    const isBusy = pending === user.login;
                    return (
                      <CommandItem
                        key={user.login}
                        value={user.login}
                        disabled={Boolean(pending)}
                        onSelect={() => void applyAssigneeToggle(user, selected)}
                        className="gap-2"
                      >
                        <Avatar className="size-5 border border-border/50 shrink-0">
                          <AvatarImage
                            src={
                              user.avatar_url ||
                              `https://github.com/${user.login.replace('[bot]', '')}.png?size=32`
                            }
                          />
                          <AvatarFallback className="text-[7px]">
                            {user.login.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">
                          {user.login}
                        </span>
                        {isBusy ? (
                          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                        ) : selected ? (
                          <Check className="size-3.5 shrink-0 text-foreground" />
                        ) : (
                          <Plus className="size-3.5 shrink-0 text-muted-foreground/40" />
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
