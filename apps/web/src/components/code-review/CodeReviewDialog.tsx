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
import { skillsApi } from "@/api/ws-api";
import { cn } from "@/lib/utils";

// ===== Skill 定义 =====

export type CodeReviewSkillId = "code-reviewer" | "code-review-expert" | "typescript-react-reviewer";

export interface CodeReviewSkill {
  id: CodeReviewSkillId;
  label: string;
  badge: string;
  description: string;
  bestFor: string;
}

export const CODE_REVIEW_SKILLS: CodeReviewSkill[] = [
  {
    id: "code-reviewer",
    label: "Code Reviewer",
    badge: "通用",
    description:
      "通用全栈代码审查，覆盖正确性、可维护性、可读性、效率、安全性和边界条件处理。支持本地变更和远程 PR。",
    bestFor: "混合变更（前后端都有）或不确定时的默认选择",
  },
  {
    id: "code-review-expert",
    label: "Code Review Expert",
    badge: "后端/架构",
    description:
      "以高级工程师视角审查代码，重点检测 SOLID 原则违反、安全漏洞（SQL 注入、AuthZ/AuthN）、竞态条件和架构问题。输出 P0-P3 严重级别。",
    bestFor: "Rust 后端、API 设计、数据库操作、架构变更",
  },
  {
    id: "typescript-react-reviewer",
    label: "TypeScript React Reviewer",
    badge: "前端/React",
    description:
      "专注 React 19 + TypeScript 最佳实践，检测 Hooks 反模式（useEffect 滥用）、状态管理问题（TanStack Query、Zustand）、TypeScript 严格模式违反和组件设计问题。",
    bestFor: "React 组件、Hooks、前端状态管理、TypeScript 类型安全",
  },
];

const SKILL_STORAGE_KEY = "atmos.code_review.default_skill_id";
const AGENT_STORAGE_KEY = "atmos.code_review.default_agent_id";

// ===== 工具函数 =====

function readStoredSkillId(): CodeReviewSkillId {
  if (typeof window === "undefined") return "code-reviewer";
  const stored = localStorage.getItem(SKILL_STORAGE_KEY);
  if (stored && CODE_REVIEW_SKILLS.some((s) => s.id === stored)) {
    return stored as CodeReviewSkillId;
  }
  return "code-reviewer";
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
 * Infer the best skill based on changed file extensions.
 * - Majority .rs → code-review-expert
 * - Majority .tsx/.ts → typescript-react-reviewer
 * - Otherwise → code-reviewer
 */
export function inferSkillFromFiles(filePaths: string[]): CodeReviewSkillId {
  if (!filePaths.length) return "code-reviewer";
  let rustCount = 0;
  let tsCount = 0;
  for (const p of filePaths) {
    if (p.endsWith(".rs")) rustCount++;
    else if (p.endsWith(".tsx") || p.endsWith(".ts")) tsCount++;
  }
  const total = filePaths.length;
  if (rustCount / total > 0.5) return "code-review-expert";
  if (tsCount / total > 0.5) return "typescript-react-reviewer";
  return "code-reviewer";
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
  const skillPath = `~/.atmos/skills/.system/${skillId}/SKILL.md`;
  const prompt = `Read the skill instructions at ${skillPath} and follow them to perform a thorough code review of the current git changes (run 'git diff' and 'git diff --staged' to see changes). After completing the review, write the full review report in Markdown format to the file '${reportPath}'. Create parent directories if needed. Do not ask for confirmation before writing the file.`;
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
}

// ===== Component =====

export const CodeReviewDialog: React.FC<CodeReviewDialogProps> = ({
  open,
  onOpenChange,
  changedFilePaths = [],
  onStartTerminalMode,
  onReplaceTerminalAndRun,
  projectName,
  currentBranch,
  workspacePath,
}) => {
  const [skillId, setSkillId] = useState<CodeReviewSkillId>(readStoredSkillId);
  const [agentId, setAgentId] = useState<AgentId>(readStoredAgentId);
  const [skillsReady, setSkillsReady] = useState<boolean | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // Check skills status when dialog opens
  useEffect(() => {
    if (!open) return;
    setSkillsReady(null);
    skillsApi.isCodeReviewSkillsInstalledInSystem().then((installed) => {
      setSkillsReady(installed);
    }).catch(() => {
      setSkillsReady(false);
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

  /** Generate report file path: {workspacePath}/.atmos/reviews/{project}_{branch}_{timestamp}.md */
  const buildReportPath = useCallback((): string => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const safeName = (s?: string) => (s || "unknown").replace(/[^a-zA-Z0-9_\-]/g, "_");
    const parts = [safeName(projectName), safeName(currentBranch), timestamp]
      .filter(Boolean)
      .join("_");
    const base = workspacePath || ".";
    return `${base}/.atmos/reviews/${parts}.md`;
  }, [projectName, currentBranch, workspacePath]);

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
          title: "Code Review 已启动",
          description: `报告将写入 .atmos/reviews/ 目录`,
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

  const selectedSkill = CODE_REVIEW_SKILLS.find((s) => s.id === skillId) ?? CODE_REVIEW_SKILLS[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-4" />
            Code Agent Review
          </DialogTitle>
          <DialogDescription>
            选择 Review Skill 和 Agent，启动自动代码审查。审查报告将自动写入项目文件。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Skills status warning */}
          {skillsReady === false && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5 text-sm text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="size-4 mt-0.5 shrink-0" />
              <span>
                Code Review Skills 正在初始化，请稍候片刻后重试。服务启动时会自动同步。
              </span>
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
                {CODE_REVIEW_SKILLS.map((skill) => (
                  <SelectItem key={skill.id} value={skill.id}>
                    <div className="flex items-center gap-2">
                      <span>{skill.label}</span>
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded font-medium",
                          skill.id === "code-reviewer" &&
                            "bg-blue-500/15 text-blue-600 dark:text-blue-400",
                          skill.id === "code-review-expert" &&
                            "bg-orange-500/15 text-orange-600 dark:text-orange-400",
                          skill.id === "typescript-react-reviewer" &&
                            "bg-purple-500/15 text-purple-600 dark:text-purple-400"
                        )}
                      >
                        {skill.badge}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Skill description */}
            <div className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground space-y-1">
              <p>{selectedSkill.description}</p>
              <p className="font-medium text-foreground/70">
                适合：{selectedSkill.bestFor}
              </p>
            </div>
          </div>

          {/* Agent Selector */}
          <AgentSelect
            value={agentId}
            onValueChange={handleAgentChange}
          />

          {/* Report path preview */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
              报告保存路径
            </label>
            <p className="text-[11px] text-muted-foreground font-mono bg-muted/50 rounded px-2 py-1.5 break-all">
              {workspacePath || "."}/
              <span className="text-foreground/80">.atmos/reviews/</span>
              {[
                (projectName || "project").replace(/[^a-zA-Z0-9_\-]/g, "_"),
                (currentBranch || "branch").replace(/[^a-zA-Z0-9_\-]/g, "_"),
                "YYYYMMDD-HHMMSS",
              ].join("_")}
              .md
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              审查完成后，Agent 将自动写入报告文件，无需手动保存。
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-1">
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
            在终端 Tab 中启动
          </Button>
          <Button
            variant="outline"
            className="w-full gap-2 text-xs"
            onClick={handleReplace}
            disabled={isStarting || skillsReady === false}
          >
            重新启动（替换现有 Code Review 终端）
          </Button>
          <p className="text-center text-[10px] text-muted-foreground">
            将在主区域创建独立的 Code Review 终端 Tab，Agent 完成后自动写入报告文件
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
