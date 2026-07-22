"use client";

import React from "react";

import {
  SlashCommandPopover,
  type SlashDisableSkillsState,
  type SlashPopoverView,
} from "@/features/welcome/components/SlashCommandPopover";
import {
  WelcomeMentionPopover,
  type MentionNavItem,
  type MentionPopoverState,
} from "@/features/welcome/components/WelcomeMentionPopover";
import type { WelcomeSlashPopoverState } from "@/features/welcome/hooks/use-welcome-slash-navigation";
import type { SlashCommandOption } from "@/features/welcome/hooks/use-welcome-slash-navigation";
import type { SkillInfo } from "@/api/ws-api";
import { ImagePreviewOverlay } from "@/shared/components/image-preview-overlay";

type ImagePreviewAttachment = {
  objectUrl: string;
  filename: string;
};

export function TerminalAgentInputPopovers({
  activeMentionFileIndex,
  activeSlashItemIndex,
  disableSkills,
  expandedSections,
  filteredAgents,
  filteredCommands,
  filteredProjects,
  filteredSkills,
  isMentionFilesLoading,
  isSkillsLoading,
  mentionFiles,
  mentionPopover,
  mentionPopoverListRef,
  onBackFromDisableSkills,
  onCloseMention,
  onCloseSlash,
  onSelectMentionFile,
  onSelectMentionNavItem,
  onSelectSlashAgent,
  onSelectSlashCommand,
  onSelectSlashProject,
  onSelectSlashSkill,
  onToggleDisableSkill,
  onClosePreviewAttachment,
  previewAttachment,
  setExpandedSections,
  setMentionItemRef,
  setSlashItemRef,
  slashPopover,
  slashPopoverListRef,
  slashPopoverView = "menu",
}: {
  activeMentionFileIndex: number;
  activeSlashItemIndex: number;
  disableSkills?: SlashDisableSkillsState | null;
  expandedSections: React.ComponentProps<typeof SlashCommandPopover>["expandedSections"];
  filteredAgents: React.ComponentProps<typeof SlashCommandPopover>["filteredAgents"];
  filteredCommands?: SlashCommandOption[];
  filteredProjects: React.ComponentProps<typeof SlashCommandPopover>["filteredProjects"];
  filteredSkills: React.ComponentProps<typeof SlashCommandPopover>["filteredSkills"];
  isMentionFilesLoading: boolean;
  isSkillsLoading: boolean;
  mentionFiles: React.ComponentProps<typeof WelcomeMentionPopover>["mentionFiles"];
  mentionPopover: MentionPopoverState;
  mentionPopoverListRef: React.ComponentProps<typeof WelcomeMentionPopover>["listRef"];
  onBackFromDisableSkills?: () => void;
  onCloseMention: () => void;
  onCloseSlash: () => void;
  onSelectMentionFile: (item: { relativePath: string }) => void;
  onSelectMentionNavItem: (item: MentionNavItem) => void;
  onSelectSlashAgent: () => void;
  onSelectSlashCommand?: (command: SlashCommandOption) => void;
  onSelectSlashProject: () => void;
  onSelectSlashSkill: React.ComponentProps<typeof SlashCommandPopover>["onSelectSkill"];
  onToggleDisableSkill?: (skill: SkillInfo, enabled: boolean) => void;
  onClosePreviewAttachment: () => void;
  previewAttachment: ImagePreviewAttachment | null;
  setExpandedSections: React.ComponentProps<typeof SlashCommandPopover>["setExpandedSections"];
  setMentionItemRef: React.ComponentProps<typeof WelcomeMentionPopover>["onSetItemRef"];
  setSlashItemRef: React.ComponentProps<typeof SlashCommandPopover>["setItemRef"];
  slashPopover: WelcomeSlashPopoverState;
  slashPopoverListRef: React.ComponentProps<typeof SlashCommandPopover>["listRef"];
  slashPopoverView?: SlashPopoverView;
}) {
  return (
    <>
      <WelcomeMentionPopover
        activeIndex={activeMentionFileIndex}
        issuePreview={null}
        isLoading={isMentionFilesLoading}
        listRef={mentionPopoverListRef}
        mentionFiles={mentionFiles}
        onClose={onCloseMention}
        onSelectFile={onSelectMentionFile}
        onSelectNavItem={onSelectMentionNavItem}
        onSetItemRef={setMentionItemRef}
        popover={mentionPopover}
        prPreview={null}
      />
      <SlashCommandPopover
        activeIndex={activeSlashItemIndex}
        disableSkills={disableSkills}
        expandedSections={expandedSections}
        filteredAgents={filteredAgents}
        filteredCommands={filteredCommands}
        filteredProjects={filteredProjects}
        filteredSkills={filteredSkills}
        isSkillsLoading={isSkillsLoading}
        listRef={slashPopoverListRef}
        onBackFromDisableSkills={onBackFromDisableSkills}
        onClose={onCloseSlash}
        onSelectAgent={onSelectSlashAgent}
        onSelectCommand={onSelectSlashCommand}
        onSelectProject={onSelectSlashProject}
        onSelectSkill={onSelectSlashSkill}
        onToggleDisableSkill={onToggleDisableSkill}
        popover={slashPopover}
        setExpandedSections={setExpandedSections}
        setItemRef={setSlashItemRef}
        showAgents={false}
        showCommands={Boolean(filteredCommands?.length)}
        showProjects={false}
        view={slashPopoverView}
      />
      {previewAttachment ? (
        <ImagePreviewOverlay
          src={previewAttachment.objectUrl}
          alt={previewAttachment.filename}
          onClose={onClosePreviewAttachment}
        />
      ) : null}
    </>
  );
}
