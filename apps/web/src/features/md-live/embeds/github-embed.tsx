"use client";

import { useEffect, useState } from "react";
import { parseMdLiveGithubTarget, type MdLiveEmbedSpec } from "@atmos/md-live";
import { wsGithubApi } from "@/api/ws/github-api";
import { mdLiveCopy } from "../lib/md-live-copy";
import type { MdLiveEmbedViewProps } from "./types";
import { MdLiveEmbedChrome } from "./chrome";
import { openMdLiveEmbed } from "./open-embed";
import { GithubIssueStatusIcon, GithubPrStatusIcon } from "./github-embed-icons";
import {
  githubIssueBadgeClass,
  githubIssueStateOf,
  githubPrBadgeClass,
  githubPrStateOf,
} from "./github-embed-state";

const STATE_COPY = {
  open: "embedStateOpen",
  draft: "embedStateDraft",
  merged: "embedStateMerged",
  closed: "embedStateClosed",
} as const;

function useGithubEmbedRemote(spec: MdLiveEmbedSpec) {
  const target = parseMdLiveGithubTarget(spec);
  const [title, setTitle] = useState(spec.title);
  const [state, setState] = useState<string | undefined>();
  const [isDraft, setIsDraft] = useState(false);
  const [loading, setLoading] = useState(Boolean(target));

  useEffect(() => {
    if (!target) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const request =
      target.kind === "pr"
        ? wsGithubApi.getPr({ owner: target.owner, repo: target.repo, prNumber: target.number })
        : wsGithubApi.getIssue({ owner: target.owner, repo: target.repo, issueNumber: target.number });
    void request
      .then((remote) => {
        if (cancelled) return;
        if (remote.title) setTitle(remote.title);
        setState(remote.state);
        setIsDraft("is_draft" in remote ? Boolean(remote.is_draft) : false);
      })
      .catch(() => {
        if (!cancelled) {
          setTitle(spec.title);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [spec.title, target?.kind, target?.owner, target?.repo, target?.number]);

  return { target, title, state, isDraft, loading };
}

export function GithubMdLiveEmbed({ spec, selected }: MdLiveEmbedViewProps) {
  const { target, title, state, isDraft } = useGithubEmbedRemote(spec);
  const isPr = (target?.kind ?? (spec.kind === "github-pr" ? "pr" : "issue")) === "pr";
  const issueState = githubIssueStateOf(state);
  const prState = githubPrStateOf(state, isDraft);
  const number = target?.number;
  const displayTitle = title || spec.title || (number ? `#${number}` : spec.kind);
  const subtitle = target
    ? `${target.owner}/${target.repo} #${target.number}`
    : spec.attrs.url || spec.kind;
  const chipTitle = number ? `#${number} ${displayTitle}` : displayTitle;
  return (
    <MdLiveEmbedChrome
      layout={spec.layout}
      selected={selected}
      icon={isPr ? <GithubPrStatusIcon state={prState} /> : <GithubIssueStatusIcon state={issueState} />}
      title={spec.layout === "inline" ? chipTitle : displayTitle}
      subtitle={subtitle}
      badge={mdLiveCopy(isPr ? STATE_COPY[prState] : STATE_COPY[issueState])}
      badgeClassName={isPr ? githubPrBadgeClass(prState) : githubIssueBadgeClass(issueState)}
      tooltip={subtitle}
      canOpen={Boolean(target || spec.attrs.url)}
      onOpen={() => openMdLiveEmbed(spec)}
    />
  );
}
