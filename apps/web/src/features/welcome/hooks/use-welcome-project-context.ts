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
  linearIssueToBranchName,
  linearIssueToWorkspaceName,
  prToWorkspaceName,
  type RepoContext,
} from "@/features/welcome/lib/welcome-page-helpers";
import {
  LINEAR_OPEN_STATE_TYPES,
  WELCOME_LINK_LIST_PAGE,
  linearIssueToDraft,
} from "@/features/welcome/lib/welcome-linear-link";
import { writePendingLinearLink } from "@/features/task/lib/pending-linear-link";
import {
  useRepoPrListQuery,
  useInvalidateGithubPrs,
} from "@/features/github/hooks/use-github-pr-query";
import {
  useTaskWorkspaceDraftStore,
} from "@/features/task/store/task-workspace-draft-store";

type LinkType = "none" | "issue" | "pr" | "linear";

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
  /**
   * Snapshot of Task → Create prefills so project context reloads do not wipe
   * name / branch / Linear / GitHub selection after the draft store is consumed.
   */
  const taskPrefillRef = React.useRef<{
    createdAt: number;
    name: string | null;
    branch: string | null;
    requirement: string | null;
    linear: LinearIssuePayload | null;
    issue: GithubIssuePayload | null;
    pr: GithubPrPayload | null;
    coreApplied: boolean;
    linkApplied: boolean;
  } | null>(null);

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

      const prefill = taskPrefillRef.current;
      const preserveTaskPrefill = Boolean(
        prefill?.coreApplied &&
          (prefill.linear || prefill.issue || prefill.pr || prefill.name),
      );

      setIsBaseBranchesLoading(true);
      setIssueError(null);
      setRepoContext(null);
      setRemoteBranches([]);
      setIssues([]);
      issueLoadSeqRef.current += 1;
      setLoadedIssueRepoKey(null);
      setIsIssuesLoading(false);
      setLocalPrError(null);
      setHasSetupScript(false);
      setAutoExtractTodos(false);
      setAutoExtractTodosPr(false);
      setBranchError(null);
      setSubmitError(null);
      clearAttachments();

      if (preserveTaskPrefill && prefill) {
        // Keep Task → Create prefills (Linear and/or GitHub) across project pick / reload.
        if (prefill.name && !nameTouchedRef.current) {
          setName(prefill.name);
        }
        if (prefill.branch && !branchTouchedRef.current) {
          generatedBranchRef.current = prefill.branch;
          setBranch(prefill.branch);
        }
        if (prefill.requirement) {
          composerRef.current?.setText(prefill.requirement);
        }
        if (prefill.linear) {
          setLinkType("linear");
          setSelectedLinearId(prefill.linear.id);
          setLinearPreview(prefill.linear);
        } else if (prefill.pr) {
          setLinkType("pr");
        } else if (prefill.issue) {
          setLinkType("issue");
        }
        if (prefill.issue) {
          setIssuePreview(prefill.issue);
          setSelectedIssueNumber(String(prefill.issue.number));
          setIssueUrl(prefill.issue.url);
        } else {
          setIssuePreview(null);
          setSelectedIssueNumber("");
          setIssueUrl("");
        }
        if (prefill.pr) {
          setPrPreview(prefill.pr);
          setSelectedPrNumber(String(prefill.pr.number));
          setPrUrl(prefill.pr.url);
        } else {
          setPrPreview(null);
          setSelectedPrNumber("");
          setPrUrl("");
        }
      } else {
        setName("");
        setBranch("");
        setLinkType("none");
        setIssuePreview(null);
        setSelectedIssueNumber("");
        setIssueUrl("");
        setPrPreview(null);
        setSelectedPrNumber("");
        setPrUrl("");
        composerRef.current?.clear();
        nameTouchedRef.current = false;
        branchTouchedRef.current = false;
        generatedBranchRef.current = null;
      }

      try {
        const [fetchedRemoteBranches, projectScripts, status] = await Promise.all([
          gitApi.listRemoteBranches(selectedProjectPath),
          wsScriptApi.get(selectedProjectId),
          gitApi.getStatus(selectedProjectPath),
        ]);
        const scripts = projectScripts.scripts;

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
      if (!prPreview && !linearPreview) {
        generatedBranchRef.current = null;
      }
      return;
    }
    // When Linear or PR is also bound, they own name/branch; keep the GitHub issue link only.
    if (linearPreview || prPreview) return;

    if (!nameTouchedRef.current) {
      setName(issueToWorkspaceName(issuePreview));
    }
    if (!branchTouchedRef.current) {
      const generated = issueToBranchName(issuePreview);
      generatedBranchRef.current = generated;
      setBranch(generated);
    }
  }, [
    branchTouchedRef,
    generatedBranchRef,
    issuePreview,
    linearPreview,
    nameTouchedRef,
    prPreview,
    setBranch,
    setName,
  ]);

  React.useEffect(() => {
    if (!prPreview) return;

    // PR head branch wins even when Linear is co-bound (real git ref).
    if (!nameTouchedRef.current && !linearPreview) {
      setName(prToWorkspaceName(prPreview));
    }
    setBranch(prPreview.head_ref);
    if (prPreview.base_ref) {
      setBaseBranch(prPreview.base_ref);
    }
  }, [linearPreview, nameTouchedRef, prPreview, setBranch, setName]);

  React.useEffect(() => {
    if (!linearPreview) return;
    if (!nameTouchedRef.current) {
      setName(linearIssueToWorkspaceName(linearPreview));
    }
    // PR owns branch when co-bound; otherwise generate from Linear identifier.
    if (!branchTouchedRef.current && !prPreview) {
      const generated = linearIssueToBranchName(linearPreview);
      generatedBranchRef.current = generated;
      setBranch(generated);
    }
    // Do not prefill composer with Linear description (parity with GitHub issue create).
  }, [
    branchTouchedRef,
    generatedBranchRef,
    linearPreview,
    nameTouchedRef,
    prPreview,
    setBranch,
    setName,
  ]);

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
      // Click active tab → unlink that source only (GitHub ↔ Linear may coexist).
      if (linkType === next) {
        setLinkType("none");
        if (next === "issue") clearIssueSelection();
        else if (next === "pr") clearPrSelection();
        else clearLinearSelection();
        return;
      }
      setLinkType(next);
      // Issue and PR stay exclusive; Linear is independent of both.
      if (next === "issue") {
        clearPrSelection();
      } else if (next === "pr") {
        clearIssueSelection();
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

  // Task surface → New Workspace: apply prefills (Linear name/branch/labels/prompt, optional GitHub link).
  // Core Linear fields apply immediately (no Atmos project required). GitHub link waits for repo context.
  React.useEffect(() => {
    const draft = useTaskWorkspaceDraftStore.getState().peekDraft();
    if (!draft) return;

    // Draft bound to a specific project (GitHub create) — wait until that project is selected.
    if (draft.projectId) {
      if (!selectedProjectId || draft.projectId !== selectedProjectId) return;
    }

    const existing = taskPrefillRef.current;
    const coreAlreadyApplied =
      existing?.createdAt === draft.createdAt && existing.coreApplied;

    const preferLinear = Boolean(draft.linearIssue);
    const link = draft.link ?? null;

    // --- Core prefills (name, branch, requirement, Linear preview) — once per draft ---
    if (!coreAlreadyApplied) {
      const linkForName = draft.link ?? null;
      const displayName =
        draft.displayName?.trim() ||
        (draft.linearIssue
          ? linearIssueToWorkspaceName(draft.linearIssue)
          : linkForName?.kind === "issue"
            ? issueToWorkspaceName({
                number: linkForName.number,
                title: linkForName.title?.trim() || "",
              })
            : linkForName?.kind === "pr"
              ? prToWorkspaceName({
                  number: linkForName.number,
                  title: linkForName.title?.trim() || "",
                })
              : null);

      // Name/branch/links only — never seed the composer prompt from issue/PR body
      // (matches GitHub Task → Create; description is not auto-pasted into the prompt).
      const requirement = draft.initialRequirement?.trim() || null;

      let linearPayload: LinearIssuePayload | null = null;
      if (draft.linearIssue) {
        const draftLinear = draft.linearIssue;
        linearPayload = {
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
        };
        writePendingLinearLink(draftLinear);
      }

      let generatedBranch: string | null = null;
      if (!branchTouchedRef.current) {
        if (linearPayload) {
          generatedBranch = linearIssueToBranchName(linearPayload);
        } else if (linkForName?.kind === "pr" && linkForName.head_ref?.trim()) {
          generatedBranch = linkForName.head_ref.trim();
        } else if (linkForName?.kind === "issue") {
          generatedBranch = issueToBranchName({ number: linkForName.number });
        }
      }

      // Seed a lightweight GitHub preview from the draft so labels/status apply
      // before the network getIssue/getPr round-trip finishes.
      let seededIssue: GithubIssuePayload | null = null;
      let seededPr: GithubPrPayload | null = null;
      if (linkForName?.kind === "issue") {
        seededIssue = {
          owner: linkForName.owner,
          repo: linkForName.repo,
          number: linkForName.number,
          title: linkForName.title?.trim() || `Issue #${linkForName.number}`,
          body: linkForName.body ?? null,
          url:
            linkForName.url ??
            `https://github.com/${linkForName.owner}/${linkForName.repo}/issues/${linkForName.number}`,
          state: linkForName.state ?? "open",
          comments_count: 0,
          labels: (linkForName.labels ?? []).map((l) => ({
            name: l.name,
            color: l.color ?? null,
            description: null,
          })),
          assignees: [],
        };
      } else if (linkForName?.kind === "pr") {
        seededPr = {
          owner: linkForName.owner,
          repo: linkForName.repo,
          number: linkForName.number,
          title: linkForName.title?.trim() || `PR #${linkForName.number}`,
          body: linkForName.body ?? null,
          url:
            linkForName.url ??
            `https://github.com/${linkForName.owner}/${linkForName.repo}/pull/${linkForName.number}`,
          state: linkForName.state ?? "open",
          head_ref: linkForName.head_ref?.trim() || "",
          base_ref: linkForName.base_ref?.trim() || "",
          is_draft: Boolean(linkForName.is_draft),
          labels: (linkForName.labels ?? []).map((l) => ({
            name: l.name,
            color: l.color ?? null,
            description: null,
          })),
        };
      }

      taskPrefillRef.current = {
        createdAt: draft.createdAt,
        name: displayName,
        branch: generatedBranch,
        requirement,
        linear: linearPayload,
        issue: seededIssue,
        pr: seededPr,
        coreApplied: true,
        linkApplied: false,
      };

      setAutoExtractTodos(false);
      setAutoExtractTodosPr(false);

      if (displayName && !nameTouchedRef.current) {
        // Do not mark name touched — keep auto-sync if preview effects re-run.
        setName(displayName);
      }
      if (generatedBranch && !branchTouchedRef.current) {
        generatedBranchRef.current = generatedBranch;
        setBranch(generatedBranch);
        if (linkForName?.kind === "pr" && linkForName.base_ref?.trim()) {
          setBaseBranch(linkForName.base_ref.trim());
        }
      }
      if (requirement) {
        composerRef.current?.setText(requirement);
      }
      if (linearPayload) {
        setLinkType("linear");
        setSelectedLinearId(linearPayload.id);
        setLinearPreview(linearPayload);
        void loadLinearIssues();
      } else if (seededPr) {
        setLinkType("pr");
      } else if (seededIssue) {
        setLinkType("issue");
      }

      if (seededIssue) {
        setSelectedIssueNumber(String(seededIssue.number));
        setIssueUrl(seededIssue.url);
        setIssuePreview(seededIssue);
        clearPrSelection();
      } else if (seededPr) {
        setSelectedPrNumber(String(seededPr.number));
        setPrUrl(seededPr.url);
        setPrPreview(seededPr);
        clearIssueSelection();
      }

      // Linear-only (or name-only) draft: consume immediately so remounts don't re-apply.
      if (!link) {
        useTaskWorkspaceDraftStore.getState().consumeDraft();
        return;
      }
    }

    // --- Optional GitHub link refresh: needs project repo context for full payload ---
    if (!link) return;
    if (taskPrefillRef.current?.linkApplied) return;
    if (!selectedProjectId || !repoContext) return;
    if (draft.projectId && draft.projectId !== selectedProjectId) return;

    useTaskWorkspaceDraftStore.getState().consumeDraft();
    if (taskPrefillRef.current) {
      taskPrefillRef.current = {
        ...taskPrefillRef.current,
        linkApplied: true,
      };
    }

    // Always attach GitHub when present (coexists with Linear). Issue ↔ PR exclusive.
    const rememberGithubPrefill = (
      next: { issue?: GithubIssuePayload | null; pr?: GithubPrPayload | null },
    ) => {
      if (!taskPrefillRef.current) return;
      taskPrefillRef.current = {
        ...taskPrefillRef.current,
        issue:
          next.issue !== undefined ? next.issue : taskPrefillRef.current.issue,
        pr: next.pr !== undefined ? next.pr : taskPrefillRef.current.pr,
      };
    };

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
            clearPrSelection();
            rememberGithubPrefill({ issue: preview, pr: null });
          } catch {
            /* leave URL / seed preview for manual load */
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
            clearIssueSelection();
            rememberGithubPrefill({ pr: preview, issue: null });
          } catch {
            /* leave URL / seed preview for manual load */
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
          clearPrSelection();
          rememberGithubPrefill({ issue: preview, pr: null });
        } catch {
          /* keep seed preview */
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
          clearIssueSelection();
          rememberGithubPrefill({ pr: preview, issue: null });
        } catch {
          /* keep seed preview */
        }
      })();
    }
  }, [
    branchTouchedRef,
    clearIssueSelection,
    clearPrSelection,
    composerRef,
    generatedBranchRef,
    loadLinearIssues,
    nameTouchedRef,
    repoContext,
    selectedProjectId,
    setBranch,
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
      // Issue/PR exclusive; keep Linear if also bound.
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
      // Issue/PR exclusive; keep Linear if also bound.
      clearIssueSelection();
    },
    [clearIssueSelection, prs, setBranchError, setSubmitError],
  );

  const handleSelectLinear = React.useCallback(
    (value: string) => {
      setSelectedLinearId(value);
      setLinearError(null);
      setBranchError(null);
      setSubmitError(null);
      const found = linearIssues.find((issue) => issue.id === value) ?? null;
      setLinearPreview(found);
      // Linear can coexist with GitHub issue/PR — do not clear them.
      if (found) {
        writePendingLinearLink(linearIssueToDraft(found));
        // Allow name/branch effects to re-apply when picking from list only if not touched.
        if (!nameTouchedRef.current) {
          setName(linearIssueToWorkspaceName(found));
        }
        if (!branchTouchedRef.current && !prPreview) {
          const generated = linearIssueToBranchName(found);
          generatedBranchRef.current = generated;
          setBranch(generated);
        }
      }
    },
    [
      branchTouchedRef,
      generatedBranchRef,
      linearIssues,
      nameTouchedRef,
      prPreview,
      setBranch,
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
