"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  ScrollArea,
  cn,
} from "@workspace/ui";
import type { MdLiveEmbedInsertKind, MdLiveCopyFn } from "@atmos/md-live/ui";
import { mdLiveLabel } from "@atmos/md-live/ui";
import { parseGithubResourceUrl, type MdLiveGithubTarget } from "@atmos/md-live";
import { fsApi, gitApi, wsGithubApi } from "@/api/ws-api";
import { flattenFileTreeToCandidates } from "@/features/welcome/lib/welcome-page-helpers";
import {
  filterMentionFileCandidates,
  splitHighlightParts,
} from "@/features/welcome/lib/mention-file-search";
import { scrollActiveListItemIntoView } from "@/features/welcome/lib/popover-list-scroll";
import { fetchLinkPreview } from "@/shared/lib/link-preview-query";
import {
  embedSpecFromGithubTarget,
  embedSpecFromPath,
  markdownFromEmbedSpec,
} from "./insert";
import { MdLivePathIcon } from "./path-icon";
import { GithubIssueStatusIcon, GithubPrStatusIcon } from "./github-embed-icons";
import { githubIssueStateOf, githubPrStateOf } from "./github-embed-state";

const GITHUB_PAGE_SIZE = 20;

type PickerHit =
  | {
    id: string;
    kind: "github";
    title: string;
    subtitle: string;
    target: MdLiveGithubTarget;
    state?: string;
    isDraft?: boolean;
  }
  | { id: string; kind: "path"; title: string; subtitle: string; path: string; isDir: boolean };

function HighlightText({ text, query }: { text: string; query: string }) {
  const parts = splitHighlightParts(text, query);
  return (
    <span className="min-w-0 truncate">
      {parts.map((part, index) =>
        part.match ? (
          <mark
            key={`${part.text}-${index}`}
            className="rounded-sm bg-primary/20 px-0.5 text-foreground"
          >
            {part.text}
          </mark>
        ) : (
          <span key={`${part.text}-${index}`}>{part.text}</span>
        ),
      )}
    </span>
  );
}

function nameQuery(raw: string): string {
  const query = raw.trim().replace(/\\/g, "/");
  const slashIndex = query.lastIndexOf("/");
  if (slashIndex < 0) return query;
  return query.slice(slashIndex + 1).trim();
}

function githubKindOf(embed: MdLiveEmbedInsertKind): "issue" | "pr" | null {
  if (embed === "github-issue") return "issue";
  if (embed === "github-pr") return "pr";
  return null;
}

function hitFromSearchItem(
  item: {
    owner: string;
    repo: string;
    number: number;
    title: string;
    url: string;
    state?: string;
    is_draft?: boolean;
  },
  kind: "issue" | "pr",
): PickerHit {
  return {
    id: item.url,
    kind: "github",
    title: item.title || `#${item.number}`,
    subtitle: `${item.owner}/${item.repo} #${item.number}`,
    state: item.state,
    isDraft: Boolean(item.is_draft),
    target: {
      kind,
      owner: item.owner,
      repo: item.repo,
      number: item.number,
      url: item.url,
    },
  };
}

async function resolveGithubUrlHit(
  url: string,
  expected: "issue" | "pr",
): Promise<PickerHit | null> {
  const parsed = parseGithubResourceUrl(url);
  if (!parsed || parsed.kind !== expected) return null;
  let title = `GitHub #${parsed.number}`;
  let state: string | undefined;
  let isDraft = false;
  try {
    const remote = expected === "pr"
      ? await wsGithubApi.getPr({ owner: parsed.owner, repo: parsed.repo, prNumber: parsed.number })
      : await wsGithubApi.getIssue({ owner: parsed.owner, repo: parsed.repo, issueNumber: parsed.number });
    if (remote.title) title = remote.title;
    state = remote.state;
    isDraft = "is_draft" in remote ? Boolean(remote.is_draft) : false;
  } catch {
    try {
      const preview = await fetchLinkPreview(parsed.url);
      if (preview.title) title = preview.title;
    } catch {
      // Keep the numbered fallback.
    }
  }
  return {
    id: parsed.url,
    kind: "github",
    title,
    subtitle: `${parsed.owner}/${parsed.repo} #${parsed.number}`,
    state,
    isDraft,
    target: parsed,
  };
}

export function MdLiveEmbedPicker({
  embed,
  query,
  workspaceRoot,
  copy,
  onInsert,
  onBack,
}: {
  embed: MdLiveEmbedInsertKind;
  query: string;
  workspaceRoot: string | null;
  copy?: MdLiveCopyFn;
  onInsert: (markdown: string) => void;
  onBack: () => void;
}) {
  const label = useCallback((key: string) => mdLiveLabel(key, copy), [copy]);
  const listRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [hits, setHits] = useState<PickerHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(0);
  const [fallback, setFallback] = useState<{ owner: string; repo: string } | null>(null);
  const githubKind = githubKindOf(embed);
  const isGithub = githubKind !== null;
  const highlight = nameQuery(query);
  const headingKey = embed === "github-issue"
    ? "slashGithubIssue"
    : embed === "github-pr"
      ? "slashGithubPr"
      : "slashEmbedPath";

  useEffect(() => {
    if (!workspaceRoot || !isGithub) return;
    let cancelled = false;
    void gitApi.getStatus(workspaceRoot).then((status) => {
      if (cancelled) return;
      if (status.github_owner && status.github_repo) {
        setFallback({ owner: status.github_owner, repo: status.github_repo });
      }
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isGithub, workspaceRoot]);

  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    setPage(1);
    setHasMore(false);

    if (isGithub && githubKind) {
      const parsed = parseGithubResourceUrl(q);
      if (parsed) {
        setLoading(true);
        setHits([]);
        void resolveGithubUrlHit(q, githubKind).then((hit) => {
          if (cancelled) return;
          setHits(hit ? [hit] : []);
          setLoading(false);
        });
        return () => {
          cancelled = true;
        };
      }
      if (!fallback) {
        setHits([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const timer = window.setTimeout(() => {
        void wsGithubApi.search({
          kind: githubKind,
          repos: [fallback],
          state: "all",
          query: q || null,
          page: 1,
          perPage: GITHUB_PAGE_SIZE,
        }).then((pageResult) => {
          if (cancelled) return;
          const items = pageResult.items ?? [];
          setHits(items.map((item) => hitFromSearchItem(item, githubKind)));
          setHasMore(Boolean(pageResult.has_more) || items.length >= GITHUB_PAGE_SIZE);
          setPage(1);
        }).catch(() => {
          if (!cancelled) setHits([]);
        }).finally(() => {
          if (!cancelled) setLoading(false);
        });
      }, 180);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    if (!workspaceRoot) {
      setHits([]);
      return;
    }
    setLoading(true);
    void fsApi.listProjectFiles(workspaceRoot, { showHidden: true }).then((res) => {
      if (cancelled) return;
      const filtered = filterMentionFileCandidates(
        flattenFileTreeToCandidates(res.tree ?? []),
        q,
      );
      setHits(filtered.map((item) => ({
        id: item.relativePath,
        kind: "path" as const,
        title: item.name,
        subtitle: item.relativePath,
        path: item.relativePath,
        isDir: item.isDir,
      })));
    }).catch(() => {
      if (!cancelled) setHits([]);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fallback, githubKind, isGithub, query, workspaceRoot]);

  const loadMore = useCallback(() => {
    if (!isGithub || !githubKind || !fallback || !hasMore || loading || loadingMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    const viewport = viewportRef.current;
    const scrollTop = viewport?.scrollTop ?? 0;
    void wsGithubApi.search({
      kind: githubKind,
      repos: [fallback],
      state: "all",
      query: query.trim() || null,
      page: nextPage,
      perPage: GITHUB_PAGE_SIZE,
    }).then((pageResult) => {
      setHits((current) => {
        const seen = new Set(current.map((hit) => hit.id));
        const extra = (pageResult.items ?? [])
          .map((item) => hitFromSearchItem(item, githubKind))
          .filter((hit) => !seen.has(hit.id));
        return [...current, ...extra];
      });
      const extraCount = pageResult.items?.length ?? 0;
      setHasMore(Boolean(pageResult.has_more) || extraCount >= GITHUB_PAGE_SIZE);
      setPage(nextPage);
      requestAnimationFrame(() => {
        if (viewport) viewport.scrollTop = scrollTop;
      });
    }).catch(() => {
      setHasMore(false);
    }).finally(() => {
      setLoadingMore(false);
    });
  }, [fallback, githubKind, hasMore, isGithub, loading, loadingMore, page, query]);

  useEffect(() => {
    setSelected(0);
  }, [query, embed]);

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    scrollActiveListItemIntoView(container, itemRefs.current, selected, 3);
  }, [selected]);

  useEffect(() => {
    const root = viewportRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { root, rootMargin: "80px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, hits.length, loadMore]);

  const insertHit = useCallback((hit: PickerHit) => {
    if (hit.kind === "github") {
      onInsert(markdownFromEmbedSpec(embedSpecFromGithubTarget(hit.target, hit.title)));
      return;
    }
    onInsert(markdownFromEmbedSpec(embedSpecFromPath(hit.path, hit.isDir ? "folder" : "file")));
  }, [onInsert]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        if (hits.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        setSelected((index) => {
          const next = Math.min(index + 1, hits.length - 1);
          if (next >= hits.length - 3) loadMore();
          return next;
        });
        return;
      }
      if (event.key === "ArrowUp") {
        if (hits.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        setSelected((index) => Math.max(index - 1, 0));
        return;
      }
      if (event.key === "Enter") {
        const hit = hits[selected];
        if (!hit) return;
        event.preventDefault();
        event.stopPropagation();
        insertHit(hit);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onBack();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [hits, insertHit, loadMore, onBack, selected]);

  return (
    <div ref={listRef} className="flex h-auto max-h-80 flex-col overflow-hidden">
      <div className="shrink-0 px-1.5 pt-1">
        <button
          type="button"
          className="inline-flex h-8 items-center rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onBack}
        >
          ← {label(headingKey)}
        </button>
      </div>
      <ScrollArea
        scrollFade
        className="h-auto max-h-80 min-h-0 w-full"
        viewportClassName="h-auto max-h-72"
        viewportRef={viewportRef}
      >
        <div className="flex flex-col gap-0.5 p-1">
          {loading && hits.length === 0 ? (
            <div className="flex h-8 items-center gap-2 px-2.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {label("slashEmojiLoading")}
            </div>
          ) : hits.length === 0 ? (
            <div className="px-2.5 py-2 text-xs text-muted-foreground">
              {label(isGithub ? "slashGithubUrl" : query.trim() ? "slashNoResults" : "slashFilePath")}
            </div>
          ) : hits.map((hit, index) => (
            <button
              key={hit.id}
              type="button"
              title={hit.subtitle}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              className={cn(
                "flex h-8 w-full shrink-0 items-center gap-2 rounded-lg px-2.5 text-left text-sm hover:bg-muted",
                index === selected && "bg-muted",
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                insertHit(hit);
              }}
            >
              {hit.kind === "github" ? (
                hit.target.kind === "pr"
                  ? (
                    <GithubPrStatusIcon
                      state={githubPrStateOf(hit.state, Boolean(hit.isDraft))}
                      className="size-4 shrink-0"
                    />
                  )
                  : (
                    <GithubIssueStatusIcon
                      state={githubIssueStateOf(hit.state)}
                      className="size-4 shrink-0"
                    />
                  )
              ) : (
                <MdLivePathIcon name={hit.title} isDir={hit.isDir} className="size-4" />
              )}
              {hit.kind === "github" ? (
                <span className="font-mono text-xs text-muted-foreground">
                  #{hit.target.number}
                </span>
              ) : null}
              <HighlightText text={hit.title} query={highlight} />
              <span className="ml-auto max-w-[55%] shrink truncate text-right text-[11px] text-muted-foreground">
                {hit.subtitle}
              </span>
            </button>
          ))}
          {loadingMore ? (
            <div className="flex h-8 items-center gap-2 px-2.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {label("slashEmojiLoading")}
            </div>
          ) : null}
          {hasMore ? <div ref={sentinelRef} className="h-1 w-full" /> : null}
        </div>
      </ScrollArea>
    </div>
  );
}
