"use client";

import React from "react";
import { useTranslations } from "next-intl";

import {
  gitApi,
  wsGithubApi,
  wsScriptApi,
  type GithubIssuePayload,
  type GithubPrPayload,
} from "@/api/ws-api";
import type { LinearIssuePayload } from "@atmos/api-types/ws/dto/linear";
import { wsLinearApi } from "@/api/ws/linear-api";
import {
  ensureLinearLocalKeysHydrated,
  getActiveLinearApiKeyForRequest,
  getLinearAuthSelection,
} from "@/features/settings/lib/linear-local-keys";
import type { ComposerHandle } from "@/features/welcome/components/PromptComposer";
import {
  ISSUE_CACHE_TTL_MS,
  issueListCache,
  issueToBranchName,
  issueToWorkspaceName,
  linearIssueToWorkspaceName,
  prToWorkspaceName,
  type RepoContext,
} from "@/features/welcome/lib/welcome-page-helpers";
import {
  useRepoPrListQuery,
  useInvalidateGithubPrs,
} from "@/features/github/hooks/use-github-pr-query";
import {
  useTaskWorkspaceDraftStore,
  type TaskWorkspaceLinearDraft,
} from "@/features/task/store/task-workspace-draft-store";

type LinkType = "none" | "issue" | "pr" | "linear";

/** Non-done Linear workflow types for the welcome picker. */
const LINEAR_OPEN_STATE_TYPES = ["backlog", "unstarted", "started"] as const;

/** Page size for welcome Advanced select lists (GitHub + Linear). */
const WELCOME_LINK_LIST_PAGE = 50;

function linearIssueToDraft(issue: LinearIssuePayload): TaskWorkspaceLinearDraft {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    description: issue.description ?? null,
    priority: issue.priority ?? 0,
    state_name: issue.state_name ?? null,
    state_type: issue.state_type ?? null,
    project_name: issue.project_name ?? null,
    project_id: issue.project_id ?? null,
    team_id: issue.team_id ?? null,
    team_key: issue.team_key ?? null,
    labels: issue.labels ?? [],
    assignee: issue.assignee ?? null,
    github_refs: issue.github_refs ?? [],
    created_at: issue.created_at ?? null,
    updated_at: issue.updated_at ?? null,
  };
}

export function useWelcomeProjectContext({
  branchTouchedRef,
  clearAttachments,
  composerRef,
  generatedBranchRef,
  nameTouchedRef,
  selectedProjectId,
  selectedProjectPath,
  setBranch,
  setBranchError,
  setName,
  setSubmitError,
}: {
  branchTouchedRef: React.MutableRefObject<boolean>;
  clearAttachments: () => void;
  composerRef: React.RefObject<ComposerHandle | null>;
  generatedBranchRef: React.MutableRefObject<string | null>;
  nameTouchedRef: React.MutableRefObject<boolean>;
  selectedProjectId: string | null;
  selectedProjectPath: string | null;
  setBranch: React.Dispatch<React.SetStateAction<string>>;
  setBranchError: React.Dispatch<React.SetStateAction<string | null>>;
  setName: React.Dispatch<React.SetStateAction<string>>;
  setSubmitError: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const t = useTranslations("Welcome.projectContext");
  const [baseBranch, setBaseBranch] = React.useState("main");
  const [baseBranchFilter, setBaseBranchFilter] = React.useState("");
  const [remoteBranches, setRemoteBranches] = React.useState<string[]>([]);
  const [isBaseBranchOpen, setIsBaseBranchOpen] = React.useState(false);

  const [issueUrl, setIssueUrl] = React.useState("");
  const [selectedIssueNumber, setSelectedIssueNumber] = React.useState("");
  const [issuePreview, setIssuePreview] = React.useState<GithubIssuePayload | null>(null);
  const [issues, setIssues] = React.useState<GithubIssuePayload[]>([]);
  const [prUrl, setPrUrl] = React.useState("");
  const [selectedPrNumber, setSelectedPrNumber] = React.useState("");
  const [prPreview, setPrPreview] = React.useState<GithubPrPayload | null>(null);
  const [localPrError, setLocalPrError] = React.useState<string | null>(null);
  const [isPrPreviewLoading, setIsPrPreviewLoading] = React.useState(false);
  const [repoContext, setRepoContext] = React.useState<RepoContext | null>(null);
  const [issueError, setIssueError] = React.useState<string | null>(null);
  const [hasSetupScript, setHasSetupScript] = React.useState(false);
  const [autoExtractTodos, setAutoExtractTodos] = React.useState(false);
  const [autoExtractTodosPr, setAutoExtractTodosPr] = React.useState(false);
  const [linkType, setLinkType] = React.useState<LinkType>("none");
  const [displayedLinkType, setDisplayedLinkType] = React.useState<
    "issue" | "pr" | "linear"
  >("issue");

  const [isBaseBranchesLoading, setIsBaseBranchesLoading] = React.useState(false);
  const [isIssuesLoading, setIsIssuesLoading] = React.useState(false);
  const [isIssuesLoadingMore, setIsIssuesLoadingMore] = React.useState(false);
  const [issuesHasMore, setIssuesHasMore] = React.useState(false);
  const [isIssuePreviewLoading, setIsIssuePreviewLoading] = React.useState(false);
  const [loadedIssueRepoKey, setLoadedIssueRepoKey] = React.useState<string | null>(null);
  const issueLoadSeqRef = React.useRef(0);

  const [linearIssues, setLinearIssues] = React.useState<LinearIssuePayload[]>([]);
  const [linearPreview, setLinearPreview] = React.useState<LinearIssuePayload | null>(
    null,
  );
  const [selectedLinearId, setSelectedLinearId] = React.useState("");
  const [isLinearLoading, setIsLinearLoading] = React.useState(false);
  const [isLinearLoadingMore, setIsLinearLoadingMore] = React.useState(false);
  const [linearHasMore, setLinearHasMore] = React.useState(false);
  const [linearEndCursor, setLinearEndCursor] = React.useState<string | null>(null);
  const [linearError, setLinearError] = React.useState<string | null>(null);
  const [linearConnected, setLinearConnected] = React.useState(false);
  const linearLoadSeqRef = React.useRef(0);

  // PR list: progressive limit (50, 100, …) for Load more in the Advanced select.
  const [prLimit, setPrLimit] = React.useState(WELCOME_LINK_LIST_PAGE);
  const [isPrsLoadingMore, setIsPrsLoadingMore] = React.useState(false);
  const prListQuery = useRepoPrListQuery({
    owner: repoContext?.owner ?? "",
    repo: repoContext?.repo ?? "",
    state: "open",
    limit: prLimit,
    enabled: Boolean(repoContext?.owner && repoContext?.repo),
  });
  const invalidateGithubPrs = useInvalidateGithubPrs();

  const prs = prListQuery.data ?? [];
  const isPrsLoading = Boolean(repoContext) && prListQuery.isFetching && !isPrsLoadingMore;
  const prsHasMore = prs.length >= prLimit;
  const prError =
    localPrError ??
    (prListQuery.error instanceof Error
      ? prListQuery.error.message
      : prListQuery.error
        ? t("errors.loadGithubPrs")
        : null);

  React.useEffect(() => {
    // Reset progressive PR limit when repo changes.
    setPrLimit(WELCOME_LINK_LIST_PAGE);
    setIsPrsLoadingMore(false);
  }, [repoContext?.owner, repoContext?.repo]);

  React.useEffect(() => {
    if (!isPrsLoadingMore) return;
    if (!prListQuery.isFetching) {
      setIsPrsLoadingMore(false);
    }
  }, [isPrsLoadingMore, prListQuery.isFetching]);

  React.useEffect(() => {
    if (linkType !== "none") setDisplayedLinkType(linkType);
  }, [linkType]);

  const clearLinearSelection = React.useCallback(() => {
    setLinearPreview(null);
    setSelectedLinearId("");
    setLinearError(null);
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function loadProjectContext() {
      if (!selectedProjectId || !selectedProjectPath) return;

      setIsBaseBranchesLoading(true);
      setIssueError(null);
      setRepoContext(null);
      setRemoteBranches([]);
      setIssues([]);
      setIssuePreview(null);
      setSelectedIssueNumber("");
      setIssueUrl("");
      issueLoadSeqRef.current += 1;
      setLoadedIssueRepoKey(null);
      setIsIssuesLoading(false);
      setPrPreview(null);
      setSelectedPrNumber("");
      setPrUrl("");
      setLocalPrError(null);
      setHasSetupScript(false);
      setName("");
      setBranch("");
      setAutoExtractTodos(false);
      setAutoExtractTodosPr(false);
      setLinkType("none");
      setBranchError(null);
      setSubmitError(null);
      clearAttachments();
      composerRef.current?.clear();
      nameTouchedRef.current = false;
      branchTouchedRef.current = false;
      generatedBranchRef.current = null;

      try {
        const [fetchedRemoteBranches, scripts, status] = await Promise.all([
          gitApi.listRemoteBranches(selectedProjectPath),
          wsScriptApi.get(selectedProjectId),
          gitApi.getStatus(selectedProjectPath),
        ]);

        if (!cancelled) {
          const nextRemoteBranches = fetchedRemoteBranches.sort();
          setRemoteBranches(nextRemoteBranches);
          if (nextRemoteBranches.includes("main")) {
            setBaseBranch("main");
          } else if (nextRemoteBranches.length > 0) {
            setBaseBranch(nextRemoteBranches[0]);
          } else {
            setBaseBranch("main");
          }
          setHasSetupScript(typeof scripts.setup === "string" && scripts.setup.trim().length > 0);
        }

        if (cancelled) return;

        if (status.github_owner && status.github_repo) {
          setRepoContext({
            owner: status.github_owner,
            repo: status.github_repo,
          });
          // PR list is now owned by TanStack Query (prListQuery above).
          // Setting repoContext enables the query which fetches automatically.
        }
      } catch (error) {
        if (!cancelled) {
          setIssueError(error instanceof Error ? error.message : t("errors.loadProjectContext"));
        }
      } finally {
        if (!cancelled) {
          setIsBaseBranchesLoading(false);
        }
      }
    }

    void loadProjectContext();
    return () => {
      cancelled = true;
    };
  }, [
    branchTouchedRef,
    clearAttachments,
    composerRef,
    generatedBranchRef,
    nameTouchedRef,
    selectedProjectId,
    selectedProjectPath,
    setBranch,
    setBranchError,
    setName,
    setSubmitError,
  ]);

  React.useEffect(() => {
    if (!issuePreview) {
      if (!prPreview) {
        generatedBranchRef.current = null;
      }
      return;
    }

    if (!nameTouchedRef.current) {
      setName(issueToWorkspaceName(issuePreview));
    }
    if (!branchTouchedRef.current) {
      const generated = issueToBranchName(issuePreview);
      generatedBranchRef.current = generated;
      setBranch(generated);
    }
  }, [branchTouchedRef, generatedBranchRef, issuePreview, nameTouchedRef, prPreview, setBranch, setName]);

  React.useEffect(() => {
    if (!prPreview) return;

    if (!nameTouchedRef.current) {
      setName(prToWorkspaceName(prPreview));
    }
    setBranch(prPreview.head_ref);
    if (prPreview.base_ref) {
      setBaseBranch(prPreview.base_ref);
    }
  }, [nameTouchedRef, prPreview, setBranch, setName]);

  React.useEffect(() => {
    if (!linearPreview) return;
    if (!nameTouchedRef.current) {
      setName(linearIssueToWorkspaceName(linearPreview));
    }
    const body = linearPreview.description?.trim();
    if (body && !(composerRef.current?.getText()?.trim())) {
      composerRef.current?.setText(body);
    }
  }, [composerRef, linearPreview, nameTouchedRef, setName]);

  const filteredRemoteBranches = React.useMemo(
    () =>
      remoteBranches.filter((remoteBranch) =>
        remoteBranch.toLowerCase().includes(baseBranchFilter.trim().toLowerCase()),
      ),
    [baseBranchFilter, remoteBranches],
  );

  const clearPrSelection = React.useCallback(() => {
    setPrPreview(null);
    setSelectedPrNumber("");
    setPrUrl("");
    setLocalPrError(null);
    setAutoExtractTodosPr(false);
  }, []);

  const clearIssueSelection = React.useCallback(() => {
    setIssuePreview(null);
    setSelectedIssueNumber("");
    setIssueUrl("");
    setIssueError(null);
    setAutoExtractTodos(false);
  }, []);

  const loadIssues = React.useCallback(
    async (options?: { force?: boolean; loadMore?: boolean }) => {
      if (!repoContext) return;

      const cacheKey = `${repoContext.owner}/${repoContext.repo}`;
      if (!options?.force && !options?.loadMore) {
        const cachedIssues = issueListCache.get(cacheKey);
        if (cachedIssues && cachedIssues.expiresAt > Date.now()) {
          setIssues(cachedIssues.issues);
          setIssuesHasMore(cachedIssues.issues.length >= WELCOME_LINK_LIST_PAGE);
          setLoadedIssueRepoKey(cacheKey);
          return;
        }
        if (loadedIssueRepoKey === cacheKey) return;
      }

      const loadSeq = issueLoadSeqRef.current + 1;
      issueLoadSeqRef.current = loadSeq;
      const nextLimit = options?.loadMore
        ? issues.length + WELCOME_LINK_LIST_PAGE
        : WELCOME_LINK_LIST_PAGE;
      if (options?.loadMore) setIsIssuesLoadingMore(true);
      else setIsIssuesLoading(true);
      setIssueError(null);
      try {
        if (options?.force) {
          issueListCache.delete(cacheKey);
        }
        const fetchedIssues = await wsGithubApi.listIssues({
          ...repoContext,
          state: "open",
          limit: nextLimit,
          sort: "updated",
          direction: "desc",
        });
        if (loadSeq !== issueLoadSeqRef.current) return;
        setIssues(fetchedIssues);
        setIssuesHasMore(fetchedIssues.length >= nextLimit);
        setLoadedIssueRepoKey(cacheKey);
        issueListCache.set(cacheKey, {
          expiresAt: Date.now() + ISSUE_CACHE_TTL_MS,
          issues: fetchedIssues,
        });
      } catch (error) {
        if (loadSeq !== issueLoadSeqRef.current) return;
        setIssueError(error instanceof Error ? error.message : t("errors.loadGithubIssues"));
      } finally {
        if (loadSeq === issueLoadSeqRef.current) {
          setIsIssuesLoading(false);
          setIsIssuesLoadingMore(false);
        }
      }
    },
    [issues.length, loadedIssueRepoKey, repoContext, t],
  );

  const handleSelectLinkType = React.useCallback(
    (next: "issue" | "pr" | "linear") => {
      if (linkType === next) {
        setLinkType("none");
        if (next === "issue") clearIssueSelection();
        else if (next === "pr") clearPrSelection();
        else clearLinearSelection();
        return;
      }
      setLinkType(next);
      if (next === "issue") {
        clearPrSelection();
        clearLinearSelection();
      } else if (next === "pr") {
        clearIssueSelection();
        clearLinearSelection();
      } else {
        clearIssueSelection();
        clearPrSelection();
      }
    },
    [clearIssueSelection, clearLinearSelection, clearPrSelection, linkType],
  );

  React.useEffect(() => {
    if (linkType !== "issue" || !repoContext) return;
    void loadIssues();
  }, [linkType, loadIssues, repoContext]);

  const loadLinearIssues = React.useCallback(
    async (options?: { force?: boolean; loadMore?: boolean }) => {
      const loadSeq = linearLoadSeqRef.current + 1;
      linearLoadSeqRef.current = loadSeq;
      if (options?.loadMore) setIsLinearLoadingMore(true);
      else setIsLinearLoading(true);
      setLinearError(null);
      try {
        await ensureLinearLocalKeysHydrated();
        const sel = getLinearAuthSelection();
        const localKey =
          sel.mode !== "oauth" ? getActiveLinearApiKeyForRequest() : null;
        const status = await wsLinearApi.status({
          linearApiKey: localKey,
        });
        if (loadSeq !== linearLoadSeqRef.current) return;
        const connected = Boolean(status.connected);
        setLinearConnected(connected);
        if (!connected) {
          setLinearIssues([]);
          setLinearHasMore(false);
          setLinearEndCursor(null);
          setLinearError(null);
          return;
        }
        const after =
          options?.loadMore && linearEndCursor ? linearEndCursor : undefined;
        if (options?.loadMore && !after) return;
        const page = await wsLinearApi.issueList({
          state_types: [...LINEAR_OPEN_STATE_TYPES],
          first: WELCOME_LINK_LIST_PAGE,
          after,
        });
        if (loadSeq !== linearLoadSeqRef.current) return;
        const next = page.issues ?? [];
        setLinearIssues((prev) =>
          options?.loadMore
            ? [
                ...prev,
                ...next.filter((n) => !prev.some((p) => p.id === n.id)),
              ]
            : next,
        );
        setLinearHasMore(Boolean(page.has_next_page));
        setLinearEndCursor(page.end_cursor ?? null);
      } catch (error) {
        if (loadSeq !== linearLoadSeqRef.current) return;
        if (!options?.loadMore) {
          setLinearConnected(false);
          setLinearIssues([]);
          setLinearHasMore(false);
          setLinearEndCursor(null);
        }
        setLinearError(
          error instanceof Error ? error.message : t("errors.loadLinearIssues"),
        );
      } finally {
        if (loadSeq === linearLoadSeqRef.current) {
          setIsLinearLoading(false);
          setIsLinearLoadingMore(false);
        }
      }
    },
    [linearEndCursor, t],
  );

  React.useEffect(() => {
    if (linkType !== "linear") return;
    void loadLinearIssues();
  }, [linkType, loadLinearIssues]);

  // Task surface → New Workspace: apply prefills (Linear display name / prompt, optional GitHub link).
  React.useEffect(() => {
    if (!selectedProjectId) return;
    const draft = useTaskWorkspaceDraftStore.getState().peekDraft();
    if (!draft) return;
    // Only apply when draft targets this project (or project was unset and we just selected one).
    if (draft.projectId && draft.projectId !== selectedProjectId) return;
    // GitHub link needs repo context; Linear-only prefills can apply as soon as project is set.
    if (draft.link && !repoContext) return;

    const consumed = useTaskWorkspaceDraftStore.getState().consumeDraft();
    if (!consumed) return;

    // Display name + requirement (Linear / Task prefills). Keep autoExtractTodos off by default.
    if (consumed.displayName?.trim() && !nameTouchedRef.current) {
      nameTouchedRef.current = true;
      setName(consumed.displayName.trim());
    }
    const requirement = consumed.initialRequirement?.trim();
    if (requirement) {
      composerRef.current?.setText(requirement);
    }
    setAutoExtractTodos(false);
    setAutoExtractTodosPr(false);

    const preferLinear = Boolean(consumed.linearIssue);
    const link = consumed.link;

    // Optional GitHub prefill first (Task Linear may attach both).
    if (link && repoContext) {
      const draftRepo = `${link.owner}/${link.repo}`;
      const currentRepo = `${repoContext.owner}/${repoContext.repo}`;
      if (draftRepo !== currentRepo) {
        if (link.kind === "issue" && link.url) {
          if (!preferLinear) setLinkType("issue");
          setIssueUrl(link.url);
          void (async () => {
            try {
              const preview = await wsGithubApi.getIssue({ issueUrl: link.url! });
              setIssuePreview(preview);
              setSelectedIssueNumber(String(preview.number));
              if (!preferLinear) clearPrSelection();
            } catch {
              /* leave URL for manual load */
            }
          })();
        } else if (link.kind === "pr" && link.url) {
          if (!preferLinear) setLinkType("pr");
          setPrUrl(link.url);
          void (async () => {
            try {
              const preview = await wsGithubApi.getPr({ prUrl: link.url! });
              setPrPreview(preview);
              setSelectedPrNumber(String(preview.number));
              if (!preferLinear) clearIssueSelection();
            } catch {
              /* leave URL for manual load */
            }
          })();
        }
      } else if (link.kind === "issue") {
        if (!preferLinear) setLinkType("issue");
        setIssueUrl(
          link.url ??
            `https://github.com/${link.owner}/${link.repo}/issues/${link.number}`,
        );
        void (async () => {
          try {
            const preview = await wsGithubApi.getIssue({
              owner: link.owner,
              repo: link.repo,
              issueNumber: link.number,
            });
            setIssuePreview(preview);
            setSelectedIssueNumber(String(preview.number));
            if (!preferLinear) clearPrSelection();
          } catch {
            /* keep URL for manual fetch */
          }
        })();
      } else {
        if (!preferLinear) setLinkType("pr");
        setPrUrl(
          link.url ??
            `https://github.com/${link.owner}/${link.repo}/pull/${link.number}`,
        );
        void (async () => {
          try {
            const preview = await wsGithubApi.getPr({
              owner: link.owner,
              repo: link.repo,
              prNumber: link.number,
            });
            setPrPreview(preview);
            setSelectedPrNumber(String(preview.number));
            if (!preferLinear) clearIssueSelection();
          } catch {
            /* keep URL for manual fetch */
          }
        })();
      }
    }

    // Linear tab wins when Task → Create carried a Linear issue.
    if (consumed.linearIssue) {
      try {
        sessionStorage.setItem(
          "atmos.pendingLinearLink",
          JSON.stringify(consumed.linearIssue),
        );
      } catch {
        /* ignore */
      }
      setLinkType("linear");
      const draftLinear = consumed.linearIssue;
      setSelectedLinearId(draftLinear.id);
      setLinearPreview({
        id: draftLinear.id,
        identifier: draftLinear.identifier,
        title: draftLinear.title,
        url: draftLinear.url,
        description: draftLinear.description ?? null,
        priority: draftLinear.priority ?? 0,
        state_name: draftLinear.state_name ?? null,
        state_type: draftLinear.state_type ?? null,
        project_name: draftLinear.project_name ?? null,
        project_id: draftLinear.project_id ?? null,
        team_id: draftLinear.team_id ?? null,
        team_key: draftLinear.team_key ?? null,
        labels: draftLinear.labels ?? [],
        assignee: draftLinear.assignee ?? null,
        github_refs: draftLinear.github_refs ?? [],
        created_at: draftLinear.created_at ?? null,
        updated_at: draftLinear.updated_at ?? null,
      });
      void loadLinearIssues();
    }
  }, [
    clearIssueSelection,
    clearPrSelection,
    composerRef,
    loadLinearIssues,
    nameTouchedRef,
    repoContext,
    selectedProjectId,
    setName,
  ]);

  const handleSelectIssue = React.useCallback(
    (value: string) => {
      setSelectedIssueNumber(value);
      setIssueUrl("");
      setIssueError(null);
      setBranchError(null);
      setSubmitError(null);
      setIssuePreview(issues.find((issue) => String(issue.number) === value) ?? null);
      clearPrSelection();
      clearLinearSelection();
    },
    [clearLinearSelection, clearPrSelection, issues, setBranchError, setSubmitError],
  );

  const handleSelectPr = React.useCallback(
    (value: string) => {
      setSelectedPrNumber(value);
      setPrUrl("");
      setLocalPrError(null);
      setBranchError(null);
      setSubmitError(null);
      setPrPreview(prs.find((pr) => String(pr.number) === value) ?? null);
      clearIssueSelection();
      clearLinearSelection();
    },
    [clearIssueSelection, clearLinearSelection, prs, setBranchError, setSubmitError],
  );

  const handleSelectLinear = React.useCallback(
    (value: string) => {
      setSelectedLinearId(value);
      setLinearError(null);
      setBranchError(null);
      setSubmitError(null);
      const found = linearIssues.find((issue) => issue.id === value) ?? null;
      setLinearPreview(found);
      clearIssueSelection();
      clearPrSelection();
      if (found) {
        try {
          sessionStorage.setItem(
            "atmos.pendingLinearLink",
            JSON.stringify(linearIssueToDraft(found)),
          );
        } catch {
          /* ignore */
        }
        // Allow name effect to re-apply when picking from list after a manual name edit? No — only if not touched.
        if (!nameTouchedRef.current) {
          setName(linearIssueToWorkspaceName(found));
        }
      }
    },
    [
      clearIssueSelection,
      clearPrSelection,
      linearIssues,
      nameTouchedRef,
      setBranchError,
      setName,
      setSubmitError,
    ],
  );

  const handleRefreshLinear = React.useCallback(async () => {
    await loadLinearIssues({ force: true });
  }, [loadLinearIssues]);

  const handleLoadPrFromUrl = React.useCallback(async () => {
    if (!prUrl.trim()) {
      setLocalPrError(null);
      return;
    }

    setIsPrPreviewLoading(true);
    setLocalPrError(null);
    setBranchError(null);
    setSubmitError(null);
    setSelectedPrNumber("");

    try {
      const preview = await wsGithubApi.getPr({ prUrl: prUrl.trim() });
      const currentRepo = repoContext ? `${repoContext.owner}/${repoContext.repo}` : null;
      const previewRepo = `${preview.owner}/${preview.repo}`;

      if (currentRepo && currentRepo !== previewRepo) {
        setPrPreview(null);
        setLocalPrError(t("errors.prRepoMismatch", { previewRepo, currentRepo }));
        return;
      }

      setPrPreview(preview);
      clearIssueSelection();
    } catch (error) {
      setPrPreview(null);
      setLocalPrError(error instanceof Error ? error.message : t("errors.loadPrPreview"));
    } finally {
      setIsPrPreviewLoading(false);
    }
  }, [clearIssueSelection, prUrl, repoContext, setBranchError, setSubmitError]);

  const handleLoadIssueFromUrl = React.useCallback(async () => {
    if (!issueUrl.trim()) {
      setIssueError(null);
      return;
    }

    setIsIssuePreviewLoading(true);
    setIssueError(null);
    setBranchError(null);
    setSubmitError(null);
    setSelectedIssueNumber("");

    try {
      const preview = await wsGithubApi.getIssue({ issueUrl: issueUrl.trim() });
      const currentRepo = repoContext ? `${repoContext.owner}/${repoContext.repo}` : null;
      const previewRepo = `${preview.owner}/${preview.repo}`;

      if (currentRepo && currentRepo !== previewRepo) {
        setIssuePreview(null);
        setIssueError(t("errors.issueRepoMismatch", { previewRepo, currentRepo }));
        return;
      }

      setIssuePreview(preview);
      clearPrSelection();
    } catch (error) {
      setIssuePreview(null);
      setIssueError(error instanceof Error ? error.message : t("errors.loadIssuePreview"));
    } finally {
      setIsIssuePreviewLoading(false);
    }
  }, [clearPrSelection, issueUrl, repoContext, setBranchError, setSubmitError]);

  const handleRefreshIssues = React.useCallback(async () => {
    await loadIssues({ force: true });
  }, [loadIssues]);

  const handleLoadMoreIssues = React.useCallback(async () => {
    if (!issuesHasMore || isIssuesLoadingMore || isIssuesLoading) return;
    await loadIssues({ loadMore: true });
  }, [isIssuesLoading, isIssuesLoadingMore, issuesHasMore, loadIssues]);

  const handleLoadMorePrs = React.useCallback(() => {
    if (!prsHasMore || isPrsLoadingMore || prListQuery.isFetching) return;
    setIsPrsLoadingMore(true);
    setPrLimit((prev) => prev + WELCOME_LINK_LIST_PAGE);
  }, [isPrsLoadingMore, prListQuery.isFetching, prsHasMore]);

  const handleLoadMoreLinear = React.useCallback(async () => {
    if (!linearHasMore || isLinearLoadingMore || isLinearLoading) return;
    await loadLinearIssues({ loadMore: true });
  }, [isLinearLoading, isLinearLoadingMore, linearHasMore, loadLinearIssues]);

  const handleRefreshPrs = React.useCallback(() => {
    if (!repoContext) return;
    setLocalPrError(null);
    setPrLimit(WELCOME_LINK_LIST_PAGE);
    setIsPrsLoadingMore(false);
    invalidateGithubPrs({ owner: repoContext.owner, repo: repoContext.repo });
  }, [invalidateGithubPrs, repoContext]);

  return {
    autoExtractTodos,
    autoExtractTodosPr,
    baseBranch,
    baseBranchFilter,
    displayedLinkType,
    filteredRemoteBranches,
    handleLoadIssueFromUrl,
    handleLoadMoreIssues,
    handleLoadMoreLinear,
    handleLoadMorePrs,
    handleLoadPrFromUrl,
    handleRefreshIssues,
    handleRefreshLinear,
    handleRefreshPrs,
    handleSelectIssue,
    handleSelectLinear,
    handleSelectLinkType,
    handleSelectPr,
    hasSetupScript,
    isBaseBranchesLoading,
    isBaseBranchOpen,
    isIssuePreviewLoading,
    isIssuesLoading,
    isIssuesLoadingMore,
    isLinearLoading,
    isLinearLoadingMore,
    isPrPreviewLoading,
    isPrsLoading,
    isPrsLoadingMore,
    issueError,
    issuePreview,
    issues,
    issuesHasMore,
    issueUrl,
    linearConnected,
    linearError,
    linearHasMore,
    linearIssues,
    linearPreview,
    linkType,
    prError,
    prPreview,
    prs,
    prsHasMore,
    prUrl,
    remoteBranches,
    repoContext,
    selectedIssueNumber,
    selectedLinearId,
    selectedPrNumber,
    setAutoExtractTodos,
    setAutoExtractTodosPr,
    setBaseBranch,
    setBaseBranchFilter,
    setIsAdvancedLinkTypeOpen: setLinkType,
    setIsBaseBranchOpen,
    setIssueError,
    setIssuePreview,
    setIssueUrl,
    setPrError: setLocalPrError,
    setPrPreview,
    setPrUrl,
  };
}
