"use client";

import React from "react";

import { SlashCommandPopover } from "@/features/welcome/components/SlashCommandPopover";
import {
  WelcomeMentionPopover,
  type MentionNavItem,
  type MentionPopoverState,
} from "@/features/welcome/components/WelcomeMentionPopover";
import type { WelcomeSlashPopoverState } from "@/features/welcome/hooks/use-welcome-slash-navigation";
import { ImagePreviewOverlay } from "@/shared/components/image-preview-overlay";

type ImagePreviewAttachment = {
  objectUrl: string;
  filename: string;
};

export function TerminalAgentInputPopovers({
  activeMentionFileIndex,
  activeSlashItemIndex,
  expandedSections,
  filteredAgents,
  filteredProjects,
  filteredSkills,
  isMentionFilesLoading,
  isSkillsLoading,
  mentionFiles,
  mentionPopover,
  mentionPopoverListRef,
  onCloseMention,
  onCloseSlash,
  onSelectMentionFile,
  onSelectMentionNavItem,
  onSelectSlashAgent,
  onSelectSlashProject,
  onSelectSlashSkill,
  onClosePreviewAttachment,
  previewAttachment,
  setExpandedSections,
  setMentionItemRef,
  setSlashItemRef,
  slashPopover,
  slashPopoverListRef,
}: {
  activeMentionFileIndex: number;
  activeSlashItemIndex: number;
  expandedSections: React.ComponentProps<typeof SlashCommandPopover>["expandedSections"];
  filteredAgents: React.ComponentProps<typeof SlashCommandPopover>["filteredAgents"];
  filteredProjects: React.ComponentProps<typeof SlashCommandPopover>["filteredProjects"];
  filteredSkills: React.ComponentProps<typeof SlashCommandPopover>["filteredSkills"];
  isMentionFilesLoading: boolean;
  isSkillsLoading: boolean;
  mentionFiles: React.ComponentProps<typeof WelcomeMentionPopover>["mentionFiles"];
  mentionPopover: MentionPopoverState;
  mentionPopoverListRef: React.ComponentProps<typeof WelcomeMentionPopover>["listRef"];
  onCloseMention: () => void;
  onCloseSlash: () => void;
  onSelectMentionFile: (item: { relativePath: string }) => void;
  onSelectMentionNavItem: (item: MentionNavItem) => void;
  onSelectSlashAgent: () => void;
  onSelectSlashProject: () => void;
  onSelectSlashSkill: React.ComponentProps<typeof SlashCommandPopover>["onSelectSkill"];
  onClosePreviewAttachment: () => void;
  previewAttachment: ImagePreviewAttachment | null;
  setExpandedSections: React.ComponentProps<typeof SlashCommandPopover>["setExpandedSections"];
  setMentionItemRef: React.ComponentProps<typeof WelcomeMentionPopover>["onSetItemRef"];
  setSlashItemRef: React.ComponentProps<typeof SlashCommandPopover>["setItemRef"];
  slashPopover: WelcomeSlashPopoverState;
  slashPopoverListRef: React.ComponentProps<typeof SlashCommandPopover>["listRef"];
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
        expandedSections={expandedSections}
        filteredAgents={filteredAgents}
        filteredProjects={filteredProjects}
        filteredSkills={filteredSkills}
        isSkillsLoading={isSkillsLoading}
        listRef={slashPopoverListRef}
        onClose={onCloseSlash}
        onSelectAgent={onSelectSlashAgent}
        onSelectProject={onSelectSlashProject}
        onSelectSkill={onSelectSlashSkill}
        popover={slashPopover}
        setExpandedSections={setExpandedSections}
        setItemRef={setSlashItemRef}
        showAgents={false}
        showProjects={false}
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
