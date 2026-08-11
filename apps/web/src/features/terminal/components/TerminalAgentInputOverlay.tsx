"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@workspace/ui";
import { Bot } from "lucide-react";

import type { SkillInfo } from "@/api/ws-api";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import {
  buildPipedAgentTerminalInput,
  sanitizeRunConfig,
  type TerminalAgentRunConfigInput,
} from "@/features/agent/lib/terminal-agent-run-config";
import {
  type AtTriggerContext,
  type ComposerHandle,
  type SlashTriggerContext,
} from "@/features/welcome/components/PromptComposer";
import { WelcomeAgentSelector } from "@/features/welcome/components/WelcomeComposerControls";
import {
  useComposerDisableSkills,
  type ComposerSkillsContext,
} from "@/features/skills/hooks/use-composer-disable-skills";
import {
  SKILL_DISABLE_DISMISS_SECONDS,
  stripSkillDisableSession,
  upsertSkillDisableSessionAction,
  type SkillDisableSessionAction,
} from "@/features/skills/lib/skill-disable-protocol";
import type { SlashPopoverView } from "@/features/welcome/components/SlashCommandPopover";
import type { AgentMenuOption } from "@/features/welcome/lib/welcome-page-helpers";
import {
  type MentionNavItem,
  type MentionPopoverState,
} from "@/features/welcome/components/WelcomeMentionPopover";
import { useWelcomeComposerAttachments } from "@/features/welcome/hooks/use-welcome-composer-attachments";
import { useWelcomeMentionSearch } from "@/features/welcome/hooks/use-welcome-mention-search";
import {
  useWelcomeSlashNavigation,
  type SlashCommandOption,
  type WelcomeSlashPopoverState,
} from "@/features/welcome/hooks/use-welcome-slash-navigation";
import { useWelcomeSlashSearch } from "@/features/welcome/hooks/use-welcome-slash-search";
import {
  BROWSER_USE_SLASH_COMMAND_ID,
  buildBrowserUseSlashCommand,
  matchesBrowserUseSlashQuery,
  resolveBrowserUseSkillRef,
} from "@/features/welcome/lib/slash-browser-use";
import {
  buildDesktopUseSlashCommand,
  DESKTOP_USE_SLASH_COMMAND_ID,
  matchesDesktopUseSlashQuery,
  resolveDesktopUseSkillRef,
} from "@/features/welcome/lib/slash-desktop-use";
import {
  buildViewRunLogsSlashCommand,
  matchesViewRunLogsSlashQuery,
  resolveViewRunLogsPromptText,
  VIEW_RUN_LOGS_SLASH_COMMAND_ID,
} from "@/features/browser/lib/run-log-context";
import { runLogApi } from "@/features/browser/lib/run-log-api";
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
import type { TerminalPaneAgent, TerminalSelectionSnapshot } from "../types";
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
import {
  createTerminalCaptureContextId,
  createTerminalSelectionContextFromSnapshot,
  expandPromptWithTerminalSelectionContexts,
  extractSideChatContextIds,
  extractSpawnContextIds,
  extractTerminalSelectionContextIds,
  hasKnownSideChatCommand,
  hasKnownSpawnCommand,
  resolveSelectionContextsForText,
  stripResolvedTerminalAiProtocolTokens,
  type TerminalPromptContext,
} from "../lib/terminal-ai-context-protocol";
import { useTerminalRichInputSettingsStore } from "@/features/settings/store/terminal-rich-input-settings-store";
import {
  selectPaneAttentionSummary,
  useAgentAttentionSummaryStore,
} from "@/features/agent/store/agent-attention-summary-store";
import { useAgentAttentionStore } from "@/features/agent/store/agent-attention-store";
import { agentHooksApi } from "@/api/rest-api";
import { AttentionSummaryPanel } from "./AttentionSummaryPanel";

import "./TerminalAgentInputOverlay.css";

interface TerminalAgentInputOverlayProps {
  activeProjectId?: string | null;
  agent?: TerminalPaneAgent | null;
  /** Stable pane id (`{context}:{tmux_window}`) for attention auto-summary chrome. */
  stablePaneId?: string | null;
  getSideChatFlyTargetClientPoint?: () => { x: number; y: number } | null;
  getTerminalCursorClientPoint?: () => { x: number; y: number } | null;
  isTerminalReady?: boolean;
  localPath?: string | null;
  onHide?: () => void;
  onInteraction?: (event: React.SyntheticEvent) => void;
  onSendEnter: () => void;
  onSendText: (text: string) => void;
  onStartSideChat?: (
    prompt: string,
    agent: TerminalPaneAgent,
    runConfig?: TerminalAgentRunConfigInput | null,
    contexts?: TerminalPromptContext[],
  ) => Promise<void> | void;
  onSpawn?: (
    prompt: string,
    agent: TerminalPaneAgent,
    runConfig?: TerminalAgentRunConfigInput | null,
    contexts?: TerminalPromptContext[],
  ) => Promise<void> | void;
  sideChatAgent?: TerminalPaneAgent | null;
  sideChatAgentOptions?: TerminalPaneAgent[];
  sideChatDots?: React.ReactNode;
  skillsContext?: ComposerSkillsContext | null;
  submitMode?: TerminalAgentSubmitMode;
  /**
   * When false (warm frame / inactive center tab), dismiss body-portal chrome
   * (slash/mention/preview) so it cannot paint over other workspaces. Does not
   * unmount the terminal tree — keep-alive hop stays seamless.
   */
  surfaceActive?: boolean;
}

export interface TerminalAgentInputOverlayHandle {
  focus: () => void;
  toggle: () => void;
  togglePin: () => void;
  addTerminalSelectionContext: (snapshot: TerminalSelectionSnapshot) => void;
  startSideChatForTerminalSelection: (snapshot: TerminalSelectionSnapshot) => void;
}

export const TerminalAgentInputOverlay = React.forwardRef<
  TerminalAgentInputOverlayHandle,
  TerminalAgentInputOverlayProps
>(function TerminalAgentInputOverlay({
  activeProjectId,
  agent,
  stablePaneId = null,
  getSideChatFlyTargetClientPoint,
  getTerminalCursorClientPoint,
  isTerminalReady = true,
  localPath,
  onHide,
  onInteraction,
  onSendEnter,
  onSendText,
  onStartSideChat,
  onSpawn,
  sideChatAgent,
  sideChatAgentOptions = [],
  sideChatDots,
  skillsContext = null,
  submitMode = "text-enter",
  surfaceActive = true,
}, ref) {
  const t = useTranslations("terminal.agentInput");
  const {
    enabled: richInputEnabled,
    triggerBarVisible,
    loaded: richInputSettingsLoaded,
    loadSettings: loadRichInputSettings,
  } = useTerminalRichInputSettingsStore();
  // Until prefs hydrate, treat Rich Input as off so a previously disabled
  // preference does not flash the composer for a frame.
  const richInputActive = richInputSettingsLoaded && richInputEnabled;
  const attentionSummary = useAgentAttentionSummaryStore(
    selectPaneAttentionSummary(stablePaneId ?? ""),
  );
  const hasAttentionSummary = !!attentionSummary;
  const isSummarySummarizing = attentionSummary?.status === "summarizing";
  const isSummaryActive =
    attentionSummary?.status === "summarizing" ||
    attentionSummary?.status === "ready" ||
    attentionSummary?.status === "error";
  const composerRef = React.useRef<ComposerHandle | null>(null);
  const inputShellRef = React.useRef<HTMLDivElement | null>(null);
  const delayedSubmitTimerRef = React.useRef<number | null>(null);
  const flyingMessageIdRef = React.useRef(0);
  const [isOpen, setIsOpen] = React.useState(false);
  const [isPinned, setIsPinned] = React.useState(false);

  React.useEffect(() => {
    void loadRichInputSettings();
  }, [loadRichInputSettings]);

  // After Computer switch, store resets to loaded=false; re-hydrate so the
  // default-on composer is not stuck off forever.
  React.useEffect(() => {
    if (richInputSettingsLoaded) return;
    void loadRichInputSettings();
  }, [richInputSettingsLoaded, loadRichInputSettings]);

  React.useEffect(() => {
    if (richInputActive) return;
    setIsOpen(false);
    setIsPinned(false);
  }, [richInputActive]);

  // Auto-open rich input when unattended summary starts or is ready so the
  // loading / result panel is visible above the composer.
  React.useEffect(() => {
    if (!richInputActive || !isSummaryActive) return;
    setIsOpen(true);
  }, [isSummaryActive, richInputActive]);
  const [text, setText] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const [isSendAnimating, setIsSendAnimating] = React.useState(false);
  const [isSendExiting, setIsSendExiting] = React.useState(false);
  const [flyingMessage, setFlyingMessage] = React.useState<TerminalAgentFlyingMessage | null>(null);
  const [mentionPopover, setMentionPopover] = React.useState<MentionPopoverState>(null);
  const [slashPopover, setSlashPopover] = React.useState<WelcomeSlashPopoverState>(null);
  const [slashPopoverView, setSlashPopoverView] = React.useState<SlashPopoverView>("menu");
  const [skillDisableFilter, setSkillDisableFilter] = React.useState("");
  const [skillDisableSessionActions, setSkillDisableSessionActions] = React.useState<
    SkillDisableSessionAction[]
  >([]);
  const suppressSlashCancelRef = React.useRef(false);
  const slashPopoverViewRef = React.useRef<SlashPopoverView>("menu");
  slashPopoverViewRef.current = slashPopoverView;
  const [pendingSidePrompt, setPendingSidePrompt] = React.useState<string | null>(null);
  const [pendingSideContexts, setPendingSideContexts] = React.useState<TerminalPromptContext[]>([]);
  const [pendingCommandKind, setPendingCommandKind] = React.useState<"side" | "spawn">("side");
  const [promptContexts, setPromptContexts] = React.useState<TerminalPromptContext[]>([]);
  const [selectedSideChatAgentId, setSelectedSideChatAgentId] = React.useState("");
  const [sideChatAgentSelectorOpen, setSideChatAgentSelectorOpen] = React.useState(false);
  const [agentSelectorAttention, setAgentSelectorAttention] = React.useState(false);
  const [sideChatRunConfigs, setSideChatRunConfigs] = React.useState<
    Record<string, TerminalAgentRunConfigInput | null>
  >({});
  const isOverlayVisible =
    isOpen || isSendAnimating || isSendExiting || isSummaryActive;
  const canSubmit = isTerminalReady && text.trim().length > 0 && !isSending && !isSendAnimating && !isSendExiting;

  const runnableSideChatAgents = React.useMemo(
    () => getRunnableUniqueSideChatAgents(sideChatAgentOptions),
    [sideChatAgentOptions],
  );
  const sideChatAgentMenuOptions = React.useMemo<AgentMenuOption[]>(
    () => runnableSideChatAgents.map(toSideChatAgentMenuOption),
    [runnableSideChatAgents],
  );
  const detectedSideChatAgent = React.useMemo(
    () => resolveDetectedSideChatAgent(sideChatAgent, runnableSideChatAgents),
    [runnableSideChatAgents, sideChatAgent],
  );
  const isSideCommandActive = React.useMemo(
    () => !!onStartSideChat && hasKnownSideChatCommand(text, promptContexts),
    [onStartSideChat, promptContexts, text],
  );
  const isSpawnCommandActive = React.useMemo(
    () => !!onSpawn && hasKnownSpawnCommand(text, promptContexts),
    [onSpawn, promptContexts, text],
  );
  const isContextCommandActive = isSideCommandActive || isSpawnCommandActive;
  const effectiveSelectedSideChatAgentId = selectedSideChatAgentId || detectedSideChatAgent?.id || "";
  const selectedSideChatAgent = React.useMemo(
    () => {
      if (!effectiveSelectedSideChatAgentId) return null;
      return (
        runnableSideChatAgents.find((agent) => agent.id === effectiveSelectedSideChatAgentId) ??
        (detectedSideChatAgent?.id === effectiveSelectedSideChatAgentId ? detectedSideChatAgent : null)
      );
    },
    [detectedSideChatAgent, effectiveSelectedSideChatAgentId, runnableSideChatAgents],
  );
  const shouldShowSideChatAgentSelector =
    isContextCommandActive && sideChatAgentMenuOptions.length > 0;

  const {
    error: disableSkillsError,
    loading: disableSkillsLoading,
    loadSkills: loadDisableSkills,
    pendingId: disableSkillsPendingId,
    setEnabled: setDisableSkillEnabled,
    skills: disableSkillsList,
  } = useComposerDisableSkills(skillsContext ?? null);

  const slashCommands = React.useMemo<SlashCommandOption[]>(() => {
    const query = slashPopover?.query.trim().toLowerCase() ?? "";
    const commands: SlashCommandOption[] = [];
    if (matchesBrowserUseSlashQuery(query)) {
      commands.push(
        buildBrowserUseSlashCommand({
          label: t("browserUseCommand.label"),
          description: t("browserUseCommand.description"),
        }),
      );
    }
    if (matchesDesktopUseSlashQuery(query)) {
      commands.push(
        buildDesktopUseSlashCommand({
          label: t("desktopUseCommand.label"),
          description: t("desktopUseCommand.description"),
        }),
      );
    }
    if (matchesViewRunLogsSlashQuery(query)) {
      commands.push(
        buildViewRunLogsSlashCommand({
          label: t("viewRunLogsCommand.label"),
          description: t("viewRunLogsCommand.description"),
        }),
      );
    }
    if (onStartSideChat && (!query || "side".includes(query))) {
      commands.push({
        id: "side",
        label: "Side",
        description: t("sideCommand.description"),
      });
    }
    if (onSpawn && (!query || "spawn".includes(query))) {
      commands.push({
        id: "spawn",
        label: "Spawn",
        description: t("spawnCommand.description"),
      });
    }
    if (
      skillsContext &&
      (!query ||
        "dynamic-skills".includes(query) ||
        "dynamic skills".includes(query) ||
        "disable-skill".includes(query) ||
        "disable skill".includes(query) ||
        "disable".includes(query) ||
        "skill".includes(query))
    ) {
      commands.push({
        id: "dynamic-skills",
        label: t("disableSkillCommand.label"),
        description: t("disableSkillCommand.description"),
      });
    }
    return commands;
  }, [onSpawn, onStartSideChat, skillsContext, slashPopover?.query, t]);

  const focusComposerSoon = React.useCallback(() => {
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }, []);

  const toggleInput = React.useCallback(() => {
    if (!richInputActive || isSendAnimating || isSendExiting) return;
    setIsOpen((current) => {
      const next = !current;
      if (next) focusComposerSoon();
      return next;
    });
    setMentionPopover(null);
    if (slashPopoverViewRef.current === "disable_skills") {
      composerRef.current?.beginSkillDisableChipDismiss(SKILL_DISABLE_DISMISS_SECONDS);
    }
    setSlashPopover(null);
    slashPopoverViewRef.current = "menu";
    setSlashPopoverView("menu");
    setSkillDisableFilter("");
    setSkillDisableSessionActions([]);
  }, [focusComposerSoon, isSendAnimating, isSendExiting, richInputActive]);

  const togglePin = React.useCallback(() => {
    if (!richInputActive) return;
    setIsPinned((current) => {
      const next = !current;
      if (next) {
        setIsOpen(true);
        focusComposerSoon();
      }
      return next;
    });
  }, [focusComposerSoon, richInputActive]);

  const focusInput = React.useCallback(() => {
    if (!richInputActive || isSendAnimating || isSendExiting) return;
    setIsOpen(true);
    focusComposerSoon();
  }, [focusComposerSoon, isSendAnimating, isSendExiting, richInputActive]);

  const prevOpenRef = React.useRef(isOpen);
  React.useEffect(() => {
    if (prevOpenRef.current && !isOpen) {
      onHide?.();
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, onHide]);

  const upsertPromptContext = React.useCallback((context: TerminalPromptContext) => {
    setPromptContexts((current) => [
      ...current.filter((item) => item.contextId !== context.contextId),
      context,
    ]);
  }, []);

  const createCapturePromptContext = React.useCallback(() => {
    const context: TerminalPromptContext = {
      kind: "terminal_capture",
      contextId: createTerminalCaptureContextId(),
    };
    upsertPromptContext(context);
    return context;
  }, [upsertPromptContext]);

  const insertTerminalSelectionContext = React.useCallback((snapshot: TerminalSelectionSnapshot) => {
    if (!richInputActive) return;
    const context = createTerminalSelectionContextFromSnapshot(snapshot);
    upsertPromptContext(context);
    setIsOpen(true);
    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.insertTerminalSelectionContext(context.contextId);
    });
  }, [richInputActive, upsertPromptContext]);

  const insertSideChatForTerminalSelection = React.useCallback((snapshot: TerminalSelectionSnapshot) => {
    if (!richInputActive) return;
    const context = createTerminalSelectionContextFromSnapshot(snapshot);
    upsertPromptContext(context);
    setIsOpen(true);
    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.insertSideChatCommand(context.contextId);
      composerRef.current?.insertTerminalSelectionContext(context.contextId);
    });
  }, [richInputActive, upsertPromptContext]);

  const stopOverlayInteractionPropagation = React.useCallback(
    (event: React.SyntheticEvent) => {
      onInteraction?.(event);
      event.stopPropagation();
    },
    [onInteraction],
  );

  React.useImperativeHandle(ref, () => ({
    focus: focusInput,
    toggle: toggleInput,
    togglePin,
    addTerminalSelectionContext: insertTerminalSelectionContext,
    startSideChatForTerminalSelection: insertSideChatForTerminalSelection,
  }), [focusInput, insertSideChatForTerminalSelection, insertTerminalSelectionContext, toggleInput, togglePin]);

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
    allSkills,
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
      setSlashPopoverView("menu");
      setSkillDisableFilter("");
    },
    [slashPopover],
  );

  const enterDisableSkillsView = React.useCallback(() => {
    const popover = slashPopover;
    if (!popover || !skillsContext) return;
    suppressSlashCancelRef.current = true;
    setSkillDisableSessionActions([]);
    composerRef.current?.applySkillDisableCommandAtRange(
      popover.slashOffset,
      popover.query.length,
    );
    slashPopoverViewRef.current = "disable_skills";
    setSlashPopoverView("disable_skills");
    setSkillDisableFilter("");
    void loadDisableSkills();
    window.requestAnimationFrame(() => {
      composerRef.current?.focusSkillDisableFilter();
      suppressSlashCancelRef.current = false;
    });
  }, [loadDisableSkills, skillsContext, slashPopover]);

  const backFromDisableSkills = React.useCallback(() => {
    suppressSlashCancelRef.current = true;
    slashPopoverViewRef.current = "menu";
    setSlashPopoverView("menu");
    setSkillDisableFilter("");
    setSkillDisableSessionActions([]);
    composerRef.current?.restoreSlashFromSkillDisable();
    window.requestAnimationFrame(() => {
      suppressSlashCancelRef.current = false;
    });
  }, []);

  const toggleDisableSkill = React.useCallback(
    async (skill: SkillInfo, enabled: boolean) => {
      const beforeEnabled = skill.status !== "disabled";
      const ok = await setDisableSkillEnabled(skill, enabled);
      if (!ok) return;
      setSkillDisableSessionActions((current) => {
        const next = upsertSkillDisableSessionAction(
          current,
          skill.id,
          skill.title || skill.name,
          beforeEnabled,
          enabled,
        );
        composerRef.current?.setSkillDisableSessionActions(next);
        return next;
      });
    },
    [setDisableSkillEnabled],
  );

  const selectSlashCommand = React.useCallback(
    (command: SlashCommandOption) => {
      if (command.id === "dynamic-skills") {
        enterDisableSkillsView();
        return;
      }
      if (command.id === VIEW_RUN_LOGS_SLASH_COMMAND_ID) {
        const popover = slashPopover;
        if (!popover) return;
        setSlashPopover(null);
        setSlashPopoverView("menu");
        void resolveViewRunLogsPromptText(localPath, (root) =>
          runLogApi.resolveLatest(root),
        ).then((promptText) => {
          composerRef.current?.applyAiContextAtRange(
            popover.slashOffset,
            popover.query.length,
            "run-log",
            promptText,
          );
        });
        return;
      }
      if (command.id === BROWSER_USE_SLASH_COMMAND_ID) {
        const popover = slashPopover;
        if (!popover) return;
        const skill = resolveBrowserUseSkillRef(allSkills);
        // Match ordinary skill selection: do not insert disabled skills.
        if (skill.status === "disabled") {
          setSlashPopover(null);
          setSlashPopoverView("menu");
          return;
        }
        // Non-blocking readiness: insert only when engine + permissions OK.
        setSlashPopover(null);
        setSlashPopoverView("menu");
        void import("@/features/desktop-use/lib/readiness-modal-bus").then(
          ({ gateDesktopUseFeature }) => {
            gateDesktopUseFeature("browser", {
              onReady: () => {
                composerRef.current?.applySlashAtRange(
                  popover.slashOffset,
                  popover.query.length,
                  {
                    kind: "skill",
                    absolutePath: skill.absolutePath,
                    name: skill.name,
                  },
                );
              },
            });
          },
        );
        return;
      }
      if (command.id === DESKTOP_USE_SLASH_COMMAND_ID) {
        const popover = slashPopover;
        if (!popover) return;
        const skill = resolveDesktopUseSkillRef(allSkills);
        if (skill.status === "disabled") {
          setSlashPopover(null);
          setSlashPopoverView("menu");
          return;
        }
        // Non-blocking readiness: insert only when engine + permissions OK.
        setSlashPopover(null);
        setSlashPopoverView("menu");
        void import("@/features/desktop-use/lib/readiness-modal-bus").then(
          ({ gateDesktopUseFeature }) => {
            gateDesktopUseFeature("slash", {
              onReady: () => {
                composerRef.current?.applySlashAtRange(
                  popover.slashOffset,
                  popover.query.length,
                  {
                    kind: "skill",
                    absolutePath: skill.absolutePath,
                    name: skill.name,
                  },
                );
              },
            });
          },
        );
        return;
      }
      if (command.id !== "side" && command.id !== "spawn") return;
      const popover = slashPopover;
      if (!popover) return;
      const context = createCapturePromptContext();
      if (command.id === "spawn") {
        composerRef.current?.applySpawnCommandAtRange(
          popover.slashOffset,
          popover.query.length,
          context.contextId,
        );
      } else {
        composerRef.current?.applySideCommandAtRange(
          popover.slashOffset,
          popover.query.length,
          context.contextId,
        );
      }
      setSlashPopover(null);
      setSlashPopoverView("menu");
      setSkillDisableFilter("");
    },
    [
      allSkills,
      createCapturePromptContext,
      enterDisableSkillsView,
      localPath,
      slashPopover,
    ],
  );

  const {
    activeIndex: activeSlashItemIndex,
    expandedSections,
    listRef: slashPopoverListRef,
    setExpandedSections,
    setItemRef: setSlashItemRef,
  } = useWelcomeSlashNavigation({
    enabled: slashPopoverView === "menu",
    filteredAgents,
    filteredCommands: slashCommands,
    filteredProjects,
    filteredSkills,
    onSelectAgent: () => {
      setSlashPopover(null);
      setSlashPopoverView("menu");
      setSkillDisableFilter("");
    },
    onSelectCommand: selectSlashCommand,
    onSelectProject: () => {
      setSlashPopover(null);
      setSlashPopoverView("menu");
      setSkillDisableFilter("");
    },
    onSelectSkill: selectSlashSkill,
    popover: slashPopover,
  });

  const closeSlashPopover = React.useCallback(() => {
    if (slashPopoverViewRef.current === "disable_skills") {
      composerRef.current?.beginSkillDisableChipDismiss(SKILL_DISABLE_DISMISS_SECONDS);
    }
    setSlashPopover(null);
    slashPopoverViewRef.current = "menu";
    setSlashPopoverView("menu");
    setSkillDisableFilter("");
    setSkillDisableSessionActions([]);
    setExpandedSections({
      skills: false,
      projects: false,
      agents: false,
    });
  }, [setExpandedSections]);

  /**
   * Warm/inactive surfaces keep the terminal tree mounted for seamless hops,
   * but body-portal chrome (slash/mention/preview/side picker) must dismiss so
   * it cannot paint over PR/Action or another workspace.
   */
  React.useEffect(() => {
    if (surfaceActive) return;
    setMentionPopover(null);
    closeSlashPopover();
    setPreviewAttachment(null);
    setFlyingMessage(null);
    setPendingSidePrompt(null);
    setPendingSideContexts([]);
    setSideChatAgentSelectorOpen(false);
  }, [closeSlashPopover, setPreviewAttachment, surfaceActive]);

  const handleSkillDisableSessionClosed = React.useCallback(() => {
    setSlashPopover(null);
    slashPopoverViewRef.current = "menu";
    setSlashPopoverView("menu");
    setSkillDisableFilter("");
    setSkillDisableSessionActions([]);
    setExpandedSections({
      skills: false,
      projects: false,
      agents: false,
    });
  }, [setExpandedSections]);

  const handleTextChange = React.useCallback(
    (nextText: string) => {
      setText(nextText);
      setPendingSidePrompt(null);
      setPendingSideContexts([]);
      const referencedIds = new Set([
        ...extractTerminalSelectionContextIds(nextText),
        ...extractSideChatContextIds(nextText),
        ...extractSpawnContextIds(nextText),
      ]);
      setPromptContexts((current) =>
        current.filter((context) => referencedIds.has(context.contextId)),
      );
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
    if (isPinned) {
      focusComposerSoon();
    } else {
      setIsOpen(false);
    }
  }, [focusComposerSoon, isPinned]);

  const startSendExit = React.useCallback(() => {
    setIsSendAnimating(false);
    setIsSendExiting(true);
  }, []);

  const resolveSideAgent = React.useCallback(() => {
    if (selectedSideChatAgent) {
      return {
        agent: selectedSideChatAgent,
        runConfig: sanitizeRunConfig(sideChatRunConfigs[selectedSideChatAgent.id]),
      };
    }
    return null;
  }, [selectedSideChatAgent, sideChatRunConfigs]);

  React.useEffect(() => {
    if (!selectedSideChatAgentId) return;
    if (runnableSideChatAgents.some((agent) => agent.id === selectedSideChatAgentId)) return;
    setSelectedSideChatAgentId("");
  }, [runnableSideChatAgents, selectedSideChatAgentId]);

  React.useEffect(() => {
    if (isContextCommandActive) return;
    setPendingSidePrompt(null);
    setPendingSideContexts([]);
    setSideChatAgentSelectorOpen(false);
    setSelectedSideChatAgentId("");
  }, [isContextCommandActive]);

  React.useEffect(() => {
    if (!agentSelectorAttention) return;
    const timer = window.setTimeout(() => setAgentSelectorAttention(false), 820);
    return () => window.clearTimeout(timer);
  }, [agentSelectorAttention]);

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

  const launchFlyingMessage = React.useCallback((
    messageText: string,
    targetOverride?: { x: number; y: number } | null,
  ) => {
    const message = buildTerminalAgentFlyingMessage({
      id: flyingMessageIdRef.current + 1,
      messageText,
      shell: inputShellRef.current,
      target: targetOverride ?? getTerminalCursorClientPoint?.(),
    });
    if (!message) return;

    setFlyingMessage(message);
    flyingMessageIdRef.current = message.id;
  }, [getTerminalCursorClientPoint]);

  const startSuccessfulSubmitAnimation = React.useCallback((
    messageText: string,
    targetOverride?: { x: number; y: number } | null,
  ) => {
    launchFlyingMessage(messageText, targetOverride);
    setIsOpen(true);
    setIsSendAnimating(true);
    composerRef.current?.clear();
    clearAttachments();
    setPromptContexts([]);
    setMentionPopover(null);
    setSlashPopover(null);
    setPendingSidePrompt(null);
    setPendingSideContexts([]);
    setSideChatAgentSelectorOpen(false);
  }, [clearAttachments, launchFlyingMessage]);

  const runSideChat = React.useCallback(async (
    prompt: string,
    agent: TerminalPaneAgent,
    runConfig?: TerminalAgentRunConfigInput | null,
    contexts: TerminalPromptContext[] = [],
  ) => {
    if (!onStartSideChat) return;
    await onStartSideChat(prompt, agent, sanitizeRunConfig(runConfig), contexts);
    const flyTarget = await resolveSideChatFlyTarget(getSideChatFlyTargetClientPoint);
    startSuccessfulSubmitAnimation(prompt, flyTarget);
  }, [getSideChatFlyTargetClientPoint, onStartSideChat, startSuccessfulSubmitAnimation]);

  const runSpawn = React.useCallback(async (
    prompt: string,
    agent: TerminalPaneAgent,
    runConfig?: TerminalAgentRunConfigInput | null,
    contexts: TerminalPromptContext[] = [],
  ) => {
    if (!onSpawn) return;
    await onSpawn(prompt, agent, sanitizeRunConfig(runConfig), contexts);
    startSuccessfulSubmitAnimation(prompt);
  }, [onSpawn, startSuccessfulSubmitAnimation]);

  const handleSideChatRunConfigChange = React.useCallback(
    (agentId: string, value: TerminalAgentRunConfigInput | null) => {
      setSideChatRunConfigs((current) => ({
        ...current,
        [agentId]: sanitizeRunConfig(value),
      }));
    },
    [],
  );

  const handleSideChatAgentSelect = React.useCallback(
    (agentId: string) => {
      setSelectedSideChatAgentId(agentId);
      const pendingPrompt = pendingSidePrompt;
      if (!pendingPrompt) return;
      const agent = runnableSideChatAgents.find((item) => item.id === agentId);
      if (!agent) return;
      const contexts = pendingSideContexts;
      const commandKind = pendingCommandKind;
      setPendingSidePrompt(null);
      setPendingSideContexts([]);
      setSideChatAgentSelectorOpen(false);
      const runConfig = sideChatRunConfigs[agentId] ?? null;
      if (commandKind === "spawn") {
        void runSpawn(pendingPrompt, agent, runConfig, contexts);
      } else {
        void runSideChat(pendingPrompt, agent, runConfig, contexts);
      }
    },
    [pendingCommandKind, pendingSideContexts, pendingSidePrompt, runnableSideChatAgents, runSideChat, runSpawn, sideChatRunConfigs],
  );

  const submit = React.useCallback(async () => {
    const rawText = stripSkillDisableSession(composerRef.current?.getText() ?? text);
    if (!isTerminalReady || !rawText.trim() || isSending || isSendAnimating || isSendExiting) return;
    setIsSending(true);
    try {
      const resolvedText = await resolveTerminalAgentPrompt({
        attachments: attachments as TerminalAgentPromptAttachment[],
        localPath,
        text: rawText,
      });
      const trimmedResolvedText = resolvedText.trim();
      const knownContextIds = new Set(promptContexts.map((context) => context.contextId));
      const sideContextIds = onStartSideChat ? extractSideChatContextIds(trimmedResolvedText) : [];
      const sideContextId = sideContextIds.find((contextId) => knownContextIds.has(contextId));
      const spawnContextIds = onSpawn ? extractSpawnContextIds(trimmedResolvedText) : [];
      const spawnContextId = spawnContextIds.find((contextId) => knownContextIds.has(contextId));
      if (sideContextId || spawnContextId) {
        const commandKind: "side" | "spawn" = spawnContextId ? "spawn" : "side";
        const runCommand = commandKind === "spawn" ? onSpawn : onStartSideChat;
        const prompt = stripResolvedTerminalAiProtocolTokens(
          trimmedResolvedText,
          promptContexts,
        ).trim();
        const selectedContexts = resolveSelectionContextsForText(
          trimmedResolvedText,
          promptContexts,
        );
        const contextAgent = resolveSideAgent();
        if (!prompt || !runCommand) {
          return;
        }
        if (!contextAgent) {
          setPendingSidePrompt(prompt);
          setPendingSideContexts(selectedContexts);
          setPendingCommandKind(commandKind);
          setIsOpen(true);
          if (shouldShowSideChatAgentSelector) {
            setSideChatAgentSelectorOpen(true);
            setAgentSelectorAttention(true);
          }
          focusComposerSoon();
          return;
        }
        if (commandKind === "spawn") {
          await runSpawn(prompt, contextAgent.agent, contextAgent.runConfig, selectedContexts);
        } else {
          await runSideChat(prompt, contextAgent.agent, contextAgent.runConfig, selectedContexts);
        }
        return;
      }

      const expandedResolvedText = expandPromptWithTerminalSelectionContexts({
        contexts: promptContexts,
        text: trimmedResolvedText,
      });
      const trimmedExpandedText = expandedResolvedText.trim();
      if (!trimmedExpandedText) return;
      const flyingText = stripResolvedTerminalAiProtocolTokens(rawText, promptContexts) || rawText;
      launchFlyingMessage(flyingText);
      const pipedInput =
        agent && trimmedExpandedText
          ? buildPipedAgentTerminalInput(agent.id, agent.command, trimmedExpandedText)
          : null;
      if (pipedInput) {
        onSendText(`${pipedInput}\r`);
        setIsOpen(true);
        setIsSendAnimating(true);
        composerRef.current?.clear();
        clearAttachments();
        setPromptContexts([]);
        setMentionPopover(null);
        setSlashPopover(null);
        return;
      }
      const isMultiLine = trimmedExpandedText.includes("\n");
      if (submitMode === "bracketed-paste-enter") {
        onSendText(wrapBracketedPaste(trimmedExpandedText));
        onSendEnter();
      } else if (submitMode === "text-ctrl-enter") {
        onSendText(isMultiLine ? wrapBracketedPaste(trimmedExpandedText) : trimmedExpandedText);
        if (delayedSubmitTimerRef.current != null) {
          window.clearTimeout(delayedSubmitTimerRef.current);
        }
        delayedSubmitTimerRef.current = window.setTimeout(() => {
          delayedSubmitTimerRef.current = null;
          onSendText(ctrlEnterInput());
        }, 80);
      } else {
        onSendText(isMultiLine ? wrapBracketedPaste(trimmedExpandedText) : trimmedExpandedText);
        onSendEnter();
      }
      setIsOpen(true);
      setIsSendAnimating(true);
      composerRef.current?.clear();
      clearAttachments();
      setPromptContexts([]);
      setMentionPopover(null);
      setSlashPopover(null);
    } catch (error) {
      console.error("Failed to submit terminal agent input:", error);
    } finally {
      setIsSending(false);
    }
  }, [
    agent,
    attachments,
    clearAttachments,
    isSendAnimating,
    isSendExiting,
    isSending,
    isTerminalReady,
    launchFlyingMessage,
    localPath,
    focusComposerSoon,
    onSendEnter,
    onSendText,
    onStartSideChat,
    onSpawn,
    promptContexts,
    resolveSideAgent,
    runSideChat,
    runSpawn,
    shouldShowSideChatAgentSelector,
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
    if (slashPopoverViewRef.current === "disable_skills") return;
    const position = getTerminalAgentPopoverAboveCaret(ctx.caretRect);
    setMentionPopover(null);
    setSlashPopover({
      bottom: position.bottom,
      left: position.left,
      slashOffset: ctx.slashOffset,
      query: ctx.query,
    });
    setSlashPopoverView("menu");
  }, []);

  // Rich Input off (or prefs not loaded yet): keep side-chat dots; no composer.
  if (!richInputActive) {
    if (!sideChatDots) return null;
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[70] flex justify-center px-3 pb-0.5">
        <div className="pointer-events-auto flex w-full max-w-3xl flex-col items-center">
          <div className="flex items-end">{sideChatDots}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[70] flex justify-center px-3 pb-0.5">
      <div
        className="pointer-events-auto flex w-full max-w-3xl flex-col items-center"
        onPointerDown={stopOverlayInteractionPropagation}
        onMouseDown={stopOverlayInteractionPropagation}
        onDoubleClick={stopOverlayInteractionPropagation}
        onDragOver={(event) => {
          if (!hasAgentContextDragData(event.dataTransfer)) return;
          onInteraction?.(event);
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "copy";
          setIsOpen(true);
          composerRef.current?.placeCaretAtClientPoint(event.clientX, event.clientY);
        }}
        onDrop={(event) => {
          const items = getAgentContextDragItems(event.dataTransfer);
          if (!items) return;
          onInteraction?.(event);
          event.preventDefault();
          event.stopPropagation();
          appendAgentContextItems(items, { x: event.clientX, y: event.clientY });
        }}
        onMouseLeave={() => {
          if (
            !isPinned &&
            !isSendAnimating &&
            !isSendExiting &&
            !isSummaryActive &&
            !text.trim() &&
            attachments.length === 0
          ) {
            setIsOpen(false);
          }
        }}
      >
        {hasAttentionSummary && attentionSummary ? (
          <div
            className={cn(
              "w-full transition-[opacity,transform] duration-200 ease-out",
              isOverlayVisible
                ? "opacity-100 translate-y-0"
                : "pointer-events-none opacity-0 translate-y-2",
            )}
          >
            <AttentionSummaryPanel
              summary={attentionSummary}
              onPickNextStep={(step) => {
                setIsOpen(true);
                setText(step);
                composerRef.current?.setText(step);
                focusComposerSoon();
              }}
              onDismiss={() => {
                if (!stablePaneId) return;
                // Optimistic local clear, then persist via attention-clear so
                // refresh hydration cannot resurrect the dismissed summary.
                useAgentAttentionSummaryStore.getState().clearPane(stablePaneId);
                useAgentAttentionStore.getState().clearPane(stablePaneId);
                void agentHooksApi
                  .clearAttention({ stablePaneId })
                  .catch((error) => {
                    console.warn(
                      "[TerminalAgentInputOverlay] Failed to clear attention on dismiss:",
                      error,
                    );
                  });
              }}
            />
          </div>
        ) : null}

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
          onSlashCancel={() => {
            if (suppressSlashCancelRef.current) return;
            if (slashPopoverViewRef.current === "disable_skills") return;
            closeSlashPopover();
          }}
          onSlashTrigger={handleSlashTrigger}
          onSkillDisableFilterChange={setSkillDisableFilter}
          onSkillDisableSessionClosed={handleSkillDisableSessionClosed}
          onSubmit={submit}
          placeholder={t("placeholder")}
          startSendExit={startSendExit}
          footerEndControl={
            shouldShowSideChatAgentSelector ? (
              <div className="flex items-center gap-1">
                <div className={agentSelectorAttention ? "terminal-agent-selector-attention" : undefined}>
                  <WelcomeAgentSelector
                    availableAgents={sideChatAgentMenuOptions}
                    contentAlign="end"
                    onInteraction={onInteraction}
                    onOpenChange={setSideChatAgentSelectorOpen}
                    onRunConfigChange={handleSideChatRunConfigChange}
                    onSelectAgent={handleSideChatAgentSelect}
                    open={sideChatAgentSelectorOpen}
                    purpose="interactive"
                    runConfigByAgentId={sideChatRunConfigs}
                    selectedAgentId={effectiveSelectedSideChatAgentId}
                    triggerPlacement="inline"
                  />
                </div>
              </div>
            ) : undefined
          }
        />

        <div className="flex items-end">
          {triggerBarVisible ? (
            <button
              type="button"
              aria-label="Open agent input"
              data-attention-summary={
                isSummaryActive
                  ? isSummarySummarizing
                    ? "summarizing"
                    : "ready"
                  : undefined
              }
              className={cn(
                "h-1 w-28 rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.16)] transition-[opacity,background-color,box-shadow] duration-200",
                isSummaryActive
                  ? "terminal-agent-input-trigger--summary bg-sky-500"
                  : "bg-foreground/25",
                isSummarySummarizing && "terminal-agent-input-trigger--pulse",
                isOverlayVisible && !isSummaryActive
                  ? "opacity-0"
                  : isSummaryActive
                    ? "opacity-100"
                    : "opacity-100 hover:bg-foreground/35",
              )}
              onFocus={() => setIsOpen(true)}
              onClick={focusInput}
              onMouseEnter={() => setIsOpen(true)}
            />
          ) : null}
          <div
            className={cn(
              "flex items-end gap-1 transition-opacity duration-200",
              isOverlayVisible ? "pointer-events-none opacity-0" : "opacity-100",
            )}
          >
            {sideChatDots}
          </div>
        </div>
      </div>

      {surfaceActive && pendingSidePrompt && !shouldShowSideChatAgentSelector ? (
        <SideChatAgentPicker
          agents={sideChatAgentOptions}
          onCancel={() => {
            setPendingSidePrompt(null);
            setPendingSideContexts([]);
          }}
          onInteraction={onInteraction}
          onSelect={(agent) => {
            const contexts = pendingSideContexts;
            const commandKind = pendingCommandKind;
            setPendingSideContexts([]);
            if (commandKind === "spawn") {
              void runSpawn(pendingSidePrompt, agent, null, contexts);
            } else {
              void runSideChat(pendingSidePrompt, agent, null, contexts);
            }
          }}
        />
      ) : null}

      {surfaceActive ? (
        <TerminalAgentInputPopovers
          activeMentionFileIndex={activeMentionFileIndex}
          activeSlashItemIndex={activeSlashItemIndex}
          disableSkills={
            slashPopoverView === "disable_skills"
              ? {
                  filter: skillDisableFilter,
                  loading: disableSkillsLoading,
                  pendingId: disableSkillsPendingId,
                  skills: disableSkillsList,
                  error: disableSkillsError,
                }
              : null
          }
          expandedSections={expandedSections}
          filteredAgents={filteredAgents}
          filteredCommands={slashCommands}
          filteredProjects={filteredProjects}
          filteredSkills={filteredSkills}
          isMentionFilesLoading={isMentionFilesLoading}
          isSkillsLoading={isSkillsLoading}
          mentionFiles={mentionFiles}
          mentionPopover={mentionPopover}
          mentionPopoverListRef={mentionPopoverListRef}
          onBackFromDisableSkills={backFromDisableSkills}
          onCloseMention={() => setMentionPopover(null)}
          onCloseSlash={closeSlashPopover}
          onSelectMentionFile={selectMentionFile}
          onSelectMentionNavItem={selectMentionNavItem}
          onSelectSlashAgent={() => {
            setSlashPopover(null);
            setSlashPopoverView("menu");
            setSkillDisableFilter("");
          }}
          onSelectSlashCommand={selectSlashCommand}
          onSelectSlashProject={() => {
            setSlashPopover(null);
            setSlashPopoverView("menu");
            setSkillDisableFilter("");
          }}
          onSelectSlashSkill={selectSlashSkill}
          onToggleDisableSkill={(skill, enabled) => {
            void toggleDisableSkill(skill, enabled);
          }}
          onClosePreviewAttachment={() => setPreviewAttachment(null)}
          previewAttachment={previewAttachment}
          setExpandedSections={setExpandedSections}
          setMentionItemRef={setMentionItemRef}
          setSlashItemRef={setSlashItemRef}
          slashPopover={slashPopover}
          slashPopoverListRef={slashPopoverListRef}
          slashPopoverView={slashPopoverView}
        />
      ) : null}
      {surfaceActive ? (
        <TerminalAgentFlyingMessagePortal
          message={flyingMessage}
          onDone={() => setFlyingMessage(null)}
        />
      ) : null}
    </div>
  );
});

async function resolveSideChatFlyTarget(
  getTarget?: () => { x: number; y: number } | null,
): Promise<{ x: number; y: number } | null> {
  if (!getTarget || typeof window === "undefined") return null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const target = getTarget();
    if (target) return target;
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }
  return null;
}

function getRunnableUniqueSideChatAgents(agents: TerminalPaneAgent[]): TerminalPaneAgent[] {
  const seen = new Set<string>();
  const runnableAgents: TerminalPaneAgent[] = [];
  for (const agent of agents) {
    if (!agent.command?.trim() || seen.has(agent.id)) continue;
    seen.add(agent.id);
    runnableAgents.push(agent);
  }
  return runnableAgents;
}

function resolveDetectedSideChatAgent(
  sideChatAgent: TerminalPaneAgent | null | undefined,
  runnableAgents: TerminalPaneAgent[],
): TerminalPaneAgent | null {
  if (!sideChatAgent?.id) return null;
  const runnableMatch = runnableAgents.find((agent) => agent.id === sideChatAgent.id);
  if (runnableMatch) return runnableMatch;
  return sideChatAgent.command?.trim() ? sideChatAgent : null;
}

function toSideChatAgentMenuOption(agent: TerminalPaneAgent): AgentMenuOption {
  return {
    id: agent.id,
    label: agent.label,
    command: agent.command,
    launchCommand: agent.command,
    iconType: agent.iconType,
  };
}

function SideChatAgentPicker({
  agents,
  onCancel,
  onInteraction,
  onSelect,
}: {
  agents: TerminalPaneAgent[];
  onCancel: () => void;
  onInteraction?: (event: React.SyntheticEvent) => void;
  onSelect: (agent: TerminalPaneAgent) => void;
}) {
  const t = useTranslations("terminal.agentInput.sideCommand");
  const runnableAgents = agents.filter((agent) => agent.command?.trim());

  return (
    <div
      className="pointer-events-auto fixed bottom-20 left-1/2 z-[2147483647] w-[min(92vw,320px)] -translate-x-1/2 rounded-md border border-border/70 bg-popover p-1 text-sm text-popover-foreground shadow-lg"
      onMouseDown={(event) => {
        onInteraction?.(event);
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        onInteraction?.(event);
        event.stopPropagation();
      }}
      onWheel={(event) => {
        onInteraction?.(event);
        event.stopPropagation();
      }}
    >
      <div className="px-2.5 py-2 text-xs font-medium text-muted-foreground">
        {t("chooseAgent")}
      </div>
      {runnableAgents.length > 0 ? (
        runnableAgents.map((agent) => (
          <button
            key={agent.id}
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left hover:bg-muted"
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(agent);
            }}
          >
            {agent.iconType === "built-in" ? (
              <AgentIcon registryId={agent.id} name={agent.label} size={16} />
            ) : (
              <Bot className="size-4 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate">{agent.label}</span>
          </button>
        ))
      ) : (
        <div className="px-2.5 py-2 text-xs text-muted-foreground">
          {t("noAgent")}
        </div>
      )}
      <button
        type="button"
        className="mt-1 flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
        onMouseDown={(event) => {
          event.preventDefault();
          onCancel();
        }}
      >
        {t("cancel")}
      </button>
    </div>
  );
}
