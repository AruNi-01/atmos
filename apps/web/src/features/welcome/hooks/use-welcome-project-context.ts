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
import type { ComposerHandle } from "@/features/welcome/components/PromptComposer";
import {
  ISSUE_CACHE_TTL_MS,
  issueListCache,
  issueToBranchName,
  issueToWorkspaceName,
  prToWorkspaceName,
  type RepoContext,
} from "@/features/welcome/lib/welcome-page-helpers";
import {
  useRepoPrListQuery,
  useInvalidateGithubPrs,
} from "@/features/github/hooks/use-github-pr-query";
import { useTaskWorkspaceDraftStore } from "@/features/task/store/task-workspace-draft-store";

type LinkType = "none" | "issue" | "pr";

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
  const [displayedLinkType, setDisplayedLinkType] = React.useState<"issue" | "pr">("issue");

  const [isBaseBranchesLoading, setIsBaseBranchesLoading] = React.useState(false);
  const [isIssuesLoading, setIsIssuesLoading] = React.useState(false);
  const [isIssuePreviewLoading, setIsIssuePreviewLoading] = React.useState(false);
  const [loadedIssueRepoKey, setLoadedIssueRepoKey] = React.useState<string | null>(null);
  const issueLoadSeqRef = React.useRef(0);

  // PR list is owned by TanStack Query. Query is enabled only when repoContext is set;
  // the key changes with repoContext so old data is naturally discarded on project switch.
  const prListQuery = useRepoPrListQuery({
    owner: repoContext?.owner ?? "",
    repo: repoContext?.repo ?? "",
    enabled: Boolean(repoContext?.owner && repoContext?.repo),
  });
  const invalidateGithubPrs = useInvalidateGithubPrs();

  const prs = prListQuery.data ?? [];
  const isPrsLoading = Boolean(repoContext) && prListQuery.isFetching;
  const prError =
    localPrError ??
    (prListQuery.error instanceof Error
      ? prListQuery.error.message
      : prListQuery.error
        ? t("errors.loadGithubPrs")
        : null);

  React.useEffect(() => {
    if (linkType !== "none") setDisplayedLinkType(linkType);
  }, [linkType]);

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
    async (options?: { force?: boolean }) => {
      if (!repoContext) return;

      const cacheKey = `${repoContext.owner}/${repoContext.repo}`;
      if (!options?.force) {
        const cachedIssues = issueListCache.get(cacheKey);
        if (cachedIssues && cachedIssues.expiresAt > Date.now()) {
          setIssues(cachedIssues.issues);
          setLoadedIssueRepoKey(cacheKey);
          return;
        }
        if (loadedIssueRepoKey === cacheKey) return;
      }

      const loadSeq = issueLoadSeqRef.current + 1;
      issueLoadSeqRef.current = loadSeq;
      setIsIssuesLoading(true);
      setIssueError(null);
      try {
        if (options?.force) {
          issueListCache.delete(cacheKey);
        }
        const fetchedIssues = await wsGithubApi.listIssues(repoContext);
        if (loadSeq !== issueLoadSeqRef.current) return;
        setIssues(fetchedIssues);
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
        }
      }
    },
    [loadedIssueRepoKey, repoContext],
  );

  const handleSelectLinkType = React.useCallback(
    (next: "issue" | "pr") => {
      if (linkType === next) {
        setLinkType("none");
        if (next === "issue") clearIssueSelection();
        else clearPrSelection();
        return;
      }
      setLinkType(next);
      if (next === "issue") {
        clearPrSelection();
      } else {
        clearIssueSelection();
      }
    },
    [clearIssueSelection, clearPrSelection, linkType],
  );

  React.useEffect(() => {
    if (linkType !== "issue" || !repoContext) return;
    void loadIssues();
  }, [linkType, loadIssues, repoContext]);

  // Task surface → New Workspace: apply prefilled Issue/PR once repo context is ready.
  React.useEffect(() => {
    if (!selectedProjectId || !repoContext) return;
    const draft = useTaskWorkspaceDraftStore.getState().peekDraft();
    if (!draft) return;
    // Only apply when draft targets this project (or project was unset and we just selected one).
    if (draft.projectId && draft.projectId !== selectedProjectId) return;
    const consumed = useTaskWorkspaceDraftStore.getState().consumeDraft();
    if (!consumed) return;

    const link = consumed.link;
    const draftRepo = `${link.owner}/${link.repo}`;
    const currentRepo = `${repoContext.owner}/${repoContext.repo}`;
    if (draftRepo !== currentRepo) {
      // Different remote than the selected project — still open advanced link via URL when possible.
      if (link.kind === "issue" && link.url) {
        setLinkType("issue");
        setIssueUrl(link.url);
        void (async () => {
          try {
            const preview = await wsGithubApi.getIssue({ issueUrl: link.url! });
            setIssuePreview(preview);
            setSelectedIssueNumber(String(preview.number));
            clearPrSelection();
          } catch {
            // leave URL for manual load
          }
        })();
      } else if (link.kind === "pr" && link.url) {
        setLinkType("pr");
        setPrUrl(link.url);
        void (async () => {
          try {
            const preview = await wsGithubApi.getPr({ prUrl: link.url! });
            setPrPreview(preview);
            setSelectedPrNumber(String(preview.number));
            clearIssueSelection();
          } catch {
            // leave URL for manual load
          }
        })();
      }
      return;
    }

    if (link.kind === "issue") {
      setLinkType("issue");
      setIssueUrl(
        link.url ?? `https://github.com/${link.owner}/${link.repo}/issues/${link.number}`,
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
          clearPrSelection();
        } catch {
          // keep URL for manual fetch
        }
      })();
      return;
    }

    setLinkType("pr");
    setPrUrl(link.url ?? `https://github.com/${link.owner}/${link.repo}/pull/${link.number}`);
    void (async () => {
      try {
        const preview = await wsGithubApi.getPr({
          owner: link.owner,
          repo: link.repo,
          prNumber: link.number,
        });
        setPrPreview(preview);
        setSelectedPrNumber(String(preview.number));
        clearIssueSelection();
      } catch {
        // keep URL for manual fetch
      }
    })();
  }, [clearIssueSelection, clearPrSelection, repoContext, selectedProjectId]);

  const handleSelectIssue = React.useCallback(
    (value: string) => {
      setSelectedIssueNumber(value);
      setIssueUrl("");
      setIssueError(null);
      setBranchError(null);
      setSubmitError(null);
      setIssuePreview(issues.find((issue) => String(issue.number) === value) ?? null);
      clearPrSelection();
    },
    [clearPrSelection, issues, setBranchError, setSubmitError],
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
    },
    [clearIssueSelection, prs, setBranchError, setSubmitError],
  );

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

  const handleRefreshPrs = React.useCallback(() => {
    if (!repoContext) return;
    setLocalPrError(null);
    invalidateGithubPrs({ owner: repoContext.owner, repo: repoContext.repo });
  }, [invalidateGithubPrs, repoContext]);

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

  return {
    autoExtractTodos,
    autoExtractTodosPr,
    baseBranch,
    baseBranchFilter,
    displayedLinkType,
    filteredRemoteBranches,
    handleLoadIssueFromUrl,
    handleLoadPrFromUrl,
    handleRefreshIssues,
    handleRefreshPrs,
    handleSelectIssue,
    handleSelectLinkType,
    handleSelectPr,
    hasSetupScript,
    isBaseBranchesLoading,
    isBaseBranchOpen,
    isIssuePreviewLoading,
    isIssuesLoading,
    isPrPreviewLoading,
    isPrsLoading,
    issueError,
    issuePreview,
    issues,
    issueUrl,
    linkType,
    prError,
    prPreview,
    prs,
    prUrl,
    remoteBranches,
    repoContext,
    selectedIssueNumber,
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
