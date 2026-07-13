"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toastManager,
} from "@workspace/ui";
import { Terminal, Bot, Loader2, AlertTriangle, Plus } from "lucide-react";
import { AgentSelect, buildCommand, type AgentId } from "@/features/wiki/components/AgentSelect";
import { skillsApi, agentApi, reviewWsApi } from "@/api/ws-api";
import type { RegistryAgent, CustomAgent, ReviewTarget } from "@/api/ws-api";
import { cn } from "@/shared/lib/utils";
import { useDialogStore } from "@/app-shell/state/use-dialog-store";
import { useAgentChatUrl } from "@/features/agent/hooks/use-agent-chat-url";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import type { TerminalAgentRunConfigInput } from "@/features/agent/lib/terminal-agent-run-config";

// ===== Skill 定义 =====

export type CodeReviewSkillId = "fullstack-reviewer" | "code-review-expert" | "typescript-react-reviewer";

export interface CodeReviewSkill {
  id: CodeReviewSkillId;
  label: string;
  badge: string;
  description: string;
  bestFor: string;
}

import { useAgentUiPrefs, useCodeReviewDefaults } from "@/shared/stores/use-ui-pref-hooks";

// ===== 工具函数 =====

/**
 * Returns the single code review skill ID.
 */
export function inferSkillFromFiles(_filePaths: string[]): CodeReviewSkillId {
  return "fullstack-reviewer";
}

export function buildCodeReviewPrompt(skillId: string, reportPath: string): string {
  const skillPath = `~/.atmos/skills/.system/code_review_skills/${skillId}/SKILL.md`;
  return `Read the skill instructions at ${skillPath} and follow them to perform a thorough code review of the current git changes (run 'git diff' and 'git diff --staged' to see changes). After completing the review, write the full review report in Markdown format to the file '${reportPath}' (Remember to dynamically replace the 'code_review' part of the file name according to the content of the review). Create parent directories if needed. Do not ask for confirmation before writing the file.\n\nIMPORTANT: This is a review-only task. Do NOT automatically fix or modify any code. Only report the issues you find. Any fixes must be explicitly requested and approved by the user.`;
}

/**
 * Build the terminal command for code review.
 * The agent will read the skill instructions and write the report to the specified file.
 */
export function buildCodeReviewCommand(
  agentId: AgentId,
  skillId: CodeReviewSkillId,
  reportPath: string
): string {
  const prompt = buildCodeReviewPrompt(skillId, reportPath);
  return buildCommand(agentId, prompt);
}

// ===== Props =====

export interface CodeReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Workspace ID for context (kept for backward compat; prefer reviewTarget) */
  workspaceId?: string;
  /** Review target (workspace or project scope). Takes precedence over workspaceId. */
  reviewTarget?: ReviewTarget;
  /** Changed file paths from git diff, used to infer default skill */
  changedFilePaths?: string[];
  /** Called when user chooses Terminal Tab mode (first launch) */
  onStartTerminalMode: (command: string) => void;
  /** Called when user re-launches and a previous terminal exists */
  onReplaceTerminalAndRun: (command: string) => Promise<void>;
  /** Project name for report file naming */
  projectName?: string;
  /** Current git branch for report file naming */
  currentBranch?: string;
  /** Workspace local path for report file location */
  workspacePath?: string;
  /** Project main file path (used for storing reviews) */
  projectMainPath?: string;
}

// ===== Component =====

export const CodeReviewDialog: React.FC<CodeReviewDialogProps> = ({
  open,
  onOpenChange,
  workspaceId,
  reviewTarget,
  changedFilePaths = [],
  onStartTerminalMode,
  onReplaceTerminalAndRun,
  projectName,
  currentBranch,
  workspacePath,
  projectMainPath,
}) => {
  const t = useTranslations("codeReview.dialog");
  const defaultSkills = React.useMemo(
    () => getDefaultCodeReviewSkills(t),
    [t],
  );
  const [skillsList, setSkillsList] = useState<CodeReviewSkill[]>(defaultSkills);
  const [loadingSkillsList, setLoadingSkillsList] = useState(false);
  const [codeReviewDefaults, setCodeReviewDefaults] = useCodeReviewDefaults();
  const [agentPrefs] = useAgentUiPrefs();
  const resolveStoredSkillId = (skills: CodeReviewSkill[]): CodeReviewSkillId => {
    const stored = codeReviewDefaults.defaultSkillId;
    if (stored && skills.some(s => s.id === stored)) {
      return stored as CodeReviewSkillId;
    }
    return "fullstack-reviewer";
  };
  const resolveStoredAgentId = (): AgentId => {
    const stored = codeReviewDefaults.defaultAgentId ?? agentPrefs.defaultRegistryId;
    return (stored as AgentId) || "claude";
  };
  const [skillId, setSkillId] = useState<CodeReviewSkillId>(() =>
    resolveStoredSkillId(defaultSkills),
  );
  const [agentId, setAgentId] = useState<AgentId>(() => resolveStoredAgentId());
  const [agentRunConfigs, setAgentRunConfigs] = useState<Record<string, TerminalAgentRunConfigInput | null>>({});
  const [acpAgentId, setAcpAgentId] = useState<string>("");
  const [executionMode, setExecutionMode] = useState<"acp" | "cli">("acp");
  const [installedAcpAgents, setInstalledAcpAgents] = useState<RegistryAgent[]>([]);
  const [loadingAcpAgents, setLoadingAcpAgents] = useState(false);
  const [skillsReady, setSkillsReady] = useState<boolean | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCreatingSkill, setIsCreatingSkill] = useState(false);
  const [, setAgentChatOpen] = useAgentChatUrl();
  const { enqueueAgentChatPrompt, setPendingAgentChatMode } = useDialogStore();
  const router = useAppRouter();

  // Load or refresh the review skill list. Returns the fetched array so callers
  // can react to new entries (e.g. preselect a skill that was just scaffolded).
  const refreshSkillsList = useCallback(async (): Promise<CodeReviewSkill[]> => {
    setLoadingSkillsList(true);
    try {
      const { skills } = await skillsApi.listReviewSkills();
      if (skills.length > 0) {
        const mapped: CodeReviewSkill[] = skills.map((s) => ({
          id: s.id as CodeReviewSkillId,
          label: s.label,
          badge: s.badge,
          description: s.description,
          bestFor: s.bestFor,
        }));
        setSkillsList(mapped);
        return mapped;
      }
      return skillsList;
    } catch {
      // Keep the hardcoded defaults on failure
      return skillsList;
    } finally {
      setLoadingSkillsList(false);
    }
  }, [skillsList]);

  // Fetch ACP agents, skills list, and system status
  useEffect(() => {
    if (!open) return;
    setSkillsReady(null);
    skillsApi.isCodeReviewSkillsInstalledInSystem().then((installed) => {
      setSkillsReady(installed);
    }).catch(() => {
      setSkillsReady(false);
    });

    refreshSkillsList();

    setLoadingAcpAgents(true);
    Promise.all([
      agentApi.listRegistry(),
      agentApi.listCustomAgents(),
    ]).then(([{ agents }, { agents: customAgents }]) => {
      const installed = agents.filter((a: RegistryAgent) => a.installed);
      const customAsRegistry: RegistryAgent[] = customAgents.map((c: CustomAgent) => ({
        id: c.name,
        name: c.name,
        version: "",
        description: `${c.command} ${c.args.join(" ")}`,
        repository: null,
        icon: null,
        cli_command: `${c.command} ${c.args.join(" ")}`,
        install_method: "custom",
        package: null,
        installed: true,
        default_config: c.default_config,
      }));
      const allInstalled = [...installed, ...customAsRegistry];
      setInstalledAcpAgents(allInstalled);
      if (allInstalled.length > 0) {
        setAcpAgentId((current) => current || allInstalled[0].id);
      }
    }).finally(() => {
      setLoadingAcpAgents(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-infer skill from changed files when dialog opens
  useEffect(() => {
    if (!open || changedFilePaths.length === 0) return;
    if (!codeReviewDefaults.defaultSkillId) {
      setSkillId(inferSkillFromFiles(changedFilePaths));
    }
  }, [open, changedFilePaths, codeReviewDefaults.defaultSkillId]);

  const handleSkillChange = useCallback((value: string) => {
    const id = value as CodeReviewSkillId;
    setSkillId(id);
    setCodeReviewDefaults({ defaultSkillId: id });
  }, [setCodeReviewDefaults]);

  const handleAgentChange = useCallback((value: AgentId) => {
    setAgentId(value);
    setCodeReviewDefaults({ defaultAgentId: value });
  }, [setCodeReviewDefaults]);
  const currentAgentRunConfig = agentRunConfigs[agentId] ?? null;

  const createReviewAgentRun = useCallback(
    async (mode: "copy_prompt" | "agent_chat") => {
      // Resolve the effective target: prefer explicit reviewTarget, fall back to workspaceId prop
      const effectiveTarget: ReviewTarget | null =
        reviewTarget ??
        (workspaceId ? { kind: "workspace", workspaceId } : null);
      if (!effectiveTarget) return null;
      const sessions = await reviewWsApi.listSessions(effectiveTarget, true);
      let session = sessions.find((item) => item.status === "active") ?? null;
      if (!session) {
        const now = new Date();
        const pad = (value: number) => String(value).padStart(2, "0");
        session = await reviewWsApi.createSession({
          target: effectiveTarget,
          title: t("reviewRun.sessionTitle", {
            timestamp: `${pad(now.getMonth() + 1)}.${pad(now.getDate())}-${pad(now.getHours())}:${pad(now.getMinutes())}`,
          }),
        });
      }
      return reviewWsApi.createAgentRun({
        sessionGuid: session.guid,
        baseRevisionGuid: session.current_revision_guid,
        runKind: "review",
        executionMode: mode,
        skillId,
      });
    },
    [reviewTarget, skillId, t, workspaceId],
  );

  /** Generate report file path: {projectMainPath}/.atmos/reviews/{workspaceId}/{project}_{branch}_{timestamp}_{topic}.md */
  const buildReportPath = useCallback((): string => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    // Format: YYYYMMDD-HHMMSS (Windows-safe, no ':' in file names)
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const safeName = (s?: string) => (s || "unknown").replace(/[^a-zA-Z0-9_\-]/g, "_");

    // Default topic for now, could be dynamic in future
    const topic = "code_review";

    const parts = [safeName(projectName), safeName(currentBranch), timestamp, topic]
      .filter(Boolean)
      .join("_");
    const base = projectMainPath || workspacePath || ".";
    // Derive context id from effective target
    const effectiveTarget = reviewTarget ?? (workspaceId ? { kind: "workspace", workspaceId } : null);
    const ctxId = effectiveTarget
      ? (effectiveTarget.kind === "workspace" ? effectiveTarget.workspaceId : effectiveTarget.projectId)
      : "default";
    return `${base}/.atmos/reviews/${ctxId}/${parts}.md`;
  }, [projectName, currentBranch, projectMainPath, workspacePath, workspaceId, reviewTarget]);

  const handleStart = useCallback(
    async () => {
      if (isStarting) return;
      setIsStarting(true);
      try {
        const reviewRun = await createReviewAgentRun("copy_prompt");
        const command = reviewRun
          ? buildCommand(agentId, reviewRun.prompt, currentAgentRunConfig)
          : buildCommand(agentId, buildCodeReviewPrompt(skillId, buildReportPath()), currentAgentRunConfig);
        onStartTerminalMode(command);
        onOpenChange(false);
        toastManager.add({
          title: t("toasts.startSuccess.title"),
          description: reviewRun
            ? t("toasts.startSuccess.descriptionReviewRun")
            : t("toasts.startSuccess.descriptionReportPath"),
          type: "success",
        });
      } catch (err) {
        toastManager.add({
          title: t("toasts.startError.title"),
          description: err instanceof Error ? err.message : t("errors.unknown"),
          type: "error",
        });
      } finally {
        setIsStarting(false);
      }
    },
    [isStarting, buildReportPath, agentId, currentAgentRunConfig, skillId, onStartTerminalMode, onOpenChange, createReviewAgentRun, t]
  );

  const handleReplace = useCallback(
    async () => {
      if (isStarting) return;
      setIsStarting(true);
      try {
        const reviewRun = await createReviewAgentRun("copy_prompt");
        const command = reviewRun
          ? buildCommand(agentId, reviewRun.prompt, currentAgentRunConfig)
          : buildCommand(agentId, buildCodeReviewPrompt(skillId, buildReportPath()), currentAgentRunConfig);
        await onReplaceTerminalAndRun(command);
        onOpenChange(false);
      } catch (err) {
        toastManager.add({
          title: t("toasts.restartError.title"),
          description: err instanceof Error ? err.message : t("errors.unknown"),
          type: "error",
        });
      } finally {
        setIsStarting(false);
      }
    },
    [isStarting, buildReportPath, agentId, currentAgentRunConfig, skillId, onReplaceTerminalAndRun, onOpenChange, createReviewAgentRun, t]
  );

  const handleStartInAgent = useCallback(async () => {
    if (isStarting || !acpAgentId) return;
    setIsStarting(true);
    try {
      const reviewRun = await createReviewAgentRun("agent_chat");
      const prompt = reviewRun?.prompt ?? buildCodeReviewPrompt(skillId, buildReportPath());
      const now = new Date();
      const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const titleName = projectName || t("sessionTitle.defaultProjectName");
      const sessionTitle = t("sessionTitle.value", {
        projectName: titleName,
        timestamp: timeStr,
      });
      enqueueAgentChatPrompt({
        prompt,
        workspaceId,
        mode: "default",
        registryId: acpAgentId,
        forceNewSession: true,
        sessionTitle,
        origin: "code_review",
      });
      setPendingAgentChatMode("default");
      onOpenChange(false);
      setAgentChatOpen(true);
      toastManager.add({
        title: t("toasts.queueSuccess.title"),
        description: reviewRun
          ? t("toasts.queueSuccess.descriptionReviewRun")
          : t("toasts.queueSuccess.descriptionAcp"),
        type: "success",
      });
    } catch (err) {
      toastManager.add({
        title: t("toasts.queueError.title"),
        description: err instanceof Error ? err.message : t("errors.unknown"),
        type: "error",
      });
    } finally {
      setIsStarting(false);
    }
  }, [isStarting, acpAgentId, buildReportPath, skillId, projectName, enqueueAgentChatPrompt, workspaceId, setPendingAgentChatMode, onOpenChange, setAgentChatOpen, createReviewAgentRun, t]);

  const handleSyncSkills = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await skillsApi.syncSystemSkills();
      toastManager.add({
        title: t("toasts.syncStarted.title"),
        description: t("toasts.syncStarted.description"),
        type: "success",
      });
      // Poll for status or wait
      setTimeout(async () => {
        const installed = await skillsApi.isCodeReviewSkillsInstalledInSystem();
        setSkillsReady(installed);
        setIsSyncing(false);
      }, 5000);
    } catch (err) {
      toastManager.add({
        title: t("toasts.syncFailed.title"),
        description: err instanceof Error ? err.message : t("toasts.syncFailed.descriptionFallback"),
        type: "error",
      });
      setIsSyncing(false);
    }
  }, [isSyncing, t]);

  const handleCreateCustomSkill = useCallback(async () => {
    if (isCreatingSkill) return;
    setIsCreatingSkill(true);
    try {
      const result = await skillsApi.scaffoldReviewSkill();

      // Navigate to the Skills detail page for the newly created skill. The backend
      // scanner exposes `~/.atmos/skills/.system/code_review_skills/<id>` as a
      // scope="system" SkillInfo (id = `system::-::<dir_name>`), which SkillsView loads
      // via skillsApi.get and renders inside SkillDetail so the user can browse the
      // tree and edit SKILL.md immediately.
      const skillInfoId = `system::-::${result.id}`;
      const href = `/skills?scope=system&skillId=${encodeURIComponent(skillInfoId)}`;

      onOpenChange(false);
      router.push(href);

      toastManager.add({
        title: t("toasts.createSkillSuccess.title"),
        description: `${t("toasts.createSkillSuccess.description", {
          path: result.path,
        })}${
          result.needs_sync
            ? ` ${t("toasts.createSkillSuccess.needsSyncWarning")}`
            : ""
        }`,
        type: result.needs_sync ? "warning" : "success",
      });
    } catch (err) {
      toastManager.add({
        title: t("toasts.createSkillError.title"),
        description: err instanceof Error ? err.message : t("errors.unknown"),
        type: "error",
      });
    } finally {
      setIsCreatingSkill(false);
    }
  }, [isCreatingSkill, onOpenChange, router, t]);

  const selectedSkill = skillsList.find((s) => s.id === skillId) ?? skillsList[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-4" />
            {t("dialog.title")}
          </DialogTitle>
          <DialogDescription>
            {t("dialog.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Skills status warning */}
          {skillsReady === false && (
            <div className="flex flex-col gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5 text-sm text-yellow-600 dark:text-yellow-400">
              <div className="flex items-start gap-2">
                <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                <span>
                  {t("skillsWarning.description")}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-fit h-7 text-[10px] mt-1 border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-300"
                onClick={handleSyncSkills}
                disabled={isSyncing}
              >
                {isSyncing ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
                {isSyncing ? t("skillsWarning.syncing") : t("skillsWarning.action")}
              </Button>
            </div>
          )}

          {/* Skill Selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
              {t("skillSelector.label")}
            </label>
            <Select value={skillId} onValueChange={handleSkillChange}>
              <SelectTrigger className="w-full cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {skillsList.map((skill) => (
                  <SelectItem key={skill.id} value={skill.id}>
                    <div className="flex items-center gap-2">
                      <span>{skill.label}</span>
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded font-medium",
                          "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        )}
                      >
                        {skill.badge}
                      </span>
                    </div>
                  </SelectItem>
                ))}
                {loadingSkillsList && (
                  <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground w-full justify-center">
                    <Loader2 className="size-3 animate-spin" />
                    <span>{t("skillSelector.loading")}</span>
                  </div>
                )}
              </SelectContent>
            </Select>

            {/* Skill description */}
            <div className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground space-y-2">
              <div>
                <p>{selectedSkill?.description}</p>
                <p className="font-medium text-foreground/70 mt-1">
                  {t("skillSelector.bestForLabel")} {selectedSkill?.bestFor}
                </p>
              </div>
              <div className="pt-2 border-t border-border/50 text-[10px] text-muted-foreground/80 flex items-center justify-between gap-2">
                <span className="flex-1">
                  {t.rich("skillSelector.createHint", {
                    strong: (chunks) => (
                      <span className="font-medium text-foreground/80">{chunks}</span>
                    ),
                  })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-1.5 text-[10px] shrink-0 gap-1"
                  onClick={handleCreateCustomSkill}
                  disabled={isCreatingSkill}
                  title={t("skillSelector.createButtonTitle")}
                >
                  {isCreatingSkill ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                  {isCreatingSkill ? t("skillSelector.creating") : t("skillSelector.create")}
                </Button>
              </div>
            </div>
          </div>

          <Tabs value={executionMode} onValueChange={(v) => setExecutionMode(v as "acp" | "cli")}>
            <TabsList className="w-full grid mx-auto mb-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <TabsTrigger value="acp">{t("executionTabs.acp")}</TabsTrigger>
              <TabsTrigger value="cli">{t("executionTabs.cli")}</TabsTrigger>
            </TabsList>

            <TabsContent value="acp" className="mt-0">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
                {t("acp.label")}
              </label>
              <Select value={acpAgentId} onValueChange={setAcpAgentId} disabled={loadingAcpAgents || installedAcpAgents.length === 0}>
                <SelectTrigger className="w-full cursor-pointer">
                  <SelectValue placeholder={
                    loadingAcpAgents ? t("acp.placeholderLoading") :
                      (installedAcpAgents.length === 0 ? t("acp.placeholderEmpty") : t("acp.placeholderReady"))
                  } />
                </SelectTrigger>
                <SelectContent>
                  {installedAcpAgents.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      <div className="flex items-center gap-2">
                        <AgentIcon registryId={opt.id} name={opt.name} size={16} registryIcon={opt.icon} />
                        {opt.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1.5 h-6">
                {t("acp.helper")}
              </p>
            </TabsContent>

            <TabsContent value="cli" className="mt-0">
              <AgentSelect
                value={agentId}
                onValueChange={handleAgentChange}
                enableRunConfig
                runConfig={currentAgentRunConfig}
                runConfigByAgentId={agentRunConfigs}
                onRunConfigChange={(nextAgentId, nextValue) => {
                  setAgentRunConfigs((prev) => ({
                    ...prev,
                    [nextAgentId]: nextValue,
                  }));
                  handleAgentChange(nextAgentId);
                }}
                helperText={t("cli.helper")}
              />
            </TabsContent>
          </Tabs>

          {/* Report path preview */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5 mt-2">
              {t("reportPath.label")}
            </label>
            <p className="text-[11px] text-muted-foreground font-mono bg-muted/50 rounded px-2 py-1.5 break-all">
              {projectMainPath || workspacePath || "."}/
              <span className="text-foreground/80">.atmos/reviews/{workspaceId || t("reportPath.defaultContextId")}/</span>
              <br />
              {[
                (projectName || t("reportPath.defaultProjectName")).replace(/[^a-zA-Z0-9_\-]/g, "_"),
                (currentBranch || t("reportPath.defaultBranchName")).replace(/[^a-zA-Z0-9_\-]/g, "_"),
                "YYYYMMDD-HHMMSS",
                "code_review"
              ].join("_")}
              .md
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {t("reportPath.help")}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-1">
          {executionMode === "acp" ? (
            <Button
              className="w-full gap-2"
              onClick={handleStartInAgent}
              disabled={isStarting || skillsReady === false || !acpAgentId}
            >
              <Bot className="size-4" />
              {t("actions.startViaAcp")}
            </Button>
          ) : (
            <>
              <Button
                className="w-full gap-2"
                onClick={handleStart}
                disabled={isStarting || skillsReady === false}
              >
                {isStarting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Terminal className="size-4" />
                )}
                {t("actions.startInNewTerminal")}
              </Button>
              <Button
                variant="ghost"
                className="w-full gap-2 text-xs"
                onClick={handleReplace}
                disabled={isStarting || skillsReady === false}
              >
                {t("actions.restart")}
              </Button>
              <p className="text-center text-[10px] text-muted-foreground">
                {t("actions.terminalHint")}
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

function getDefaultCodeReviewSkills(
  t: ReturnType<typeof useTranslations>,
): CodeReviewSkill[] {
  return [
    {
      id: "fullstack-reviewer",
      label: t("defaultSkills.fullstack.label"),
      badge: t("defaultSkills.fullstack.badge"),
      description: t("defaultSkills.fullstack.description"),
      bestFor: t("defaultSkills.fullstack.bestFor"),
    },
    {
      id: "code-review-expert",
      label: t("defaultSkills.backend.label"),
      badge: t("defaultSkills.backend.badge"),
      description: t("defaultSkills.backend.description"),
      bestFor: t("defaultSkills.backend.bestFor"),
    },
    {
      id: "typescript-react-reviewer",
      label: t("defaultSkills.tsReact.label"),
      badge: t("defaultSkills.tsReact.badge"),
      description: t("defaultSkills.tsReact.description"),
      bestFor: t("defaultSkills.tsReact.bestFor"),
    },
  ];
}
