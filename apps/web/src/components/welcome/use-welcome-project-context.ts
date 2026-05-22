"use client";

import React from "react";

import {
  gitApi,
  wsGithubApi,
  wsScriptApi,
  type GithubIssuePayload,
  type GithubPrPayload,
} from "@/api/ws-api";
import type { ComposerHandle } from "@/components/welcome/PromptComposer";
import {
  ISSUE_CACHE_TTL_MS,
  issueListCache,
  issueToBranchName,
  issueToWorkspaceName,
  prListCache,
  prToWorkspaceName,
  type RepoContext,
} from "@/components/welcome/welcome-page-helpers";

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
  const [prs, setPrs] = React.useState<GithubPrPayload[]>([]);
  const [prError, setPrError] = React.useState<string | null>(null);
  const [isPrsLoading, setIsPrsLoading] = React.useState(false);
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
      setPrs([]);
      setPrPreview(null);
      setSelectedPrNumber("");
      setPrUrl("");
      setPrError(null);
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
        const fetchedRemoteBranches = await gitApi.listRemoteBranches(selectedProjectPath);
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
        }

        const scripts = await wsScriptApi.get(selectedProjectId);
        if (!cancelled) {
          setHasSetupScript(typeof scripts.setup === "string" && scripts.setup.trim().length > 0);
        }

        const status = await gitApi.getStatus(selectedProjectPath);
        if (cancelled) return;

        if (status.github_owner && status.github_repo) {
          const nextContext = {
            owner: status.github_owner,
            repo: status.github_repo,
          };
          setRepoContext(nextContext);

          const cacheKey = `${nextContext.owner}/${nextContext.repo}`;
          const cachedIssues = issueListCache.get(cacheKey);
          if (cachedIssues && cachedIssues.expiresAt > Date.now()) {
            setIssues(cachedIssues.issues);
          } else {
            setIsIssuesLoading(true);
            const fetchedIssues = await wsGithubApi.listIssues(nextContext);
            if (cancelled) return;
            setIssues(fetchedIssues);
            issueListCache.set(cacheKey, {
              expiresAt: Date.now() + ISSUE_CACHE_TTL_MS,
              issues: fetchedIssues,
            });
          }

          const cachedPrs = prListCache.get(cacheKey);
          if (cachedPrs && cachedPrs.expiresAt > Date.now()) {
            setPrs(cachedPrs.prs);
          } else {
            setIsPrsLoading(true);
            try {
              const fetchedPrs = await wsGithubApi.listPrs(nextContext);
              if (cancelled) return;
              setPrs(fetchedPrs);
              prListCache.set(cacheKey, {
                expiresAt: Date.now() + ISSUE_CACHE_TTL_MS,
                prs: fetchedPrs,
              });
            } catch (error) {
              if (!cancelled) {
                setPrError(
                  error instanceof Error ? error.message : "Failed to load GitHub PRs",
                );
              }
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          setIssueError(error instanceof Error ? error.message : "Failed to load project context");
        }
      } finally {
        if (!cancelled) {
          setIsBaseBranchesLoading(false);
          setIsIssuesLoading(false);
          setIsPrsLoading(false);
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
    setPrError(null);
    setAutoExtractTodosPr(false);
  }, []);

  const clearIssueSelection = React.useCallback(() => {
    setIssuePreview(null);
    setSelectedIssueNumber("");
    setIssueUrl("");
    setIssueError(null);
    setAutoExtractTodos(false);
  }, []);

  const handleSelectLinkType = React.useCallback(
    (next: "issue" | "pr") => {
      if (linkType === next) {
        setLinkType("none");
        if (next === "issue") clearIssueSelection();
        else clearPrSelection();
        return;
      }
      setLinkType(next);
      if (next === "issue") clearPrSelection();
      else clearIssueSelection();
    },
    [clearIssueSelection, clearPrSelection, linkType],
  );

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
      setPrError(null);
      setBranchError(null);
      setSubmitError(null);
      setPrPreview(prs.find((pr) => String(pr.number) === value) ?? null);
      clearIssueSelection();
    },
    [clearIssueSelection, prs, setBranchError, setSubmitError],
  );

  const handleLoadPrFromUrl = React.useCallback(async () => {
    if (!prUrl.trim()) {
      setPrError(null);
      return;
    }

    setIsPrPreviewLoading(true);
    setPrError(null);
    setBranchError(null);
    setSubmitError(null);
    setSelectedPrNumber("");

    try {
      const preview = await wsGithubApi.getPr({ prUrl: prUrl.trim() });
      const currentRepo = repoContext ? `${repoContext.owner}/${repoContext.repo}` : null;
      const previewRepo = `${preview.owner}/${preview.repo}`;

      if (currentRepo && currentRepo !== previewRepo) {
        setPrPreview(null);
        setPrError(`PR belongs to ${previewRepo}, but current project is ${currentRepo}.`);
        return;
      }

      setPrPreview(preview);
      clearIssueSelection();
    } catch (error) {
      setPrPreview(null);
      setPrError(error instanceof Error ? error.message : "Failed to load PR preview");
    } finally {
      setIsPrPreviewLoading(false);
    }
  }, [clearIssueSelection, prUrl, repoContext, setBranchError, setSubmitError]);

  const handleRefreshPrs = React.useCallback(async () => {
    if (!repoContext) return;
    setIsPrsLoading(true);
    setPrError(null);
    try {
      const cacheKey = `${repoContext.owner}/${repoContext.repo}`;
      prListCache.delete(cacheKey);
      const fetchedPrs = await wsGithubApi.listPrs(repoContext);
      setPrs(fetchedPrs);
      prListCache.set(cacheKey, {
        expiresAt: Date.now() + ISSUE_CACHE_TTL_MS,
        prs: fetchedPrs,
      });
    } catch (error) {
      setPrError(error instanceof Error ? error.message : "Failed to refresh GitHub PRs");
    } finally {
      setIsPrsLoading(false);
    }
  }, [repoContext]);

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
        setIssueError(`Issue belongs to ${previewRepo}, but current project is ${currentRepo}.`);
        return;
      }

      setIssuePreview(preview);
      clearPrSelection();
    } catch (error) {
      setIssuePreview(null);
      setIssueError(error instanceof Error ? error.message : "Failed to load issue preview");
    } finally {
      setIsIssuePreviewLoading(false);
    }
  }, [clearPrSelection, issueUrl, repoContext, setBranchError, setSubmitError]);

  const handleRefreshIssues = React.useCallback(async () => {
    if (!repoContext) return;
    setIsIssuesLoading(true);
    setIssueError(null);
    try {
      const cacheKey = `${repoContext.owner}/${repoContext.repo}`;
      issueListCache.delete(cacheKey);
      const fetchedIssues = await wsGithubApi.listIssues(repoContext);
      setIssues(fetchedIssues);
      issueListCache.set(cacheKey, {
        expiresAt: Date.now() + ISSUE_CACHE_TTL_MS,
        issues: fetchedIssues,
      });
    } catch (error) {
      setIssueError(error instanceof Error ? error.message : "Failed to refresh GitHub issues");
    } finally {
      setIsIssuesLoading(false);
    }
  }, [repoContext]);

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
    setPrError,
    setPrPreview,
    setPrUrl,
  };
}
