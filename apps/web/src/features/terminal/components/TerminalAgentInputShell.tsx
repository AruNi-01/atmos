"use client";

import React from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { cn } from "@workspace/ui";

import { AttachmentBar } from "@/features/welcome/components/AttachmentBar";
import {
  PromptComposer,
  type AtTriggerContext,
  type ComposerHandle,
  type SlashTriggerContext,
} from "@/features/welcome/components/PromptComposer";

type AttachmentBarProps = React.ComponentProps<typeof AttachmentBar>;
type PromptComposerProps = React.ComponentProps<typeof PromptComposer>;

export function TerminalAgentInputShell({
  attachments,
  canSubmit,
  composerRef,
  footerEndControl,
  handleAttachmentRemove,
  handleImagePaste,
  handleTextChange,
  header,
  inputShellRef,
  isOverlayVisible,
  isSendAnimating,
  isSendExiting,
  isSending,
  onAtCancel,
  onAtTrigger,
  onPreviewAttachment,
  onSlashCancel,
  onSlashTrigger,
  onSkillDisableFilterChange,
  onSkillDisableSessionClosed,
  onSubmit,
  placeholder,
  startSendExit,
}: {
  attachments: AttachmentBarProps["attachments"];
  canSubmit: boolean;
  composerRef: React.RefObject<ComposerHandle | null>;
  footerEndControl?: React.ReactNode;
  handleAttachmentRemove: AttachmentBarProps["onRemove"];
  handleImagePaste: PromptComposerProps["onImagePaste"];
  handleTextChange: (nextText: string) => void;
  header?: React.ReactNode;
  inputShellRef: React.RefObject<HTMLDivElement | null>;
  isOverlayVisible: boolean;
  isSendAnimating: boolean;
  isSendExiting: boolean;
  isSending: boolean;
  onAtCancel: () => void;
  onAtTrigger: (ctx: AtTriggerContext) => void;
  onPreviewAttachment: AttachmentBarProps["onPreview"];
  onSlashCancel: () => void;
  onSlashTrigger: (ctx: SlashTriggerContext) => void;
  onSkillDisableFilterChange?: (filter: string) => void;
  onSkillDisableSessionClosed?: () => void;
  onSubmit: () => void;
  placeholder: string;
  startSendExit: () => void;
}) {
  const hasHeader = Boolean(header);
  const hasFooterContent = attachments.length > 0 || !!footerEndControl;

  return (
    <div
      className={cn(
        "grid w-full transition-[grid-template-rows,opacity,transform] duration-200 ease-out",
        (isOverlayVisible || isSendAnimating || isSendExiting) && "mb-1",
        isSendExiting
          ? "grid-rows-[1fr] opacity-0 -translate-y-3"
          : isOverlayVisible
            ? "grid-rows-[1fr] opacity-100 translate-y-0"
            : "grid-rows-[0fr] opacity-0 translate-y-2",
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          ref={inputShellRef}
          className="terminal-agent-input-shell relative overflow-hidden rounded-[1.65rem] bg-background/95 p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-md dark:bg-[#151515]"
          data-send-animating={isSendAnimating ? "true" : "false"}
        >
          <div
            className="terminal-agent-input-header relative z-10"
            data-visible={hasHeader ? "true" : "false"}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="terminal-agent-input-header-content pb-1.5">
                {header}
              </div>
            </div>
          </div>
          <div className="relative z-10 flex items-end gap-2 overflow-hidden rounded-[1.25rem] bg-muted/30 px-4 py-2 dark:bg-[#0b0b0b]">
            {isSendAnimating ? (
              <div
                aria-hidden="true"
                className="terminal-agent-send-sweep"
                onAnimationEnd={(event) => {
                  if (event.animationName === "terminalAgentBlueSweep") {
                    startSendExit();
                  }
                }}
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <PromptComposer
                ref={composerRef}
                placeholder={placeholder}
                placeholderClassName="left-0 top-1/2 -translate-y-1/2 truncate text-sm leading-5"
                editorClassName="min-h-9 max-h-[92px] rounded-none py-2 pr-1 text-sm leading-5"
                onSubmit={onSubmit}
                onTextChange={handleTextChange}
                onImagePaste={handleImagePaste}
                onAtTrigger={onAtTrigger}
                onAtCancel={onAtCancel}
                onSlashTrigger={onSlashTrigger}
                onSlashCancel={onSlashCancel}
                onSkillDisableFilterChange={onSkillDisableFilterChange}
                onSkillDisableSessionClosed={onSkillDisableSessionClosed}
              />
            </div>
            <button
              type="button"
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-foreground text-background shadow-sm hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!canSubmit}
              onClick={() => void onSubmit()}
              aria-label="Send to terminal"
              aria-busy={isSending || isSendAnimating || isSendExiting}
              title="Send to terminal"
            >
              {isSending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowUp className="size-4" />
              )}
            </button>
          </div>
          <div
            className="terminal-agent-input-footer relative z-10"
            data-visible={hasFooterContent ? "true" : "false"}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="terminal-agent-input-footer-content flex items-end gap-2 px-3 pb-2 pt-1.5">
                <AttachmentBar
                  attachments={attachments}
                  onRemove={handleAttachmentRemove}
                  onPreview={onPreviewAttachment}
                  className="min-w-0 flex-1"
                />
                {footerEndControl ? (
                  <div className="ml-auto flex shrink-0 items-center self-end">
                    {footerEndControl}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
