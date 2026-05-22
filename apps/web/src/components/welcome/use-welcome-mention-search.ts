"use client";

import React from "react";
import Fuse from "fuse.js";
import {
  fsApi,
  type GithubIssuePayload,
  type GithubPrPayload,
} from "@/api/ws-api";
import type {
  MentionNavItem,
  MentionPopoverState,
} from "@/components/welcome/WelcomeMentionPopover";
import {
  flattenFileTreeToCandidates,
  useDebouncedPopoverQuery,
  type MentionFileCandidate,
} from "@/components/welcome/welcome-page-helpers";

export function useWelcomeMentionSearch({
  issuePreview,
  onSelectNavItem,
  popover,
  prPreview,
  selectedProjectPath,
}: {
  issuePreview: GithubIssuePayload | null;
  onSelectNavItem: (item: MentionNavItem) => void;
  popover: MentionPopoverState;
  prPreview: GithubPrPayload | null;
  selectedProjectPath: string | null;
}) {
  const [projectTreeEntries, setProjectTreeEntries] = React.useState<MentionFileCandidate[]>([]);
  const [isMentionFilesLoading, setIsMentionFilesLoading] = React.useState(false);
  const [activeMentionFileIndex, setActiveMentionFileIndex] = React.useState(0);
  const debouncedMentionQuery = useDebouncedPopoverQuery(popover, 500);
  const mentionPopoverListRef = React.useRef<HTMLDivElement | null>(null);
  const mentionItemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const setMentionItemRef = React.useCallback(
    (index: number, element: HTMLButtonElement | null) => {
      mentionItemRefs.current[index] = element;
    },
    [],
  );

  React.useEffect(() => {
    if (!selectedProjectPath) {
      setProjectTreeEntries([]);
      setIsMentionFilesLoading(false);
      return;
    }

    let cancelled = false;
    setIsMentionFilesLoading(true);
    fsApi
      .listProjectFiles(selectedProjectPath, { showHidden: true })
      .then((res) => {
        if (cancelled) return;
        setProjectTreeEntries(flattenFileTreeToCandidates(res.tree));
      })
      .catch(() => {
        if (!cancelled) setProjectTreeEntries([]);
      })
      .finally(() => {
        if (!cancelled) setIsMentionFilesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProjectPath]);

  const mentionFileFuse = React.useMemo(
    () =>
      new Fuse(projectTreeEntries, {
        keys: [
          { name: "name", weight: 0.68 },
          { name: "relativePath", weight: 0.32 },
        ],
        threshold: 0.32,
        ignoreLocation: true,
      }),
    [projectTreeEntries],
  );

  const mentionFiles = React.useMemo(() => {
    const query = debouncedMentionQuery;
    if (!query) return [] as MentionFileCandidate[];
    const hits = mentionFileFuse.search(query, { limit: 60 }).map((r) => r.item);
    return hits
      .sort((a, b) => {
        const bucket = (item: MentionFileCandidate) =>
          item.isHidden ? 2 : item.isDir ? 1 : 0;
        const bucketDiff = bucket(a) - bucket(b);
        if (bucketDiff !== 0) return bucketDiff;
        return a.relativePath.localeCompare(b.relativePath);
      })
      .slice(0, 12);
  }, [debouncedMentionQuery, mentionFileFuse]);

  const mentionNavItems = React.useMemo<MentionNavItem[]>(() => {
    const items: MentionNavItem[] = [];
    if (issuePreview) items.push({ type: "issue", issue: issuePreview });
    if (prPreview) items.push({ type: "pr", pr: prPreview });
    for (const file of mentionFiles) items.push({ type: "file", file });
    return items;
  }, [issuePreview, prPreview, mentionFiles]);

  React.useEffect(() => {
    setActiveMentionFileIndex(0);
  }, [popover?.query, mentionNavItems.length]);

  React.useEffect(() => {
    if (!popover) return;
    const container = mentionPopoverListRef.current;
    const activeItem = mentionItemRefs.current[activeMentionFileIndex];
    if (!container || !activeItem) return;
    activeItem.scrollIntoView({ block: "nearest" });
  }, [activeMentionFileIndex, popover]);

  React.useEffect(() => {
    if (!popover) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        if (mentionNavItems.length === 0) return;
        event.preventDefault();
        setActiveMentionFileIndex((prev) => (prev + 1) % mentionNavItems.length);
        return;
      }
      if (event.key === "ArrowUp") {
        if (mentionNavItems.length === 0) return;
        event.preventDefault();
        setActiveMentionFileIndex(
          (prev) => (prev - 1 + mentionNavItems.length) % mentionNavItems.length,
        );
        return;
      }
      if (event.key === "Enter") {
        const item = mentionNavItems[activeMentionFileIndex];
        if (!item) return;
        event.preventDefault();
        onSelectNavItem(item);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeMentionFileIndex, mentionNavItems, onSelectNavItem, popover]);

  return {
    activeMentionFileIndex,
    isMentionFilesLoading,
    mentionFiles,
    mentionPopoverListRef,
    setIsMentionFilesLoading,
    setMentionItemRef,
  };
}
