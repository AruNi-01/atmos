"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import { ArrowUp, Loader2 } from "lucide-react";
import { cn } from "@workspace/ui";

import { agentApi as agentRestApi } from "@/api/rest-api";
import { AttachmentBar } from "@/features/welcome/components/AttachmentBar";
import {
  PromptComposer,
  type AtTriggerContext,
  type ComposerHandle,
  type SlashTriggerContext,
} from "@/features/welcome/components/PromptComposer";
import { SlashCommandPopover } from "@/features/welcome/components/SlashCommandPopover";
import {
  WelcomeMentionPopover,
  type MentionNavItem,
  type MentionPopoverState,
} from "@/features/welcome/components/WelcomeMentionPopover";
import { useWelcomeComposerAttachments } from "@/features/welcome/hooks/use-welcome-composer-attachments";
import { useWelcomeMentionSearch } from "@/features/welcome/hooks/use-welcome-mention-search";
import {
  useWelcomeSlashNavigation,
  type WelcomeSlashPopoverState,
} from "@/features/welcome/hooks/use-welcome-slash-navigation";
import { useWelcomeSlashSearch } from "@/features/welcome/hooks/use-welcome-slash-search";
import { formatAppshotPrompt } from "@/features/appshot/lib/appshot-protocol";
import { ImagePreviewOverlay } from "@/shared/components/image-preview-overlay";
import {
  ctrlEnterInput,
  type TerminalAgentSubmitMode,
  wrapBracketedPaste,
} from "../lib/terminal-runtime-utils";

import "./TerminalAgentInputOverlay.css";

interface TerminalAgentInputOverlayProps {
  activeProjectId?: string | null;
  getTerminalCursorClientPoint?: () => { x: number; y: number } | null;
  isTerminalReady?: boolean;
  localPath?: string | null;
  onSendEnter: () => void;
  onSendText: (text: string) => void;
  submitMode?: TerminalAgentSubmitMode;
}

export interface TerminalAgentInputOverlayHandle {
  toggle: () => void;
}

type FlyingMessage = {
  id: number;
  text: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

const POPOVER_WIDTH = 460;
const POPOVER_GAP = 8;
const VIEWPORT_MARGIN = 8;

function getPopoverAboveCaret(caretRect: DOMRect) {
  const viewportWidth = typeof window === "undefined" ? POPOVER_WIDTH : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 0 : window.innerHeight;
  return {
    bottom: Math.max(VIEWPORT_MARGIN, viewportHeight - caretRect.top + POPOVER_GAP),
    left: Math.min(
      Math.max(VIEWPORT_MARGIN, caretRect.left),
      Math.max(VIEWPORT_MARGIN, viewportWidth - POPOVER_WIDTH - VIEWPORT_MARGIN),
    ),
  };
}

async function resolveTerminalPrompt({
  attachments,
  localPath,
  text,
}: {
  attachments: ReturnType<typeof useWelcomeComposerAttachments>["attachments"];
  localPath?: string | null;
  text: string;
}) {
  let attachmentPathByNumber = new Map<number, string>();

  if (attachments.length > 0 && localPath) {
    const { paths } = await agentRestApi.uploadAttachments(
      localPath,
      attachments.map((attachment) => ({
        url: attachment.objectUrl,
        filename: attachment.filename,
        mediaType: attachment.blob.type || "application/octet-stream",
      })),
    );
    attachmentPathByNumber = new Map(
      attachments.map((attachment, index) => [
        attachment.number,
        paths[index] ?? `.atmos/attachments/${attachment.filename}`,
      ]),
    );
  }

  return text
    .replace(/@(?:issue|pr)#\d+/g, () => ".atmos/context/requirement.md")
    .replace(/@file:([^\s]+)/g, (_match, relativePath: string) => `@${relativePath}`)
    .replace(/\[#appshot:(\d{13})\]/g, (_match, timestamp: string) =>
      formatAppshotPrompt(timestamp),
    )
    .replace(/\[#img-(\d+)\]/g, (match, number: string) => {
      const path = attachmentPathByNumber.get(Number(number));
      return path ? `@${path}` : match;
    });
}

export const TerminalAgentInputOverlay = React.forwardRef<
  TerminalAgentInputOverlayHandle,
  TerminalAgentInputOverlayProps
>(function TerminalAgentInputOverlay({
  activeProjectId,
  getTerminalCursorClientPoint,
  isTerminalReady = true,
  localPath,
  onSendEnter,
  onSendText,
  submitMode = "text-enter",
}, ref) {
  const t = useTranslations("terminal.agentInput");
  const composerRef = React.useRef<ComposerHandle | null>(null);
  const inputShellRef = React.useRef<HTMLDivElement | null>(null);
  const delayedSubmitTimerRef = React.useRef<number | null>(null);
  const flyingMessageIdRef = React.useRef(0);
  const [isOpen, setIsOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const [isSendAnimating, setIsSendAnimating] = React.useState(false);
  const [isSendExiting, setIsSendExiting] = React.useState(false);
  const [flyingMessage, setFlyingMessage] = React.useState<FlyingMessage | null>(null);
  const [mentionPopover, setMentionPopover] = React.useState<MentionPopoverState>(null);
  const [slashPopover, setSlashPopover] = React.useState<WelcomeSlashPopoverState>(null);
  const isOverlayVisible = isOpen || isSendAnimating || isSendExiting;
  const canSubmit = isTerminalReady && text.trim().length > 0 && !isSending && !isSendAnimating && !isSendExiting;

  const focusComposerSoon = React.useCallback(() => {
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }, []);

  const toggleInput = React.useCallback(() => {
    if (isSendAnimating || isSendExiting) return;
    setIsOpen((current) => {
      const next = !current;
      if (next) focusComposerSoon();
      return next;
    });
    setMentionPopover(null);
    setSlashPopover(null);
  }, [focusComposerSoon, isSendAnimating, isSendExiting]);

  React.useImperativeHandle(ref, () => ({
    toggle: toggleInput,
  }), [toggleInput]);

  const {
    attachments,
    clearAttachments,
    handleAttachmentRemove,
    handleImagePaste,
    previewAttachment,
    setPreviewAttachment,
    syncAttachmentPlaceholders,
  } = useWelcomeComposerAttachments(composerRef);

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
    [mentionPopover],
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
    [mentionPopover, selectMentionFile],
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
    selectedProjectPath: localPath ?? null,
  });

  const {
    filteredAgents,
    filteredProjects,
    filteredSkills,
    isSkillsLoading,
  } = useWelcomeSlashSearch({
    availableAgents: [],
    activeProjectId: activeProjectId ?? null,
    popover: slashPopover,
    projects: [],
  });

  const selectSlashSkill = React.useCallback(
    (skill: { path: string; name: string }) => {
      const popover = slashPopover;
      if (!popover) return;
      composerRef.current?.applySlashAtRange(
        popover.slashOffset,
        popover.query.length,
        { kind: "skill", absolutePath: skill.path, name: skill.name },
      );
      setSlashPopover(null);
    },
    [slashPopover],
  );

  const {
    activeIndex: activeSlashItemIndex,
    expandedSections,
    listRef: slashPopoverListRef,
    setExpandedSections,
    setItemRef: setSlashItemRef,
  } = useWelcomeSlashNavigation({
    filteredAgents,
    filteredProjects,
    filteredSkills,
    onSelectAgent: () => setSlashPopover(null),
    onSelectProject: () => setSlashPopover(null),
    onSelectSkill: selectSlashSkill,
    popover: slashPopover,
  });

  const handleTextChange = React.useCallback(
    (nextText: string) => {
      setText(nextText);
      syncAttachmentPlaceholders(nextText);
    },
    [syncAttachmentPlaceholders],
  );

  const finishSendExit = React.useCallback(() => {
    setIsSendExiting(false);
    setIsOpen(false);
  }, []);

  const startSendExit = React.useCallback(() => {
    setIsSendAnimating(false);
    setIsSendExiting(true);
  }, []);

  React.useEffect(() => {
    if (!isSendAnimating) return;
    const timer = window.setTimeout(startSendExit, 680);
    return () => window.clearTimeout(timer);
  }, [isSendAnimating, startSendExit]);

  React.useEffect(() => {
    if (!isSendExiting) return;
    const timer = window.setTimeout(finishSendExit, 180);
    return () => window.clearTimeout(timer);
  }, [finishSendExit, isSendExiting]);

  React.useEffect(() => {
    return () => {
      if (delayedSubmitTimerRef.current != null) {
        window.clearTimeout(delayedSubmitTimerRef.current);
      }
    };
  }, []);

  const launchFlyingMessage = React.useCallback((messageText: string) => {
    const shellRect = inputShellRef.current?.getBoundingClientRect();
    const target = getTerminalCursorClientPoint?.();
    if (!shellRect || !target) return;

    const trimmed = messageText.replace(/\s+/g, " ").trim();
    if (!trimmed) return;

    setFlyingMessage({
      id: flyingMessageIdRef.current + 1,
      text: trimmed.length > 90 ? `${trimmed.slice(0, 87)}...` : trimmed,
      from: {
        x: shellRect.left + shellRect.width / 2,
        y: shellRect.top + shellRect.height / 2,
      },
      to: target,
    });
    flyingMessageIdRef.current += 1;
  }, [getTerminalCursorClientPoint]);

  const submit = React.useCallback(async () => {
    const rawText = composerRef.current?.getText() ?? text;
    if (!isTerminalReady || !rawText.trim() || isSending || isSendAnimating || isSendExiting) return;
    setIsSending(true);
    try {
      const resolvedText = await resolveTerminalPrompt({
        attachments,
        localPath,
        text: rawText,
      });
      launchFlyingMessage(rawText);
      const trimmedResolvedText = resolvedText.trim();
      if (submitMode === "bracketed-paste-enter") {
        onSendText(wrapBracketedPaste(trimmedResolvedText));
        onSendEnter();
      } else if (submitMode === "text-ctrl-enter") {
        onSendText(trimmedResolvedText);
        if (delayedSubmitTimerRef.current != null) {
          window.clearTimeout(delayedSubmitTimerRef.current);
        }
        delayedSubmitTimerRef.current = window.setTimeout(() => {
          delayedSubmitTimerRef.current = null;
          onSendText(ctrlEnterInput());
        }, 80);
      } else {
        onSendText(trimmedResolvedText);
        onSendEnter();
      }
      setIsOpen(true);
      setIsSendAnimating(true);
      composerRef.current?.clear();
      clearAttachments();
      setMentionPopover(null);
      setSlashPopover(null);
    } catch (error) {
      console.error("Failed to submit terminal agent input:", error);
    } finally {
      setIsSending(false);
    }
  }, [
    attachments,
    clearAttachments,
    isSendAnimating,
    isSendExiting,
    isSending,
    isTerminalReady,
    launchFlyingMessage,
    localPath,
    onSendEnter,
    onSendText,
    submitMode,
    text,
  ]);

  const flyingMessagePortal =
    flyingMessage && typeof document !== "undefined"
      ? createPortal(
          <div
            key={flyingMessage.id}
            aria-hidden="true"
            className="terminal-agent-flying-message"
            style={{
              "--terminal-agent-fly-from-x": `${flyingMessage.from.x}px`,
              "--terminal-agent-fly-from-y": `${flyingMessage.from.y}px`,
              "--terminal-agent-fly-to-x": `${flyingMessage.to.x}px`,
              "--terminal-agent-fly-to-y": `${flyingMessage.to.y}px`,
            } as React.CSSProperties}
            onAnimationEnd={() => setFlyingMessage(null)}
          >
            {flyingMessage.text}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[70] flex justify-center px-3 pb-2">
      <div
        className="pointer-events-auto flex w-full max-w-3xl flex-col items-center"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => {
          if (!isSendAnimating && !isSendExiting && !text.trim() && attachments.length === 0) {
            setIsOpen(false);
          }
        }}
      >
        <div
          className={cn(
            "mb-2 grid w-full transition-[grid-template-rows,opacity,transform] duration-200 ease-out",
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
              className="terminal-agent-input-shell relative overflow-hidden rounded-[1.65rem] border border-border/70 bg-background/95 p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-md"
              data-send-animating={isSendAnimating ? "true" : "false"}
            >
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
              <div className="relative z-10 flex items-end gap-2 rounded-[1.25rem] bg-muted/30 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <PromptComposer
                    ref={composerRef}
                    placeholder={t("placeholder")}
                    placeholderClassName="left-0 top-1/2 -translate-y-1/2 truncate text-sm leading-5"
                    editorClassName="min-h-9 max-h-[92px] rounded-none py-2 pr-1 text-sm leading-5"
                    onSubmit={submit}
                    onTextChange={handleTextChange}
                    onImagePaste={handleImagePaste}
                    onAtTrigger={(ctx: AtTriggerContext) => {
                      const position = getPopoverAboveCaret(ctx.caretRect);
                      setSlashPopover(null);
                      setMentionPopover({
                        bottom: position.bottom,
                        left: position.left,
                        atOffset: ctx.atOffset,
                        query: ctx.query,
                      });
                    }}
                    onAtCancel={() => setMentionPopover(null)}
                    onSlashTrigger={(ctx: SlashTriggerContext) => {
                      const position = getPopoverAboveCaret(ctx.caretRect);
                      setMentionPopover(null);
                      setSlashPopover({
                        bottom: position.bottom,
                        left: position.left,
                        slashOffset: ctx.slashOffset,
                        query: ctx.query,
                      });
                    }}
                    onSlashCancel={() => setSlashPopover(null)}
                  />
                </div>
                <button
                  type="button"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-foreground text-background shadow-sm transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={!canSubmit}
                  onClick={() => void submit()}
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
              <AttachmentBar
                attachments={attachments}
                onRemove={handleAttachmentRemove}
                onPreview={setPreviewAttachment}
                className="relative z-10 px-3 pb-2 pt-1.5"
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          aria-label="Open agent input"
          className={cn(
            "h-1.5 w-32 rounded-full bg-foreground/25 shadow-[0_1px_8px_rgba(0,0,0,0.2)] transition-opacity duration-200",
            isOverlayVisible ? "opacity-0" : "opacity-100 hover:bg-foreground/35",
          )}
          onFocus={() => setIsOpen(true)}
          onMouseEnter={() => setIsOpen(true)}
        />
      </div>

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
        filteredAgents={filteredAgents}
        filteredProjects={filteredProjects}
        filteredSkills={filteredSkills}
        isSkillsLoading={isSkillsLoading}
        listRef={slashPopoverListRef}
        onClose={() => setSlashPopover(null)}
        onSelectAgent={() => setSlashPopover(null)}
        onSelectProject={() => setSlashPopover(null)}
        onSelectSkill={selectSlashSkill}
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
          onClose={() => setPreviewAttachment(null)}
        />
      ) : null}
      {flyingMessagePortal}
    </div>
  );
});
