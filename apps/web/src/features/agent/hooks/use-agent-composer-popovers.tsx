"use client";

import React from "react";
import type { SkillInfo } from "@/api/ws-api";
import {
  WelcomeMentionPopover,
  type MentionNavItem,
  type MentionPopoverState,
} from "@/features/welcome/components/WelcomeMentionPopover";
import {
  SlashCommandPopover,
  type SlashPopoverView,
} from "@/features/welcome/components/SlashCommandPopover";
import {
  PromptComposer,
  type AtTriggerContext,
  type ComposerHandle,
  type SlashTriggerContext,
} from "@/features/welcome/components/PromptComposer";
import { useWelcomeMentionSearch } from "@/features/welcome/hooks/use-welcome-mention-search";
import { useWelcomeSlashSearch } from "@/features/welcome/hooks/use-welcome-slash-search";
import {
  COLLAPSED_SLASH_SECTIONS,
  useWelcomeSlashNavigation,
  type SlashCommandOption,
  type WelcomeSlashPopoverState,
} from "@/features/welcome/hooks/use-welcome-slash-navigation";
import { getTerminalAgentPopoverAboveCaret } from "@/features/terminal/lib/terminal-agent-input-overlay-utils";
import { useTranslations } from "next-intl";
import type { AgentChatSlashCommand } from "@/features/agent/hooks/use-agent-chat-session";
import {
  BROWSER_USE_SLASH_COMMAND_ID,
  browserUseSlashNeedsDesktopUseGate,
  buildBrowserUseSlashCommand,
  ensureBrowserUseSlashSurface,
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
import { getPreferredRunLogWindow } from "@/features/browser/lib/run-log-active-window";
import { runLogApi } from "@/features/browser/lib/run-log-api";
import {
  buildDevicePreviewSlashCommand,
  DEVICE_PREVIEW_SLASH_COMMAND_ID,
  loadDevicePreviewPrompt,
  matchesDevicePreviewSlashQuery,
} from "@/features/simulator/lib/device-preview-agent-prompt";
import { useComposerDisableSkills } from "@/features/skills/hooks/use-composer-disable-skills";
import { resolveAgentChatSkillsContext } from "@/features/agent/lib/agent-chat-skills-context";
import {
  SKILL_DISABLE_DISMISS_SECONDS,
  upsertSkillDisableSessionAction,
  type SkillDisableSessionAction,
} from "@/features/skills/lib/skill-disable-protocol";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import { useContextParams } from "@/shared/hooks/use-context-params";

function matchesDynamicSkillsSlashQuery(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    "dynamic-skills".includes(q) ||
    "dynamic skills".includes(q) ||
    "disable-skill".includes(q) ||
    "disable skill".includes(q) ||
    "disable".includes(q) ||
    "skill".includes(q)
  );
}

export function useAgentComposerPopovers({
  availableCommands,
  projectPath,
  composerRef,
  activeProjectId = null,
  agentName = null,
  sessionWorkspaceId = null,
}: {
  availableCommands: AgentChatSlashCommand[];
  projectPath: string | null;
  composerRef: React.RefObject<ComposerHandle | null>;
  activeProjectId?: string | null;
  agentName?: string | null;
  sessionWorkspaceId?: string | null;
}) {
  const t = useTranslations("Welcome.components");
  const { effectiveContextId } = useContextParams();
  const projects = useProjects();
  const [mentionPopover, setMentionPopover] = React.useState<MentionPopoverState>(null);
  const [slashPopover, setSlashPopover] = React.useState<WelcomeSlashPopoverState>(null);
  const [slashPopoverView, setSlashPopoverView] = React.useState<SlashPopoverView>("menu");
  const [skillDisableFilter, setSkillDisableFilter] = React.useState("");
  const [, setSkillDisableSessionActions] = React.useState<
    SkillDisableSessionAction[]
  >([]);
  const suppressSlashCancelRef = React.useRef(false);
  const slashPopoverViewRef = React.useRef<SlashPopoverView>("menu");
  slashPopoverViewRef.current = slashPopoverView;
  const commandsTitle = agentName?.trim()
    ? t("slashPopover.agentCommands", { agent: agentName.trim() })
    : t("slashPopover.commands");
  const atmosCommandsTitle = t("slashPopover.atmosCommands");
  const browserContextId = sessionWorkspaceId ?? effectiveContextId;
  const skillsContext = React.useMemo(
    () =>
      resolveAgentChatSkillsContext({
        activeProjectId,
        sessionWorkspaceId,
        projectPath,
        projects,
      }),
    [activeProjectId, projectPath, projects, sessionWorkspaceId],
  );
  const {
    error: disableSkillsError,
    loading: disableSkillsLoading,
    loadSkills: loadDisableSkills,
    pendingId: disableSkillsPendingId,
    setEnabled: setDisableSkillEnabled,
    skills: disableSkillsList,
  } = useComposerDisableSkills(skillsContext);

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

  const { allSkills, filteredSkills, isSkillsLoading } = useWelcomeSlashSearch({
    availableAgents: [],
    activeProjectId,
    popover: slashPopover,
    projects: [],
  });

  const filteredAtmosCommands = React.useMemo<SlashCommandOption[]>(() => {
    const query = slashPopover?.query.trim().toLowerCase() ?? "";
    const commands: SlashCommandOption[] = [];
    if (matchesBrowserUseSlashQuery(query)) {
      commands.push(
        buildBrowserUseSlashCommand({
          label: t("slashPopover.browserUse.label"),
          description: t("slashPopover.browserUse.description"),
        }),
      );
    }
    if (matchesDesktopUseSlashQuery(query)) {
      commands.push(
        buildDesktopUseSlashCommand({
          label: t("slashPopover.desktopUse.label"),
          description: t("slashPopover.desktopUse.description"),
        }),
      );
    }
    if (matchesViewRunLogsSlashQuery(query)) {
      commands.push(
        buildViewRunLogsSlashCommand({
          label: t("slashPopover.viewRunLogs.label"),
          description: t("slashPopover.viewRunLogs.description"),
        }),
      );
    }
    if (matchesDevicePreviewSlashQuery(query)) {
      commands.push(
        buildDevicePreviewSlashCommand({
          label: t("slashPopover.devicePreview.label"),
          description: t("slashPopover.devicePreview.description"),
        }),
      );
    }
    if (skillsContext && matchesDynamicSkillsSlashQuery(query)) {
      commands.push({
        id: "dynamic-skills",
        label: t("slashPopover.disableSkill.label"),
        description: t("slashPopover.disableSkill.description"),
      });
    }
    return commands;
  }, [skillsContext, slashPopover?.query, t]);

  const filteredCommands = React.useMemo<SlashCommandOption[]>(() => {
    const query = slashPopover?.query.trim().toLowerCase() ?? "";
    const commands: SlashCommandOption[] = [];
    for (const command of availableCommands) {
      if (query) {
        const matches =
          command.name.toLowerCase().includes(query) ||
          command.description.toLowerCase().includes(query);
        if (!matches) continue;
      }
      commands.push({
        id: command.name,
        label: `/${command.name}`,
        description: command.hint?.trim()
          ? `${command.description} (${command.hint.trim()})`
          : command.description,
      });
    }
    return commands;
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
      setSlashPopoverView("menu");
      setSkillDisableFilter("");
    },
    [composerRef, slashPopover],
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
      const popover = slashPopover;
      if (!popover) return;
      if (command.id === VIEW_RUN_LOGS_SLASH_COMMAND_ID) {
        setSlashPopover(null);
        setSlashPopoverView("menu");
        void resolveViewRunLogsPromptText(projectPath, (root) =>
          runLogApi.resolveLatest(root, getPreferredRunLogWindow(root)),
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
      if (command.id === DEVICE_PREVIEW_SLASH_COMMAND_ID) {
        setSlashPopover(null);
        setSlashPopoverView("menu");
        void loadDevicePreviewPrompt(sessionWorkspaceId ?? effectiveContextId).then(
          (promptText) => {
            composerRef.current?.applyAiContextAtRange(
              popover.slashOffset,
              popover.query.length,
              "device-preview",
              promptText,
            );
          },
        );
        return;
      }
      if (command.id === BROWSER_USE_SLASH_COMMAND_ID) {
        const skill = resolveBrowserUseSkillRef(allSkills);
        if (skill.status === "disabled") {
          setSlashPopover(null);
          setSlashPopoverView("menu");
          return;
        }
        setSlashPopover(null);
        setSlashPopoverView("menu");
        const insertSkill = () => {
          composerRef.current?.applySlashAtRange(
            popover.slashOffset,
            popover.query.length,
            {
              kind: "skill",
              absolutePath: skill.absolutePath,
              name: skill.name,
            },
          );
        };
        if (!browserUseSlashNeedsDesktopUseGate()) {
          insertSkill();
          ensureBrowserUseSlashSurface(browserContextId);
          return;
        }
        void import("@/features/desktop-use/lib/readiness-modal-bus").then(
          ({ gateDesktopUseFeature }) => {
            gateDesktopUseFeature("browser", {
              onReady: insertSkill,
            });
          },
        );
        return;
      }
      if (command.id === DESKTOP_USE_SLASH_COMMAND_ID) {
        const skill = resolveDesktopUseSkillRef(allSkills);
        if (skill.status === "disabled") {
          setSlashPopover(null);
          setSlashPopoverView("menu");
          return;
        }
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
      const matched = availableCommands.find((item) => item.name === command.id);
      if (matched) {
        composerRef.current?.applySlashAtRange(
          popover.slashOffset,
          popover.query.length,
          { kind: "command", name: matched.name },
        );
      }
      setSlashPopover(null);
      setSlashPopoverView("menu");
    },
    [
      allSkills,
      availableCommands,
      browserContextId,
      composerRef,
      effectiveContextId,
      enterDisableSkillsView,
      projectPath,
      sessionWorkspaceId,
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
    filteredAgents: [],
    filteredAtmosCommands,
    filteredCommands,
    filteredProjects: [],
    filteredSkills,
    onSelectAgent: () => undefined,
    onSelectCommand: selectSlashCommand,
    onSelectProject: () => undefined,
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
    setExpandedSections({ ...COLLAPSED_SLASH_SECTIONS });
  }, [composerRef, setExpandedSections]);

  const handleSkillDisableSessionClosed = React.useCallback(() => {
    setSlashPopover(null);
    slashPopoverViewRef.current = "menu";
    setSlashPopoverView("menu");
    setSkillDisableFilter("");
    setSkillDisableSessionActions([]);
    setExpandedSections({ ...COLLAPSED_SLASH_SECTIONS });
  }, [setExpandedSections]);

  const onAtTrigger = React.useCallback((ctx: AtTriggerContext) => {
    if (slashPopoverViewRef.current === "disable_skills") return;
    const position = getTerminalAgentPopoverAboveCaret(ctx.caretRect);
    setSlashPopover(null);
    setSlashPopoverView("menu");
    setMentionPopover({
      bottom: position.bottom,
      left: position.left,
      atOffset: ctx.atOffset,
      query: ctx.query,
    });
  }, []);

  const onSlashTrigger = React.useCallback((ctx: SlashTriggerContext) => {
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

  const closePopovers = React.useCallback(() => {
    setMentionPopover(null);
    closeSlashPopover();
  }, [closeSlashPopover]);

  const onAtCancel = React.useCallback(() => {
    setMentionPopover(null);
  }, []);

  const onSlashCancel = React.useCallback(() => {
    if (suppressSlashCancelRef.current) return;
    if (slashPopoverViewRef.current === "disable_skills") return;
    closeSlashPopover();
  }, [closeSlashPopover]);

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
        filteredAgents={[]}
        filteredAtmosCommands={filteredAtmosCommands}
        filteredCommands={filteredCommands}
        filteredProjects={[]}
        filteredSkills={filteredSkills}
        isSkillsLoading={isSkillsLoading}
        listRef={slashPopoverListRef}
        onBackFromDisableSkills={backFromDisableSkills}
        onClose={closeSlashPopover}
        onSelectAgent={() => undefined}
        onSelectCommand={selectSlashCommand}
        onSelectProject={() => undefined}
        onSelectSkill={selectSlashSkill}
        onToggleDisableSkill={(skill, enabled) => {
          void toggleDisableSkill(skill, enabled);
        }}
        popover={slashPopover}
        setExpandedSections={setExpandedSections}
        setItemRef={setSlashItemRef}
        showAgents={false}
        showAtmosCommands={filteredAtmosCommands.length > 0}
        showCommands={filteredCommands.length > 0}
        showProjects={false}
        showSkills
        atmosCommandsTitle={atmosCommandsTitle}
        commandsTitle={commandsTitle}
        view={slashPopoverView}
      />
    </>
  );

  return {
    closePopovers,
    onAtCancel,
    onAtTrigger,
    onSlashCancel,
    onSlashTrigger,
    onSkillDisableFilterChange: setSkillDisableFilter,
    onSkillDisableSessionClosed: handleSkillDisableSessionClosed,
    popovers,
    skillDisableSessionOpen: slashPopoverView === "disable_skills",
  };
}

export { PromptComposer };
