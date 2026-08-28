"use client";

import React from "react";
import {
  WelcomeMentionPopover,
  type MentionNavItem,
  type MentionPopoverState,
} from "@/features/welcome/components/WelcomeMentionPopover";
import { SlashCommandPopover } from "@/features/welcome/components/SlashCommandPopover";
import { useWelcomeMentionSearch } from "@/features/welcome/hooks/use-welcome-mention-search";
import {
  useWelcomeSlashNavigation,
  type SlashCommandOption,
  type WelcomeSlashPopoverState,
} from "@/features/welcome/hooks/use-welcome-slash-navigation";
import {
  popoverAboveRect,
  readTextareaAtTrigger,
  readTextareaSlashTrigger,
  replaceTextareaTrigger,
} from "@/features/agent/lib/composer-triggers";
import type { AgentChatSlashCommand } from "@/features/agent/hooks/use-agent-chat-session";

export function useAgentComposerPopovers({
  availableCommands,
  projectPath,
  setDraft,
  onSelectSlashCommand,
}: {
  availableCommands: AgentChatSlashCommand[];
  projectPath: string | null;
  setDraft: React.Dispatch<React.SetStateAction<string>>;
  onSelectSlashCommand: (command: AgentChatSlashCommand) => void;
}) {
  const [mentionPopover, setMentionPopover] = React.useState<MentionPopoverState>(null);
  const [slashPopover, setSlashPopover] = React.useState<WelcomeSlashPopoverState>(null);

  const selectMentionFile = React.useCallback(
    (item: { relativePath: string }) => {
      const popover = mentionPopover;
      if (!popover) return;
      setDraft((current) =>
        replaceTextareaTrigger(current, popover.atOffset, popover.query.length, `@file:${item.relativePath} `),
      );
      setMentionPopover(null);
    },
    [mentionPopover, setDraft],
  );

  const selectMentionNavItem = React.useCallback(
    (item: MentionNavItem) => {
      if (item.type === "file") {
        selectMentionFile(item.file);
        return;
      }
      const popover = mentionPopover;
      if (!popover) return;
      const token = item.type === "issue" ? `@issue#${item.issue.number} ` : `@pr#${item.pr.number} `;
      setDraft((current) =>
        replaceTextareaTrigger(current, popover.atOffset, popover.query.length, token),
      );
      setMentionPopover(null);
    },
    [mentionPopover, selectMentionFile, setDraft],
  );

  const {
    activeMentionFileIndex,
    isMentionFilesLoading,
    mentionFiles,
    mentionPopoverListRef,
    setMentionItemRef,
  } = useWelcomeMentionSearch({
    issuePreview: null,
    onSelectNavItem: selectMentionNavItem,
    popover: mentionPopover,
    prPreview: null,
    selectedProjectPath: projectPath,
  });

  const filteredCommands = React.useMemo<SlashCommandOption[]>(() => {
    const query = slashPopover?.query.trim().toLowerCase() ?? "";
    return availableCommands
      .filter((command) => {
        if (!query) return true;
        return (
          command.name.toLowerCase().includes(query) ||
          command.description.toLowerCase().includes(query)
        );
      })
      .map((command) => ({
        id: command.name,
        label: `/${command.name}`,
        description: command.hint?.trim()
          ? `${command.description} (${command.hint.trim()})`
          : command.description,
      }));
  }, [availableCommands, slashPopover?.query]);

  const selectSlashCommand = React.useCallback(
    (command: SlashCommandOption) => {
      const popover = slashPopover;
      if (!popover) return;
      const matched = availableCommands.find((item) => item.name === command.id);
      setDraft((current) =>
        replaceTextareaTrigger(current, popover.slashOffset, popover.query.length, ""),
      );
      if (matched) onSelectSlashCommand(matched);
      setSlashPopover(null);
    },
    [availableCommands, onSelectSlashCommand, setDraft, slashPopover],
  );

  const {
    activeIndex: activeSlashItemIndex,
    expandedSections,
    listRef: slashPopoverListRef,
    setExpandedSections,
    setItemRef: setSlashItemRef,
  } = useWelcomeSlashNavigation({
    filteredAgents: [],
    filteredCommands,
    filteredProjects: [],
    filteredSkills: [],
    onSelectAgent: () => undefined,
    onSelectCommand: selectSlashCommand,
    onSelectProject: () => undefined,
    onSelectSkill: () => undefined,
    popover: slashPopover,
  });

  const syncTriggers = React.useCallback(
    (textarea: HTMLTextAreaElement) => {
      const at = readTextareaAtTrigger(textarea);
      if (at) {
        const position = popoverAboveRect(at.caretRect);
        setSlashPopover(null);
        setMentionPopover({
          bottom: position.bottom,
          left: position.left,
          atOffset: at.offset,
          query: at.query,
        });
        return;
      }
      const slash = availableCommands.length > 0 ? readTextareaSlashTrigger(textarea) : null;
      if (slash) {
        const position = popoverAboveRect(slash.caretRect);
        setMentionPopover(null);
        setSlashPopover({
          bottom: position.bottom,
          left: position.left,
          slashOffset: slash.offset,
          query: slash.query,
        });
        return;
      }
      setMentionPopover(null);
      setSlashPopover(null);
    },
    [availableCommands.length],
  );

  const closePopovers = React.useCallback(() => {
    setMentionPopover(null);
    setSlashPopover(null);
  }, []);

  const handleComposerKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape" && (mentionPopover || slashPopover)) {
        event.preventDefault();
        closePopovers();
        return;
      }
      if (
        (event.key === "Enter" || event.key === "ArrowUp" || event.key === "ArrowDown") &&
        (mentionPopover || slashPopover)
      ) {
        event.preventDefault();
      }
    },
    [closePopovers, mentionPopover, slashPopover],
  );

  const popovers = (
    <>
      <WelcomeMentionPopover
        activeIndex={activeMentionFileIndex}
        issuePreview={null}
        isLoading={isMentionFilesLoading}
        listRef={mentionPopoverListRef}
        mentionFiles={mentionFiles}
        onClose={() => setMentionPopover(null)}
        onSelectFile={selectMentionFile}
        onSelectNavItem={selectMentionNavItem}
        onSetItemRef={setMentionItemRef}
        popover={mentionPopover}
        prPreview={null}
      />
      <SlashCommandPopover
        activeIndex={activeSlashItemIndex}
        expandedSections={expandedSections}
        filteredAgents={[]}
        filteredCommands={filteredCommands}
        filteredProjects={[]}
        filteredSkills={[]}
        isSkillsLoading={false}
        listRef={slashPopoverListRef}
        onClose={() => setSlashPopover(null)}
        onSelectAgent={() => undefined}
        onSelectCommand={selectSlashCommand}
        onSelectProject={() => undefined}
        onSelectSkill={() => undefined}
        popover={slashPopover}
        setExpandedSections={setExpandedSections}
        setItemRef={setSlashItemRef}
        showAgents={false}
        showCommands
        showProjects={false}
        showSkills={false}
      />
    </>
  );

  return {
    closePopovers,
    handleComposerKeyDown,
    popovers,
    syncTriggers,
  };
}
