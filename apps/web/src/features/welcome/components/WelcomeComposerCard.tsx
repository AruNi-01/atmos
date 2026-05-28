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
  onAtCancel: () => void;
  onAtTrigger: (ctx: AtTriggerContext) => void;
  onAttachmentPreview: (attachment: ComposerAttachment) => void;
  onAttachmentRemove: (id: string) => void;
  onImagePaste: (blob: Blob, ext: string) => void;
  onProjectChange?: (projectId: string) => void;
  onSlashCancel: () => void;
  onSlashTrigger: (ctx: SlashTriggerContext) => void;
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
  workflowStatus?: WorkspaceWorkflowStatus;
  workspaceLabels?: WorkspaceLabel[];
  controls?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-visible p-1.5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[2rem] border border-border/50 bg-muted/20 shadow-[0_18px_50px_rgba(0,0,0,0.16)] backdrop-blur-md"
      />
      <div className="relative">
        <div
          className="space-y-4 rounded-[1.55rem] bg-background/90 p-4 sm:p-5"
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
              workflowStatus={workflowStatus!}
              workspaceLabels={workspaceLabels!}
            />
          )}
        </div>
        {footer}
      </div>
    </div>
  );
}
