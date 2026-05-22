import React from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@workspace/ui';
import {
  CheckCircle2,
  CircleDot,
  Code,
  Eye,
  MessageSquare,
  Tag,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ChecksSection,
  SidebarSection,
  type Assignee,
  type ClosingIssue,
  type Label,
  type Reviewer,
  type StatusCheck,
} from './pr-detail-modal-parts';

interface PRSidebarData {
  participants?: Array<{ login: string; avatar_url?: string }>;
  closingIssuesReferences?: ClosingIssue[];
}

interface PRSidebarModel {
  statusCheckRollup?: StatusCheck[];
  reviews?: Array<{ author?: { login?: string; avatarUrl?: string; avatar_url?: string }; state?: string }>;
  reviewRequests?: Array<{ login?: string; name?: string; avatarUrl?: string; avatar_url?: string }>;
  assignees?: Assignee[];
  labels?: Label[];
}

interface PRMetadataSidebarProps {
  pr: PRSidebarModel;
  sidebarData?: PRSidebarData | null;
  sidebarLoading: boolean;
  isSidebarCollapsed: boolean;
}

export function PRMetadataSidebar({
  pr,
  sidebarData,
  sidebarLoading,
  isSidebarCollapsed,
}: PRMetadataSidebarProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn(
        "shrink-0 hidden lg:flex flex-col overflow-y-auto no-scrollbar overflow-x-hidden transition-[max-width,opacity] duration-200 ease-out",
        isSidebarCollapsed ? "max-w-0 opacity-0" : "max-w-[240px] opacity-100"
      )}>
        <div className="flex flex-col gap-5 text-xs pr-2 pt-1 pb-16 w-[240px]">
          {pr.statusCheckRollup && pr.statusCheckRollup.length > 0 && (
            <ChecksSection checks={pr.statusCheckRollup} />
          )}

          <SidebarSection title="Reviewers" icon={<Eye className="size-3.5" />}>
            <ReviewersList pr={pr} />
          </SidebarSection>

          <SidebarSection title="Assignees" icon={<User className="size-3.5" />}>
            <AssigneesList assignees={pr.assignees} />
          </SidebarSection>

          <SidebarSection title="Labels" icon={<Tag className="size-3.5" />}>
            <LabelsList labels={pr.labels} />
          </SidebarSection>

          <SidebarSection title="Participants" icon={<Users className="size-3.5" />}>
            <ParticipantsList sidebarData={sidebarData} sidebarLoading={sidebarLoading} />
          </SidebarSection>

          {sidebarLoading && (
            <SidebarSection title="Development" icon={<Code className="size-3.5" />}>
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

function ReviewersList({ pr }: { pr: PRSidebarModel }) {
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
    return <span className="text-muted-foreground/60 italic">No reviewers</span>;
  }

  return reviewers.map((r) => (
    <div key={r.login} className="flex items-center gap-2 py-0.5">
      <Avatar className="size-5 border border-border/50">
        <AvatarImage src={r.avatar_url || `https://github.com/${r.login.replace('[bot]', '')}.png?size=32`} />
        <AvatarFallback className="text-[7px]">{r.login.substring(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="font-medium text-foreground/90 truncate flex-1">{r.login}</span>
      {r.state === 'APPROVED' && <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />}
      {r.state === 'CHANGES_REQUESTED' && <XCircle className="size-3.5 text-red-500 shrink-0" />}
      {r.state === 'COMMENTED' && <MessageSquare className="size-3.5 text-muted-foreground shrink-0" />}
      {r.state === 'PENDING' && <Eye className="size-3.5 text-amber-500 shrink-0" />}
    </div>
  ));
}

function AssigneesList({ assignees }: { assignees?: Assignee[] }) {
  if (!assignees || !Array.isArray(assignees) || assignees.length === 0) {
    return <span className="text-muted-foreground/60 italic">No assignees</span>;
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
  if (!labels || !Array.isArray(labels) || labels.length === 0) {
    return <span className="text-muted-foreground/60 italic">No labels</span>;
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
  if (sidebarLoading) {
    return (
      <div className="flex gap-1">
        <Skeleton className="size-6 rounded-full" />
        <Skeleton className="size-6 rounded-full" />
      </div>
    );
  }

  if (!sidebarData?.participants || !Array.isArray(sidebarData.participants) || sidebarData.participants.length === 0) {
    return <span className="text-muted-foreground/60 italic">No participants</span>;
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
  return (
    <SidebarSection title="Development" icon={<Code className="size-3.5" />}>
      <div className="text-[11px] text-muted-foreground mb-1">
        Successfully merging this pull request may close these issues.
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
                      {issue.title || `Issue #${issue.number}`}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      #{issue.number} · {isClosed ? 'Closed' : 'Open'}
                    </div>
                  </div>
                </a>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs max-w-[280px]">
                <div className="font-semibold">{issue.title || `Issue #${issue.number}`}</div>
                <div className="text-muted-foreground mt-0.5">#{issue.number} · {isClosed ? 'Closed' : 'Open'}</div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </SidebarSection>
  );
}
