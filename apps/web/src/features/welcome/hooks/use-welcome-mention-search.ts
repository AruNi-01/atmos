"use client";

import React from "react";
import {
  fsApi,
  type GithubIssuePayload,
  type GithubPrPayload,
} from "@/api/ws-api";
import type {
  MentionNavItem,
  MentionPopoverState,
} from "@/features/welcome/components/WelcomeMentionPopover";
import {
  flattenFileTreeToCandidates,
  useDebouncedPopoverQuery,
  type MentionFileCandidate,
} from "@/features/welcome/lib/welcome-page-helpers";
import {
  filterMentionFileCandidates,
  isImmediateMentionListingQuery,
} from "@/features/welcome/lib/mention-file-search";
import {
  isPopoverConfirmKey,
  scrollActiveListItemIntoView,
} from "@/features/welcome/lib/popover-list-scroll";

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
  const liveMentionQuery = popover?.query ?? "";
  const debouncedMentionQuery = useDebouncedPopoverQuery(popover, 500);
  const mentionQuery = isImmediateMentionListingQuery(liveMentionQuery)
    ? liveMentionQuery
    : debouncedMentionQuery;
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

  const mentionFiles = React.useMemo(() => {
    return filterMentionFileCandidates(projectTreeEntries, mentionQuery);
  }, [mentionQuery, projectTreeEntries]);

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
    if (!container) return;
    scrollActiveListItemIntoView(
      container,
      mentionItemRefs.current,
      activeMentionFileIndex,
      3,
    );
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
      if (event.key === "Tab") {
        event.preventDefault();
      }
      if (isPopoverConfirmKey(event)) {
        const item = mentionNavItems[activeMentionFileIndex];
        if (!item) return;
        event.preventDefault();
        onSelectNavItem(item);
      }
    };
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", handleKeyDown, { capture: true });
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
