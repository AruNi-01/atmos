import {
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui';
import { CloudDownload, ExternalLink, GitBranch, Loader2, Sparkles } from 'lucide-react';
import type { GithubIssuePayload, GithubPrPayload } from '@/api/ws-api';
import type { RepoContext } from '@/features/workspace/components/CreateWorkspaceDialogTypes';

interface IssueLinkPanelProps {
  repoContext: RepoContext | null;
  selectedProjectId: string | null;
  isPreselectedIssue: boolean;
  issues: GithubIssuePayload[];
  selectedIssueNumber: string;
  issueUrl: string;
  issueError: string | null;
  isIssuesLoading: boolean;
  isIssuePreviewLoading: boolean;
  issuePreview: GithubIssuePayload | null;
  issueBodyPreview: string;
  autoExtractTodos: boolean;
  canAutoExtractTodos: boolean;
  autoExtractDescription: string;
  onSelectIssue: (value: string) => void;
  onIssueUrlChange: (value: string) => void;
  onLoadIssueFromUrl: () => void;
  onAutoExtractTodosChange: (checked: boolean | 'indeterminate') => void;
}

export function IssueLinkPanel({
  repoContext,
  selectedProjectId,
  isPreselectedIssue,
  issues,
  selectedIssueNumber,
  issueUrl,
  issueError,
  isIssuesLoading,
  isIssuePreviewLoading,
  issuePreview,
  issueBodyPreview,
  autoExtractTodos,
  canAutoExtractTodos,
  autoExtractDescription,
  onSelectIssue,
  onIssueUrlChange,
  onLoadIssueFromUrl,
  onAutoExtractTodosChange,
}: IssueLinkPanelProps) {
  return (
    <div className="border-t border-border">
      <div className="space-y-4 px-6 py-5">
        {repoContext ? (
          <>
            <div className="grid gap-2">
              <Label htmlFor="issue-select">
                {isPreselectedIssue ? 'Linked GitHub Issue' : 'Select from repository'}
              </Label>
              <Select
                value={selectedIssueNumber}
                onValueChange={onSelectIssue}
                disabled={isPreselectedIssue || (!isIssuesLoading && issues.length === 0)}
              >
                <SelectTrigger
                  id="issue-select"
                  className="w-full min-w-0 [&>span]:flex [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate"
                >
                  <SelectValue
                    placeholder={
                      isIssuesLoading ? 'Loading issues...' : issues.length === 0 ? 'No issues available' : 'Select issue'
                    }
                  />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {issues.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No GitHub issues found
                    </div>
                  ) : (
                    issues.map((issue) => (
                      <SelectItem key={issue.number} value={String(issue.number)}>
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            #{issue.number}
                          </span>
                          <span className="truncate">{issue.title}</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="issue-url">Or paste issue URL</Label>
              <div className="flex gap-2">
                <Input
                  id="issue-url"
                  value={issueUrl}
                  onChange={(event) => onIssueUrlChange(event.target.value)}
                  placeholder={`https://github.com/${repoContext.owner}/${repoContext.repo}/issues/40`}
                  disabled={isPreselectedIssue}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={onLoadIssueFromUrl}
                  disabled={isIssuePreviewLoading || !issueUrl.trim() || isPreselectedIssue}
                  title="Load issue"
                >
                  {isIssuePreviewLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CloudDownload className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          </>
        ) : selectedProjectId ? (
          <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            This project does not expose a GitHub remote, so issue import is unavailable.
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            Select a project first to load GitHub issue sync.
          </div>
        )}

        {issueError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {issueError}
          </div>
        )}

        {isIssuePreviewLoading ? (
          <div className="flex items-center gap-2 rounded-md border border-border px-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading issue preview
          </div>
        ) : issuePreview ? (
          <Card className="border-border bg-muted/20">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {issuePreview.owner}/{issuePreview.repo}#{issuePreview.number}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 gap-1 rounded-md px-2 text-[11px]"
                      onClick={() => window.open(issuePreview.url, '_blank', 'noopener,noreferrer')}
                    >
                      <ExternalLink className="size-3" />
                      Open on GitHub
                    </Button>
                  </div>
                  <h3 className="mt-1 truncate text-sm font-medium text-foreground">
                    {issuePreview.title}
                  </h3>
                </div>
                <Badge variant="secondary" className="capitalize shrink-0">
                  {issuePreview.state}
                </Badge>
              </div>

              {issuePreview.labels.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {issuePreview.labels.map((label) => (
                    <Badge key={label.name} variant="outline">
                      {label.name}
                    </Badge>
                  ))}
                </div>
              )}

              <p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground line-clamp-6">
                {issueBodyPreview}
              </p>
            </CardContent>
          </Card>
        ) : null}

        <label className="flex items-center gap-3 rounded-md border border-border px-3 py-3 text-sm">
          <Checkbox
            checked={autoExtractTodos}
            onCheckedChange={onAutoExtractTodosChange}
            disabled={!canAutoExtractTodos}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <Sparkles className="size-4 text-muted-foreground" />
              Auto-extract TODOs with LLM
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{autoExtractDescription}</p>
          </div>
        </label>
      </div>
    </div>
  );
}

interface PrLinkPanelProps {
  repoContext: RepoContext | null;
  selectedProjectId: string | null;
  prs: GithubPrPayload[];
  selectedPrNumber: string;
  prUrl: string;
  prError: string | null;
  isPrsLoading: boolean;
  isPrPreviewLoading: boolean;
  prPreview: GithubPrPayload | null;
  autoExtractTodosPr: boolean;
  canAutoExtractTodos: boolean;
  autoExtractDescription: string;
  onSelectPr: (value: string) => void;
  onPrUrlChange: (value: string) => void;
  onLoadPrFromUrl: () => void;
  onAutoExtractTodosChange: (checked: boolean | 'indeterminate') => void;
}

export function PrLinkPanel({
  repoContext,
  selectedProjectId,
  prs,
  selectedPrNumber,
  prUrl,
  prError,
  isPrsLoading,
  isPrPreviewLoading,
  prPreview,
  autoExtractTodosPr,
  canAutoExtractTodos,
  autoExtractDescription,
  onSelectPr,
  onPrUrlChange,
  onLoadPrFromUrl,
  onAutoExtractTodosChange,
}: PrLinkPanelProps) {
  return (
    <div className="border-t border-border">
      <div className="space-y-4 px-6 py-5">
        {repoContext ? (
          <>
            <div className="grid gap-2">
              <Label htmlFor="pr-select">Select from repository</Label>
              <Select
                value={selectedPrNumber}
                onValueChange={onSelectPr}
                disabled={!isPrsLoading && prs.length === 0}
              >
                <SelectTrigger
                  id="pr-select"
                  className="w-full min-w-0 [&>span]:flex [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate"
                >
                  <SelectValue
                    placeholder={
                      isPrsLoading ? 'Loading PRs...' : prs.length === 0 ? 'No PRs available' : 'Select PR'
                    }
                  />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {prs.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No GitHub PRs found
                    </div>
                  ) : (
                    prs.map((pr) => (
                      <SelectItem key={pr.number} value={String(pr.number)}>
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            #{pr.number}
                          </span>
                          <span className="truncate">{pr.title}</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="pr-url">Or paste PR URL</Label>
              <div className="flex gap-2">
                <Input
                  id="pr-url"
                  value={prUrl}
                  onChange={(event) => onPrUrlChange(event.target.value)}
                  placeholder={`https://github.com/${repoContext.owner}/${repoContext.repo}/pull/40`}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={onLoadPrFromUrl}
                  disabled={isPrPreviewLoading || !prUrl.trim()}
                  title="Load PR"
                >
                  {isPrPreviewLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CloudDownload className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          </>
        ) : selectedProjectId ? (
          <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            This project does not expose a GitHub remote, so PR import is unavailable.
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            Select a project first to load GitHub PRs.
          </div>
        )}

        {prError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {prError}
          </div>
        )}

        {isPrPreviewLoading ? (
          <div className="flex items-center gap-2 rounded-md border border-border px-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading PR preview
          </div>
        ) : prPreview ? (
          <Card className="border-border bg-muted/20">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {prPreview.owner}/{prPreview.repo}#{prPreview.number}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 gap-1 rounded-md px-2 text-[11px]"
                      onClick={() => window.open(prPreview.url, '_blank', 'noopener,noreferrer')}
                    >
                      <ExternalLink className="size-3" />
                      Open on GitHub
                    </Button>
                  </div>
                  <h3 className="mt-1 truncate text-sm font-medium text-foreground">
                    {prPreview.title}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <GitBranch className="size-3" />
                      {prPreview.head_ref}
                    </span>
                    <span className="opacity-50">→</span>
                    <span className="inline-flex items-center gap-1">
                      <GitBranch className="size-3" />
                      {prPreview.base_ref}
                    </span>
                  </div>
                </div>
                <Badge variant="secondary" className="capitalize shrink-0">
                  {prPreview.is_draft ? 'draft' : prPreview.state}
                </Badge>
              </div>

              {prPreview.labels.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {prPreview.labels.map((label) => (
                    <Badge key={label.name} variant="outline">
                      {label.name}
                    </Badge>
                  ))}
                </div>
              )}

              <p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground line-clamp-6">
                {prPreview.body?.trim() || 'No PR description provided.'}
              </p>

              <div className="rounded-md border border-border bg-background/40 px-3 py-2 text-[11px] text-muted-foreground">
                The workspace will reuse{' '}
                <span className="font-mono text-foreground">{prPreview.head_ref}</span> directly
                — no new branch will be created.
              </div>
            </CardContent>
          </Card>
        ) : null}

        <label className="flex items-center gap-3 rounded-md border border-border px-3 py-3 text-sm">
          <Checkbox
            checked={autoExtractTodosPr}
            onCheckedChange={onAutoExtractTodosChange}
            disabled={!canAutoExtractTodos}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <Sparkles className="size-4 text-muted-foreground" />
              Auto-extract TODOs with LLM
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{autoExtractDescription}</p>
          </div>
        </label>
      </div>
    </div>
  );
}
