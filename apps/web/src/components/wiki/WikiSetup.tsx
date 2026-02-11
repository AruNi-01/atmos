"use client";

import React, { useState, useCallback } from "react";
import {
  Button,
  Skeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
  toastManager,
} from "@workspace/ui";
import { BookOpen, Copy, Loader2, Download } from "lucide-react";
import { shellQuote } from "@/lib/shell-quote";
import type { TerminalGridHandle } from "@/components/terminal/TerminalGrid";
import { skillsApi } from "@/api/ws-api";

const PROJECT_WIKI_SKILL_PATH = "~/.atmos/skills/.system/project-wiki";

/** Agents with their CLI commands and YOLO/auto-approve flags */
const AGENT_OPTIONS = [
  { id: "claude", label: "Claude Code", cmd: "claude", yoloFlag: "--dangerously-skip-permissions" },
  { id: "codex", label: "Codex", cmd: "codex", yoloFlag: "--dangerously-bypass-approvals-and-sandbox" },
  { id: "gemini", label: "Gemini", cmd: "gemini", yoloFlag: "-y" },
  { id: "amp", label: "Amp", cmd: "amp", yoloFlag: "-x" },
  { id: "droid", label: "Droid", cmd: "droid", yoloFlag: "" },
  { id: "opencode", label: "OpenCode", cmd: "opencode", yoloFlag: "--yolo" },
  { id: "kimi", label: "Kimi", cmd: "kimi", yoloFlag: "" },
  { id: "cursor", label: "Cursor Agent", cmd: "cursor", yoloFlag: "" },
  { id: "kilocode", label: "Kilo Code", cmd: "kilocode", yoloFlag: "" },
  { id: "kiro", label: "Kiro", cmd: "kiro", yoloFlag: "" },
] as const;

const COMMON_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "pt", label: "Português" },
  { value: "ru", label: "Русский" },
  { value: "ar", label: "العربية" },
  { value: "hi", label: "हिन्दी" },
  { value: "other", label: "Other (custom)" },
];

function buildCommand(
  agentId: (typeof AGENT_OPTIONS)[number]["id"],
  prompt: string,
  useYolo: boolean
): string {
  const agent = AGENT_OPTIONS.find((a) => a.id === agentId);
  if (!agent) return "";

  const quoted = shellQuote(prompt);
  const parts = [agent.cmd];

  if (useYolo && agent.yoloFlag) {
    parts.push(agent.yoloFlag);
  }

  switch (agent.id) {
    case "amp":
      // Amp: -x runs in execute/headless mode
      parts.push(quoted);
      break;
    default:
      parts.push(quoted);
  }

  return parts.join(" ");
}

function buildPrompt(
  skillPath: string | null,
  language: string,
  customLanguage: string
): string {
  const lang = language === "other" ? customLanguage : language;
  const langInstruction = lang ? ` Generate all wiki content in ${lang}.` : "";

  const base =
    skillPath
      ? `Read the skill instructions at ${skillPath} and follow them to generate a complete project wiki. You are in the project root. Create the wiki in ./.atmos/wiki/.${langInstruction}`
      : `Generate a complete project wiki in ./.atmos/wiki/. Create _catalog.json and markdown files per the project-wiki convention. Analyze the codebase and document key modules.${langInstruction}`;

  return base;
}

interface WikiSetupProps {
  effectivePath: string;
  terminalGridRef: React.RefObject<TerminalGridHandle | null>;
  onSwitchToTerminal: () => void;
  onRetryCheck: () => void;
}

export const WikiSetup: React.FC<WikiSetupProps> = ({
  effectivePath,
  terminalGridRef,
  onSwitchToTerminal,
  onRetryCheck,
}) => {
  const [agentId, setAgentId] = useState<(typeof AGENT_OPTIONS)[number]["id"]>("claude");
  const [isGenerating, setIsGenerating] = useState(false);
  const [skillPath, setSkillPath] = useState<string | null>(null);
  const [skillLoading, setSkillLoading] = useState(true);
  const [language, setLanguage] = useState("en");
  const [customLanguage, setCustomLanguage] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);

  const loadSkill = useCallback(async () => {
    try {
      const { skills } = await skillsApi.list();
      const projectWiki = skills.find(
        (s) => s.name === "project-wiki" || s.name?.toLowerCase().includes("project-wiki")
      );
      if (projectWiki) {
        const mainFile = projectWiki.files?.find((f) => f.is_main) ?? projectWiki.files?.[0];
        setSkillPath(mainFile?.absolute_path ?? projectWiki.path);
      } else {
        setSkillPath(null);
      }
    } catch {
      setSkillPath(null);
    } finally {
      setSkillLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    loadSkill().then(() => {
      if (!cancelled) {
        // no-op
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadSkill]);

  const handleInstallSkill = useCallback(async () => {
    setIsInstalling(true);
    try {
      const result = await skillsApi.installProjectWiki();
      if (result.success) {
        toastManager.add({
          title: "Skill installed",
          description: result.message,
          type: "success",
        });
        await loadSkill();
        onRetryCheck();
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      toastManager.add({
        title: "Install failed",
        description: err instanceof Error ? err.message : "Unknown error",
        type: "error",
      });
    } finally {
      setIsInstalling(false);
    }
  }, [loadSkill, onRetryCheck]);

  const handleCopyPrompt = useCallback(() => {
    const prompt = buildPrompt(skillPath, language, customLanguage);
    const command = buildCommand(agentId, prompt, true);
    navigator.clipboard.writeText(command);
    toastManager.add({
      title: "Copied to clipboard",
      description: "Paste and run this command in your Code Agent terminal.",
      type: "success",
    });
  }, [agentId, skillPath, language, customLanguage]);

  const handleGenerate = useCallback(async () => {
    if (!effectivePath || !terminalGridRef.current) {
      toastManager.add({
        title: "Cannot generate",
        description: "Project path or terminal not available.",
        type: "error",
      });
      return;
    }

    const prompt = buildPrompt(skillPath, language, customLanguage);
    const command = buildCommand(agentId, prompt, true);

    setIsGenerating(true);
    try {
      const handle = terminalGridRef.current;
      if (typeof handle.createAndRunTerminal === "function") {
        await handle.createAndRunTerminal({
          title: "Project Wiki",
          command,
        });
        onSwitchToTerminal();
        toastManager.add({
          title: "Wiki generation started",
          description: "Switched to Terminal. Check progress there.",
          type: "info",
        });
      } else {
        toastManager.add({
          title: "Terminal not ready",
          description: "Please wait and try again.",
          type: "error",
        });
      }
    } catch (err) {
      toastManager.add({
        title: "Failed to start",
        description: err instanceof Error ? err.message : "Unknown error",
        type: "error",
      });
    } finally {
      setIsGenerating(false);
    }
  }, [
    effectivePath,
    agentId,
    skillPath,
    language,
    customLanguage,
    terminalGridRef,
    onSwitchToTerminal,
  ]);

  const skillMissing = !skillLoading && !skillPath;

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-6 max-w-2xl mx-auto">
      {/* No Card border - plain center content */}
      <div className="w-full space-y-6">
        <div className="text-center">
          <div className="size-12 mx-auto mb-3 rounded-xl bg-muted flex items-center justify-center">
            <BookOpen className="size-6 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Generate Project Wiki</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create a navigable project wiki in{" "}
            <code className="text-xs bg-muted px-1 rounded">.atmos/wiki/</code> using a Code Agent.
          </p>
        </div>

        {/* Notices */}
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-foreground space-y-2">
          <p className="font-medium">Before you start</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>
              Project Wiki generation takes <strong>30–60 minutes</strong>, depending on project
              complexity.
            </li>
            <li>
              To avoid frequent approval prompts, generation uses <strong>YOLO mode</strong> by
              default (auto-approve).
            </li>
          </ul>
        </div>

        {/* Skill install */}
        {skillMissing && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              The project-wiki skill is not installed. Install it to use the full skill
              instructions.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleInstallSkill}
              disabled={isInstalling}
              className="w-full sm:w-auto"
            >
              {isInstalling ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Installing...
                </>
              ) : (
                <>
                  <Download className="size-4 mr-2" />
                  Install project-wiki skill
                </>
              )}
            </Button>
          </div>
        )}

        {skillLoading && <Skeleton className="h-4 w-3/4" />}

        {/* Code Agent */}
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
            Code Agent
          </label>
          <Select value={agentId} onValueChange={(v) => setAgentId(v as typeof agentId)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AGENT_OPTIONS.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Language */}
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
            Wiki language
          </label>
          <div className="flex gap-2 flex-wrap">
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMON_LANGUAGES.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {language === "other" && (
              <Input
                placeholder="e.g. Italian, Vietnamese"
                value={customLanguage}
                onChange={(e) => setCustomLanguage(e.target.value)}
                className="flex-1 min-w-[120px]"
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            className="flex-1"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Starting...
              </>
            ) : (
              "Generate Wiki"
            )}
          </Button>
          <Button variant="outline" onClick={handleCopyPrompt} className="flex-1 sm:flex-none">
            <Copy className="size-4 mr-2" />
            Copy prompt for agent
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground text-center">
          A new terminal tab will open and run the agent. Return to Wiki when done.
        </p>
      </div>
    </div>
  );
};
