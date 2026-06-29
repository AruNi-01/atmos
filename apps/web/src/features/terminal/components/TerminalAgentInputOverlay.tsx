"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@workspace/ui";

import {
  type AtTriggerContext,
  type ComposerHandle,
  type SlashTriggerContext,
} from "@/features/welcome/components/PromptComposer";
import {
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
import {
  getAgentContextDragItems,
  hasAgentContextDragData,
  type AgentContextDragItem,
} from "@/shared/lib/agent-context-drag";
import {
  ctrlEnterInput,
  type TerminalAgentSubmitMode,
  wrapBracketedPaste,
} from "../lib/terminal-runtime-utils";
import { TerminalAgentFlyingMessagePortal } from "./TerminalAgentFlyingMessagePortal";
import { TerminalAgentInputPopovers } from "./TerminalAgentInputPopovers";
import { TerminalAgentInputShell } from "./TerminalAgentInputShell";
import {
  buildTerminalAgentFlyingMessage,
  getTerminalAgentPopoverAboveCaret,
  resolveTerminalAgentPrompt,
  type TerminalAgentFlyingMessage,
  type TerminalAgentPromptAttachment,
} from "../lib/terminal-agent-input-overlay-utils";

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
  const [flyingMessage, setFlyingMessage] = React.useState<TerminalAgentFlyingMessage | null>(null);
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

  const appendAgentContextItems = React.useCallback(
    (items: AgentContextDragItem[], point?: { x: number; y: number }) => {
      if (point) {
        composerRef.current?.placeCaretAtClientPoint(point.x, point.y);
      } else {
        composerRef.current?.focus();
      }
      for (const item of items) {
        const path = item.kind === "directory" && !item.path.endsWith("/")
          ? `${item.path}/`
          : item.path;
        composerRef.current?.insertFileMention(path);
      }
      const nextText = composerRef.current?.getText() ?? text;
      setText(nextText);
      syncAttachmentPlaceholders(nextText);
      setIsOpen(true);
      focusComposerSoon();
    },
    [focusComposerSoon, syncAttachmentPlaceholders, text],
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
    const timer = window.setTimeout(startSendExit, 590);
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
    const message = buildTerminalAgentFlyingMessage({
      id: flyingMessageIdRef.current + 1,
      messageText,
      shell: inputShellRef.current,
      target: getTerminalCursorClientPoint?.(),
    });
    if (!message) return;

    setFlyingMessage(message);
    flyingMessageIdRef.current = message.id;
  }, [getTerminalCursorClientPoint]);

  const submit = React.useCallback(async () => {
    const rawText = composerRef.current?.getText() ?? text;
    if (!isTerminalReady || !rawText.trim() || isSending || isSendAnimating || isSendExiting) return;
    setIsSending(true);
    try {
      const resolvedText = await resolveTerminalAgentPrompt({
        attachments: attachments as TerminalAgentPromptAttachment[],
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

  const handleAtTrigger = React.useCallback((ctx: AtTriggerContext) => {
    const position = getTerminalAgentPopoverAboveCaret(ctx.caretRect);
    setSlashPopover(null);
    setMentionPopover({
      bottom: position.bottom,
      left: position.left,
      atOffset: ctx.atOffset,
      query: ctx.query,
    });
  }, []);

  const handleSlashTrigger = React.useCallback((ctx: SlashTriggerContext) => {
    const position = getTerminalAgentPopoverAboveCaret(ctx.caretRect);
    setMentionPopover(null);
    setSlashPopover({
      bottom: position.bottom,
      left: position.left,
      slashOffset: ctx.slashOffset,
      query: ctx.query,
    });
  }, []);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[70] flex justify-center px-3 pb-1">
      <div
        className="pointer-events-auto flex w-full max-w-3xl flex-col items-center"
        onDragOver={(event) => {
          if (!hasAgentContextDragData(event.dataTransfer)) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "copy";
          setIsOpen(true);
          composerRef.current?.placeCaretAtClientPoint(event.clientX, event.clientY);
        }}
        onDrop={(event) => {
          const items = getAgentContextDragItems(event.dataTransfer);
          if (!items) return;
          event.preventDefault();
          event.stopPropagation();
          appendAgentContextItems(items, { x: event.clientX, y: event.clientY });
        }}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => {
          if (!isSendAnimating && !isSendExiting && !text.trim() && attachments.length === 0) {
            setIsOpen(false);
          }
        }}
      >
        <TerminalAgentInputShell
          attachments={attachments}
          canSubmit={canSubmit}
          composerRef={composerRef}
          handleAttachmentRemove={handleAttachmentRemove}
          handleImagePaste={handleImagePaste}
          handleTextChange={handleTextChange}
          inputShellRef={inputShellRef}
          isOverlayVisible={isOverlayVisible}
          isSendAnimating={isSendAnimating}
          isSendExiting={isSendExiting}
          isSending={isSending}
          onAtCancel={() => setMentionPopover(null)}
          onAtTrigger={handleAtTrigger}
          onPreviewAttachment={setPreviewAttachment}
          onSlashCancel={() => setSlashPopover(null)}
          onSlashTrigger={handleSlashTrigger}
          onSubmit={submit}
          placeholder={t("placeholder")}
          startSendExit={startSendExit}
        />

        <button
          type="button"
          aria-label="Open agent input"
          className={cn(
            "h-1 w-28 rounded-full bg-foreground/25 shadow-[0_1px_4px_rgba(0,0,0,0.16)] transition-opacity duration-200",
            isOverlayVisible ? "opacity-0" : "opacity-100 hover:bg-foreground/35",
          )}
          onFocus={() => setIsOpen(true)}
          onMouseEnter={() => setIsOpen(true)}
        />
      </div>

      <TerminalAgentInputPopovers
        activeMentionFileIndex={activeMentionFileIndex}
        activeSlashItemIndex={activeSlashItemIndex}
        expandedSections={expandedSections}
        filteredAgents={filteredAgents}
        filteredProjects={filteredProjects}
        filteredSkills={filteredSkills}
        isMentionFilesLoading={isMentionFilesLoading}
        isSkillsLoading={isSkillsLoading}
        mentionFiles={mentionFiles}
        mentionPopover={mentionPopover}
        mentionPopoverListRef={mentionPopoverListRef}
        onCloseMention={() => setMentionPopover(null)}
        onCloseSlash={() => setSlashPopover(null)}
        onSelectMentionFile={selectMentionFile}
        onSelectMentionNavItem={selectMentionNavItem}
        onSelectSlashAgent={() => setSlashPopover(null)}
        onSelectSlashProject={() => setSlashPopover(null)}
        onSelectSlashSkill={selectSlashSkill}
        onClosePreviewAttachment={() => setPreviewAttachment(null)}
        previewAttachment={previewAttachment}
        setExpandedSections={setExpandedSections}
        setMentionItemRef={setMentionItemRef}
        setSlashItemRef={setSlashItemRef}
        slashPopover={slashPopover}
        slashPopoverListRef={slashPopoverListRef}
      />
      <TerminalAgentFlyingMessagePortal
        message={flyingMessage}
        onDone={() => setFlyingMessage(null)}
      />
    </div>
  );
});
