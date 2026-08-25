"use client";

import React from "react";

import { AttachmentBar, type ComposerAttachment } from "@/features/welcome/components/AttachmentBar";
import {
  PromptComposer,
  type AtTriggerContext,
  type ComposerHandle,
  type SlashTriggerContext,
} from "@/features/welcome/components/PromptComposer";
import { WelcomeComposerControls } from "@/features/welcome/components/WelcomeComposerControls";
import { WelcomeComposerSparkles } from "@/features/welcome/components/WelcomeComposerSparkles";
import { promptCardNotchSurfaceStyle } from "@/features/welcome/lib/welcome-page-helpers";
import type {
  Project,
  WorkspaceLabel,
  WorkspacePriority,
  WorkspaceWorkflowStatus,
} from "@/shared/types/domain";

export function WelcomeComposerCard({
  attachments,
  composerRef,
  createWorkspaceLabel,
  disabledSubmit,
  isInitialProjectsLoading,
  isSubmitting,
  onAddProject,
  onAtCancel,
  onAtTrigger,
  onAttachmentPreview,
  onAttachmentRemove,
  onImagePaste,
  onProjectChange,
  onSlashCancel,
  onSlashTrigger,
  onSkillDisableFilterChange,
  onSkillDisableSessionClosed,
  onTextChange,
  placeholder,
  priority,
  projectId,
  projects,
  selectedLabels,
  selectedProject,
  setPriority,
  setSelectedLabels,
  setWorkflowStatus,
  skillsControl,
  workflowStatus,
  workspaceLabels,
  controls,
  footer,
}: {
  attachments: ComposerAttachment[];
  composerRef: React.RefObject<ComposerHandle | null>;
  createWorkspaceLabel?: React.ComponentProps<typeof WelcomeComposerControls>["createWorkspaceLabel"];
  disabledSubmit: boolean;
  isInitialProjectsLoading: boolean;
  isSubmitting: boolean;
  onAddProject?: () => void;
  onAtCancel?: () => void;
  onAtTrigger?: (ctx: AtTriggerContext) => void;
  onAttachmentPreview: (attachment: ComposerAttachment) => void;
  onAttachmentRemove: (id: string) => void;
  onImagePaste: (blob: Blob, ext: string) => void;
  onProjectChange?: (projectId: string) => void;
  onSlashCancel?: () => void;
  onSlashTrigger?: (ctx: SlashTriggerContext) => void;
  onSkillDisableFilterChange?: (filter: string) => void;
  onSkillDisableSessionClosed?: () => void;
  onTextChange: (text: string) => void;
  placeholder: React.ReactNode;
  priority?: WorkspacePriority;
  projectId?: string;
  projects?: Project[];
  selectedLabels?: WorkspaceLabel[];
  selectedProject?: Project | null;
  setPriority?: (value: WorkspacePriority) => void;
  setSelectedLabels?: (labels: WorkspaceLabel[]) => void;
  setWorkflowStatus?: (value: WorkspaceWorkflowStatus) => void;
  skillsControl?: React.ReactNode;
  workflowStatus?: WorkspaceWorkflowStatus;
  workspaceLabels?: WorkspaceLabel[];
  controls?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-visible p-1.5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[2rem] border border-border/80 bg-muted/70 shadow-[0_12px_40px_rgba(0,0,0,0.08)] backdrop-blur-md dark:border-border/50 dark:bg-muted/20 dark:shadow-[0_18px_50px_rgba(0,0,0,0.16)]"
      />
      <div className="relative z-10">
        <div
          className="relative space-y-4 rounded-[1.55rem] bg-background p-4 sm:p-5 dark:bg-background/90"
          style={promptCardNotchSurfaceStyle}
        >
          <PromptComposer
            ref={composerRef}
            placeholder={placeholder}
            onTextChange={onTextChange}
            onImagePaste={onImagePaste}
            onAtTrigger={onAtTrigger}
            onAtCancel={onAtCancel}
            onSlashTrigger={onSlashTrigger}
            onSlashCancel={onSlashCancel}
            onSkillDisableFilterChange={onSkillDisableFilterChange}
            onSkillDisableSessionClosed={onSkillDisableSessionClosed}
          />

          <AttachmentBar
            attachments={attachments}
            onRemove={onAttachmentRemove}
            onPreview={onAttachmentPreview}
          />

          {controls ?? (
            <WelcomeComposerControls
              createWorkspaceLabel={createWorkspaceLabel!}
              disabledSubmit={disabledSubmit}
              isInitialProjectsLoading={isInitialProjectsLoading}
              isSubmitting={isSubmitting}
              onAddProject={onAddProject}
              onProjectChange={onProjectChange!}
              priority={priority!}
              projectId={projectId!}
              projects={projects!}
              selectedLabels={selectedLabels!}
              selectedProject={selectedProject}
              setPriority={setPriority!}
              setSelectedLabels={setSelectedLabels!}
              setWorkflowStatus={setWorkflowStatus!}
              skillsControl={skillsControl}
              workflowStatus={workflowStatus!}
              workspaceLabels={workspaceLabels!}
            />
          )}
        </div>
        {footer}
      </div>
      <WelcomeComposerSparkles className="absolute left-1/2 top-full z-0 -translate-x-1/2 -translate-y-px" />
    </div>
  );
}
