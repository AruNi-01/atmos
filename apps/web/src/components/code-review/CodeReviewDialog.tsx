"use client";

import React, { useState, useEffect, useCallback } from "react";
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
import { Terminal, Bot, Loader2, AlertTriangle } from "lucide-react";
import { AgentSelect, buildCommand, type AgentId } from "@/components/wiki/AgentSelect";
import { skillsApi, agentApi } from "@/api/ws-api";
import type { RegistryAgent, CustomAgent } from "@/api/ws-api";
import { cn } from "@/lib/utils";
import { useDialogStore } from "@/hooks/use-dialog-store";
import { useAgentChatUrl } from "@/hooks/use-agent-chat-url";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui";
import { AgentIcon } from "@/components/agent/AgentIcon";

// ===== Skill 定义 =====

export type CodeReviewSkillId = "fullstack-reviewer" | "code-review-expert" | "typescript-react-reviewer";

export interface CodeReviewSkill {
  id: CodeReviewSkillId;
  label: string;
  badge: string;
  description: string;
  bestFor: string;
}

export const CODE_REVIEW_SKILLS: CodeReviewSkill[] = [
  {
    id: "fullstack-reviewer",
    label: "Fullstack Reviewer",
    badge: "Fullstack",
    description:
      "Fullstack code review, automatically detects the project tech stack, covering frontend and backend. Outputs a P0-P3 structured report including security, performance, architecture, and code quality.",
    bestFor: "Fullstack review for any project",
  },
  {
    id: "code-review-expert",
    label: "Backend Arch Expert",
    badge: "Backend",
    description:
      "A senior backend engineer specializing in architecture and comprehensive reviews. Focuses on database design, caching, concurrency, API design, security, and backend performance.",
    bestFor: "Complex backend logic, API, and DB architectural reviews",
  },
  {
    id: "typescript-react-reviewer",
    label: "TypeScript React Expert",
    badge: "TS/React",
    description:
      "A specialized code reviewer for TypeScript and React projects. Focuses on typed hooks, functional components, state management, render optimization, and Next.js / React server components practices.",
    bestFor: "React/Next.js frontend applications",
  },
];

const SKILL_STORAGE_KEY = "atmos.code_review.default_skill_id";
const AGENT_STORAGE_KEY = "atmos.code_review.default_agent_id";

// ===== 工具函数 =====

function readStoredSkillId(skillsList: CodeReviewSkill[]): CodeReviewSkillId {
  if (typeof window === "undefined") return "fullstack-reviewer";
  const stored = localStorage.getItem(SKILL_STORAGE_KEY);
  if (stored && skillsList.some((s) => s.id === stored)) {
    return stored as CodeReviewSkillId;
  }
  return "fullstack-reviewer";
}

function readStoredAgentId(): AgentId {
  if (typeof window === "undefined") return "claude";
  const stored = localStorage.getItem(AGENT_STORAGE_KEY);
  if (stored) return stored as AgentId;
  // Also check wiki's default agent key for consistency
  const wikiDefault = localStorage.getItem("atmos.agent.default_registry_id");
  if (wikiDefault) return wikiDefault as AgentId;
  return "claude";
}

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
  return buildCommand(agentId, prompt, true);
}

// ===== Props =====

export interface CodeReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Workspace ID for context */
  workspaceId?: string;
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
  changedFilePaths = [],
  onStartTerminalMode,
  onReplaceTerminalAndRun,
  projectName,
  currentBranch,
  workspacePath,
  projectMainPath,
}) => {
  const [skillsList, setSkillsList] = useState<CodeReviewSkill[]>(CODE_REVIEW_SKILLS);
  const [loadingSkillsList, setLoadingSkillsList] = useState(false);
  const [skillId, setSkillId] = useState<CodeReviewSkillId>(readStoredSkillId(CODE_REVIEW_SKILLS));
  const [agentId, setAgentId] = useState<AgentId>(readStoredAgentId);
  const [acpAgentId, setAcpAgentId] = useState<string>("");
  const [executionMode, setExecutionMode] = useState<"acp" | "cli">("acp");
  const [installedAcpAgents, setInstalledAcpAgents] = useState<RegistryAgent[]>([]);
  const [loadingAcpAgents, setLoadingAcpAgents] = useState(false);
  const [skillsReady, setSkillsReady] = useState<boolean | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [, setAgentChatOpen] = useAgentChatUrl();
  const { setPendingAgentChatPrompt, setPendingAgentChatMode } = useDialogStore();

  // Fetch ACP agents, skills list, and system status
  useEffect(() => {
    if (!open) return;
    setSkillsReady(null);
    skillsApi.isCodeReviewSkillsInstalledInSystem().then((installed) => {
      setSkillsReady(installed);
    }).catch(() => {
      setSkillsReady(false);
    });

    // TODO: Re-enable when backend implements /api/review-skills endpoint
    // setSkillsList([]);
    setLoadingSkillsList(false);

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
      if (allInstalled.length > 0 && !acpAgentId) {
        setAcpAgentId(allInstalled[0].id);
      }
    }).finally(() => {
      setLoadingAcpAgents(false);
    });
  }, [open]);

  // Auto-infer skill from changed files when dialog opens
  useEffect(() => {
    if (!open || changedFilePaths.length === 0) return;
    const stored = localStorage.getItem(SKILL_STORAGE_KEY);
    // Only auto-infer if user hasn't explicitly saved a preference
    if (!stored) {
      setSkillId(inferSkillFromFiles(changedFilePaths));
    }
  }, [open, changedFilePaths]);

  const handleSkillChange = useCallback((value: string) => {
    const id = value as CodeReviewSkillId;
    setSkillId(id);
    localStorage.setItem(SKILL_STORAGE_KEY, id);
  }, []);

  const handleAgentChange = useCallback((value: AgentId) => {
    setAgentId(value);
    localStorage.setItem(AGENT_STORAGE_KEY, value);
  }, []);

  /** Generate report file path: {projectMainPath}/.atmos/reviews/{workspaceId}/{project}_{branch}_{timestamp}_{topic}.md */
  const buildReportPath = useCallback((): string => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    // Format: YYYYMMDD-HH:MM:SS
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const safeName = (s?: string) => (s || "unknown").replace(/[^a-zA-Z0-9_\-]/g, "_");

    // Default topic for now, could be dynamic in future
    const topic = "code_review";

    const parts = [safeName(projectName), safeName(currentBranch), timestamp, topic]
      .filter(Boolean)
      .join("_");
    const base = projectMainPath || workspacePath || ".";
    const ctxId = workspaceId || "default";
    return `${base}/.atmos/reviews/${ctxId}/${parts}.md`;
  }, [projectName, currentBranch, projectMainPath, workspacePath, workspaceId]);

  const handleStart = useCallback(
    async () => {
      if (isStarting) return;
      setIsStarting(true);
      try {
        const reportPath = buildReportPath();
        const command = buildCodeReviewCommand(agentId, skillId, reportPath);
        onStartTerminalMode(command);
        onOpenChange(false);
        toastManager.add({
          title: "Code Review Started",
          description: `Report will be written to .atmos/reviews/`,
          type: "success",
        });
      } catch (err) {
        toastManager.add({
          title: "Failed to start code review",
          description: err instanceof Error ? err.message : "Unknown error",
          type: "error",
        });
      } finally {
        setIsStarting(false);
      }
    },
    [isStarting, buildReportPath, agentId, skillId, onStartTerminalMode, onOpenChange]
  );

  const handleReplace = useCallback(
    async () => {
      if (isStarting) return;
      setIsStarting(true);
      try {
        const reportPath = buildReportPath();
        const command = buildCodeReviewCommand(agentId, skillId, reportPath);
        await onReplaceTerminalAndRun(command);
        onOpenChange(false);
      } catch (err) {
        toastManager.add({
          title: "Failed to restart code review",
          description: err instanceof Error ? err.message : "Unknown error",
          type: "error",
        });
      } finally {
        setIsStarting(false);
      }
    },
    [isStarting, buildReportPath, agentId, skillId, onReplaceTerminalAndRun, onOpenChange]
  );

  const handleStartInAgent = useCallback(() => {
    if (isStarting || !acpAgentId) return;
    try {
      const reportPath = buildReportPath();
      const prompt = buildCodeReviewPrompt(skillId, reportPath);
      const now = new Date();
      const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const titleName = projectName || "Project";
      const sessionTitle = `${titleName}_CodeReview_${timeStr}`;
      setPendingAgentChatPrompt({ prompt, registryId: acpAgentId, forceNewSession: true, sessionTitle });
      setPendingAgentChatMode("default");
      onOpenChange(false);
      setAgentChatOpen(true);
      toastManager.add({
        title: "Code Review Sent to Agent",
        description: `Agent chat opened to run the review.`,
        type: "success",
      });
    } catch (err) {
      toastManager.add({
        title: "Failed to queue code review",
        description: err instanceof Error ? err.message : "Unknown error",
        type: "error",
      });
    }
  }, [isStarting, buildReportPath, buildCodeReviewPrompt, skillId, acpAgentId, onOpenChange, setPendingAgentChatPrompt, setPendingAgentChatMode, setAgentChatOpen]);

  const handleSyncSkills = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await skillsApi.syncSystemSkills();
      toastManager.add({
        title: "Sync Started",
        description: "System skills synchronization has been triggered.",
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
        title: "Sync Failed",
        description: err instanceof Error ? err.message : "Failed to trigger sync",
        type: "error",
      });
      setIsSyncing(false);
    }
  }, [isSyncing]);

  const selectedSkill = skillsList.find((s) => s.id === skillId) ?? skillsList[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-4" />
            Code Agent Review
          </DialogTitle>
          <DialogDescription>
            Select a Review Skill and Agent to start the automated code review. The review report will be automatically written to your project workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Skills status warning */}
          {skillsReady === false && (
            <div className="flex flex-col gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5 text-sm text-yellow-600 dark:text-yellow-400">
              <div className="flex items-start gap-2">
                <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                <span>
                  Code Review Skills are initializing, please wait a moment and try again. They sync automatically on service startup.
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
                {isSyncing ? "Syncing..." : "Sync Skills Manually"}
              </Button>
            </div>
          )}

          {/* Skill Selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
              Review Skill
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
                    <span>Loading other review skills...</span>
                  </div>
                )}
              </SelectContent>
            </Select>

            {/* Skill description */}
            <div className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground space-y-2">
              <div>
                <p>{selectedSkill?.description}</p>
                <p className="font-medium text-foreground/70 mt-1">
                  Great for: {selectedSkill?.bestFor}
                </p>
              </div>
              <div className="pt-2 border-t border-border/50 text-[10px] text-muted-foreground/80">
                Tip: You can add custom review skills by creating folders containing a <code className="bg-muted px-1 py-0.5 rounded">SKILL.md</code> file inside <code className="bg-muted px-1 py-0.5 rounded">~/.atmos/skills/.system/code_review_skills/</code>.
              </div>
            </div>
          </div>

          <Tabs value={executionMode} onValueChange={(v) => setExecutionMode(v as "acp" | "cli")}>
            <TabsList className="w-full grid mx-auto mb-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <TabsTrigger value="acp">ACP Agent Panel</TabsTrigger>
              <TabsTrigger value="cli">Code Agent CLI</TabsTrigger>
            </TabsList>

            <TabsContent value="acp" className="mt-0">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
                ACP AI Agent
              </label>
              <Select value={acpAgentId} onValueChange={setAcpAgentId} disabled={loadingAcpAgents || installedAcpAgents.length === 0}>
                <SelectTrigger className="w-full cursor-pointer">
                  <SelectValue placeholder={
                    loadingAcpAgents ? "Loading agents..." :
                      (installedAcpAgents.length === 0 ? "No ACP agents installed" : "Select an Agent")
                  } />
                </SelectTrigger>
                <SelectContent>
                  {installedAcpAgents.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      <div className="flex items-center gap-2">
                        <AgentIcon registryId={opt.id} name={opt.name} size={16} />
                        {opt.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1.5 h-6">
                Runs inside the right sidebar ACP Agent Chat panel natively.
              </p>
            </TabsContent>

            <TabsContent value="cli" className="mt-0">
              <AgentSelect value={agentId} onValueChange={handleAgentChange} />
            </TabsContent>
          </Tabs>

          {/* Report path preview */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5 mt-2">
              Report Save Path
            </label>
            <p className="text-[11px] text-muted-foreground font-mono bg-muted/50 rounded px-2 py-1.5 break-all">
              {projectMainPath || workspacePath || "."}/
              <span className="text-foreground/80">.atmos/reviews/{workspaceId || "default"}/</span>
              <br />
              {[
                (projectName || "project").replace(/[^a-zA-Z0-9_\-]/g, "_"),
                (currentBranch || "branch").replace(/[^a-zA-Z0-9_\-]/g, "_"),
                "YYYYMMDD-HH:MM:SS",
                "code_review"
              ].join("_")}
              .md
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Once the review is complete, the Agent will automatically write the report file to the path above. No manual saving is required.
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
              Start via ACP Agent Chat
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
                Start in New Terminal
              </Button>
              <Button
                variant="ghost"
                className="w-full gap-2 text-xs"
                onClick={handleReplace}
                disabled={isStarting || skillsReady === false}
              >
                Restart (Replace existing Code Review terminal)
              </Button>
              <p className="text-center text-[10px] text-muted-foreground">
                Terminal mode creates an isolated Code Review pane inside the main center stage.
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
