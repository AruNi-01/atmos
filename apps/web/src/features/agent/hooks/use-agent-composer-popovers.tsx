"use client";

import React from "react";
import {
  WelcomeMentionPopover,
  type MentionNavItem,
  type MentionPopoverState,
} from "@/features/welcome/components/WelcomeMentionPopover";
import { SlashCommandPopover } from "@/features/welcome/components/SlashCommandPopover";
import {
  PromptComposer,
  type AtTriggerContext,
  type ComposerHandle,
  type SlashTriggerContext,
} from "@/features/welcome/components/PromptComposer";
import { useWelcomeMentionSearch } from "@/features/welcome/hooks/use-welcome-mention-search";
import { useWelcomeSlashSearch } from "@/features/welcome/hooks/use-welcome-slash-search";
import {
  useWelcomeSlashNavigation,
  type SlashCommandOption,
  type WelcomeSlashPopoverState,
} from "@/features/welcome/hooks/use-welcome-slash-navigation";
import { getTerminalAgentPopoverAboveCaret } from "@/features/terminal/lib/terminal-agent-input-overlay-utils";
import { useTranslations } from "next-intl";
import type { AgentChatSlashCommand } from "@/features/agent/hooks/use-agent-chat-session";

export function useAgentComposerPopovers({
  availableCommands,
  projectPath,
  composerRef,
  activeProjectId = null,
  agentName = null,
}: {
  availableCommands: AgentChatSlashCommand[];
  projectPath: string | null;
  composerRef: React.RefObject<ComposerHandle | null>;
  activeProjectId?: string | null;
  agentName?: string | null;
}) {
  const t = useTranslations("Welcome.components");
  const [mentionPopover, setMentionPopover] = React.useState<MentionPopoverState>(null);
  const [slashPopover, setSlashPopover] = React.useState<WelcomeSlashPopoverState>(null);
  const commandsTitle = agentName?.trim()
    ? t("slashPopover.agentCommands", { agent: agentName.trim() })
    : t("slashPopover.commands");

  const selectMentionFile = React.useCallback(
    (item: { relativePath: string }) => {
      const popover = mentionPopover;
      if (!popover) return;
      composerRef.current?.applyMentionAtRange(
        popover.atOffset,
        popover.query.length,
        { kind: "file", relativePath: item.relativePath },
      );
      setMentionPopover(null);
    },
    [composerRef, mentionPopover],
  );

  const selectMentionNavItem = React.useCallback(
    (item: MentionNavItem) => {
      const popover = mentionPopover;
      if (!popover) return;
      if (item.type === "file") {
        selectMentionFile(item.file);
        return;
      }
      composerRef.current?.applyMentionAtRange(
        popover.atOffset,
        popover.query.length,
        { kind: item.type, number: item.type === "issue" ? item.issue.number : item.pr.number },
      );
      setMentionPopover(null);
    },
    [composerRef, mentionPopover, selectMentionFile],
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

  const { filteredSkills, isSkillsLoading } = useWelcomeSlashSearch({
    availableAgents: [],
    activeProjectId,
    popover: slashPopover,
    projects: [],
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

  const selectSlashSkill = React.useCallback(
    (skill: { path: string; name: string; status?: string }) => {
      if (skill.status === "disabled") return;
      const popover = slashPopover;
      if (!popover) return;
      composerRef.current?.applySlashAtRange(
        popover.slashOffset,
        popover.query.length,
        { kind: "skill", absolutePath: skill.path, name: skill.name },
      );
      setSlashPopover(null);
    },
    [composerRef, slashPopover],
  );

  const selectSlashCommand = React.useCallback(
    (command: SlashCommandOption) => {
      const popover = slashPopover;
      if (!popover) return;
      const matched = availableCommands.find((item) => item.name === command.id);
      if (matched) {
        composerRef.current?.applySlashAtRange(
          popover.slashOffset,
          popover.query.length,
          { kind: "command", name: matched.name },
        );
      }
      setSlashPopover(null);
    },
    [availableCommands, composerRef, slashPopover],
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
    filteredSkills,
    onSelectAgent: () => undefined,
    onSelectCommand: selectSlashCommand,
    onSelectProject: () => undefined,
    onSelectSkill: selectSlashSkill,
    popover: slashPopover,
  });

  const onAtTrigger = React.useCallback((ctx: AtTriggerContext) => {
    const position = getTerminalAgentPopoverAboveCaret(ctx.caretRect);
    setSlashPopover(null);
    setMentionPopover({
      bottom: position.bottom,
      left: position.left,
      atOffset: ctx.atOffset,
      query: ctx.query,
    });
  }, []);

  const onSlashTrigger = React.useCallback((ctx: SlashTriggerContext) => {
    const position = getTerminalAgentPopoverAboveCaret(ctx.caretRect);
    setMentionPopover(null);
    setSlashPopover({
      bottom: position.bottom,
      left: position.left,
      slashOffset: ctx.slashOffset,
      query: ctx.query,
    });
  }, []);

  const closePopovers = React.useCallback(() => {
    setMentionPopover(null);
    setSlashPopover(null);
  }, []);

  const onAtCancel = React.useCallback(() => {
    setMentionPopover(null);
  }, []);

  const onSlashCancel = React.useCallback(() => {
    setSlashPopover(null);
  }, []);

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
        filteredSkills={filteredSkills}
        isSkillsLoading={isSkillsLoading}
        listRef={slashPopoverListRef}
        onClose={() => setSlashPopover(null)}
        onSelectAgent={() => undefined}
        onSelectCommand={selectSlashCommand}
        onSelectProject={() => undefined}
        onSelectSkill={selectSlashSkill}
        popover={slashPopover}
        setExpandedSections={setExpandedSections}
        setItemRef={setSlashItemRef}
        showAgents={false}
        showCommands
        showProjects={false}
        showSkills
        commandsTitle={commandsTitle}
      />
    </>
  );

  return {
    closePopovers,
    onAtCancel,
    onAtTrigger,
    onSlashCancel,
    onSlashTrigger,
    popovers,
  };
}

export { PromptComposer };
