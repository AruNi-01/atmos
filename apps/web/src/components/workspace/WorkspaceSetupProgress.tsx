"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Terminal,
  ArrowRight,
  AlertCircle,
  Clock,
  FileText,
  SkipForward,
  Save
} from "lucide-react";
import {
  Button,
  Textarea
} from "@workspace/ui";
import { cn } from "@/lib/utils";
import { WorkspaceSetupProgress, useProjectStore } from "@/hooks/use-project-store";
import { useWorkspaceContextStore } from "@/hooks/use-workspace-context";
import { useHotkeys } from "react-hotkeys-hook";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { atmosDarkTheme, defaultTerminalOptions } from "../terminal/theme";

const Progress = ({ value, className }: { value: number, className?: string }) => (
  <div className={cn("w-full bg-muted rounded-full overflow-hidden", className)}>
    <div
      className="h-full bg-primary transition-all duration-500 ease-in-out"
      style={{ width: `${value}%` }}
    />
  </div>
);

interface WorkspaceSetupProgressProps {
  progress: WorkspaceSetupProgress;
  onFinish: () => void;
}

type DisplayStatus = 'creating' | 'setting_up' | 'define_requirements' | 'completed' | 'error';

export const WorkspaceSetupProgressView: React.FC<WorkspaceSetupProgressProps> = ({
  progress,
  onFinish
}) => {
  const { status: backendStatus, stepTitle, output, lastStatus, workspaceId } = progress;
  const { retryWorkspaceSetup, projects } = useProjectStore();
  const { saveRequirement } = useWorkspaceContextStore();

  // Find workspace's localPath from projects
  const workspaceLocalPath = React.useMemo(() => {
    for (const project of projects) {
      const workspace = project.workspaces.find(w => w.id === workspaceId);
      if (workspace) {
        return workspace.localPath;
      }
    }
    return null;
  }, [projects, workspaceId]);

  // Local state for the define_requirements step (front-end controlled)
  const [showDefineRequirements, setShowDefineRequirements] = useState(false);
  const [requirementText, setRequirementText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Determine the display status (may differ from backend status)
  const status: DisplayStatus = showDefineRequirements ? 'define_requirements' : backendStatus;

  // When backend status becomes 'completed', intercept and show define_requirements first
  const prevBackendStatusRef = useRef(backendStatus);
  useEffect(() => {
    if (prevBackendStatusRef.current === 'setting_up' && backendStatus === 'completed') {
      setShowDefineRequirements(true);
    }
    prevBackendStatusRef.current = backendStatus;
  }, [backendStatus]);

  const [localCountdown, setLocalCountdown] = React.useState(5);
  const [isHovered, setIsHovered] = React.useState(false);

  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const lastWrittenLengthRef = useRef(0);

  // Handle Skip - just proceed to completed
  const handleSkip = () => {
    setShowDefineRequirements(false);
  };

  // Handle Save & Continue - save requirement then proceed
  const handleSaveAndContinue = async () => {
    if (!workspaceLocalPath || !requirementText.trim()) {
      setShowDefineRequirements(false);
      return;
    }
    
    setIsSaving(true);
    try {
      await saveRequirement(workspaceId, workspaceLocalPath, requirementText.trim());
    } catch (error) {
      console.error('Failed to save requirement:', error);
    } finally {
      setIsSaving(false);
      setShowDefineRequirements(false);
    }
  };

  // Initialize terminal
  useEffect(() => {
    if (!terminalContainerRef.current || terminalRef.current) return;

    const term = new XTerm({
      ...defaultTerminalOptions,
      theme: atmosDarkTheme,
      disableStdin: true,
      cursorBlink: true,
      convertEol: true,
      fontSize: 12, // Slightly smaller for setup view
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalContainerRef.current);
    fitAddon.fit();

    terminalRef.current = term;

    // Write initial output if any
    if (output) {
      term.write(output);
      lastWrittenLengthRef.current = output.length;
    }

    const resizeObserver = new ResizeObserver(() => {
      if (terminalContainerRef.current) {
        fitAddon.fit();
      }
    });
    resizeObserver.observe(terminalContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      terminalRef.current = null;
      lastWrittenLengthRef.current = 0;
    };
  }, []); // Only init once per mount

  // Write new output chunks
  useEffect(() => {
    if (terminalRef.current) {
      if (output.length > lastWrittenLengthRef.current) {
        const newChunk = output.slice(lastWrittenLengthRef.current);
        terminalRef.current.write(newChunk);
        lastWrittenLengthRef.current = output.length;
      } else if (output.length < lastWrittenLengthRef.current) {
        // If output was cleared or reset (e.g. retry)
        terminalRef.current.clear();
        terminalRef.current.write(output);
        lastWrittenLengthRef.current = output.length;
      }
    }
  }, [output]);

  // Handle local countdown
  useEffect(() => {
    if (status === 'completed' && localCountdown > 0 && !isHovered) {
      const timer = setInterval(() => {
        setLocalCountdown(prev => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [status, localCountdown, isHovered]);

  // Handle countdown finishing
  useEffect(() => {
    if (status === 'completed' && localCountdown === 0) {
      onFinish();
    }
  }, [status, localCountdown, onFinish]);

  // Shortcut for Start Building
  useHotkeys('mod+enter', () => {
    if (status === 'completed') onFinish();
  }, { enableOnFormTags: true });

  const steps = [
    { id: 'creating', title: 'Initialize Workspace', description: 'Creating directory and worktree' },
    { id: 'setting_up', title: 'Setting up Environment', description: 'Executing setup scripts' },
    { id: 'define_requirements', title: 'Define Requirements', description: 'Optional: describe your goals' },
    { id: 'completed', title: 'Finalizing', description: 'Almost ready' }
  ];

  // Determine which step we are currently at (or failed at)
  const effectiveStatus = status === 'error' ? lastStatus : status;
  const currentStepIndex = steps.findIndex(s => s.id === effectiveStatus);

  // Progress value should stay at the current step's progress even if error occurs
  const progressValue = status === 'completed' ? 100 : (Math.max(0, currentStepIndex) + 0.5) * (100 / steps.length);

  return (
    <div className="flex flex-col h-full bg-background items-center p-6 max-w-4xl mx-auto gap-6 animate-in fade-in duration-500 overflow-hidden">
      <div className="w-full space-y-2 text-center pt-4 shrink-0">
        <h2 className="text-3xl font-bold tracking-tight">Initializing Workspace</h2>
        <p className="text-muted-foreground">Setting up your development environment...</p>
      </div>

      <div className="w-full grid grid-cols-4 gap-4 shrink-0">
        {steps.map((step, idx) => {
          const isActive = status === step.id;
          const isDone = currentStepIndex > idx || status === 'completed';
          const isFailed = status === 'error' && currentStepIndex === idx;
          const isDefineRequirements = step.id === 'define_requirements';

          return (
            <div key={step.id} className={cn(
              "p-4 rounded-xl border transition-all duration-300",
              isActive ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-muted/30",
              isDone && !isActive && "border-emerald-500/30 bg-emerald-500/5 text-emerald-500",
              isFailed && "border-destructive bg-destructive/5 ring-1 ring-destructive"
            )}>
              <div className="flex items-center gap-3 mb-2">
                {isDone && !isActive ? (
                  <CheckCircle2 className="size-5 text-emerald-500" />
                ) : isFailed ? (
                  <AlertCircle className="size-5 text-destructive" />
                ) : isActive ? (
                  isDefineRequirements ? (
                    <FileText className="size-5 text-primary" />
                  ) : (
                    <Loader2 className="size-5 text-primary animate-spin" />
                  )
                ) : (
                  <Circle className="size-5 text-muted-foreground" />
                )}
                <span className={cn(
                  "font-semibold text-sm",
                  isActive ? "text-primary" : isDone ? "text-emerald-500" : isFailed ? "text-destructive" : "text-foreground"
                )}>
                  {step.title}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{step.description}</p>
            </div>
          );
        })}
      </div>

      <div className="w-full space-y-4 shrink-0">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium flex items-center gap-2">
            {status === 'error' ? (
              <AlertCircle className="size-4 text-destructive" />
            ) : (
              <Terminal className="size-4 text-primary" />
            )}
            {stepTitle}
          </span>
          <span className="text-muted-foreground tabular-nums">
            {Math.round(progressValue)}%
          </span>
        </div>
        <Progress value={progressValue} className={cn("h-2 transition-all duration-500", status === 'error' && "bg-destructive/20")} />
      </div>

      {status === 'define_requirements' ? (
        <div className="w-full flex-1 min-h-[200px] rounded-xl border border-border overflow-hidden flex flex-col bg-background">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            <span className="text-sm font-medium">Define Your Requirements</span>
            <span className="text-xs text-muted-foreground ml-2">(Optional)</span>
          </div>
          <div className="flex-1 p-4 flex flex-col gap-4">
            <Textarea
              placeholder="Describe your goals, features, or requirements in Markdown format..."
              className="flex-1 resize-none font-mono text-sm min-h-[150px]"
              value={requirementText}
              onChange={(e) => setRequirementText(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              需求将保存到 <code className="px-1 py-0.5 rounded bg-muted">.atmos/context/requirement.md</code>，可供后续上下文追踪以及引用给 Code Agent。
            </p>
          </div>
        </div>
      ) : (
        <div className="w-full flex-1 min-h-[60px] bg-[#09090b] rounded-xl border border-border overflow-hidden flex flex-col shadow-2xl relative group">
          <div className="bg-[#161b22] px-4 py-2 border-b border-white/5 flex items-center justify-between">
            <div className="flex gap-1.5">
              <div className="size-2.5 rounded-full bg-[#ff5f56]" />
              <div className="size-2.5 rounded-full bg-[#ffbd2e]" />
              <div className="size-2.5 rounded-full bg-[#27c93f]" />
            </div>
            <span className="text-[10px] text-[#8b949e] font-mono uppercase tracking-widest">Setup Output</span>
          </div>
          <div className="flex-1 p-4 overflow-hidden bg-[#09090b]">
            <div
              ref={terminalContainerRef}
              className="h-full w-full"
            />
          </div>
        </div>
      )}

      <div className="w-full flex flex-col items-center gap-2 shrink-0 pb-2">
        <div className="flex justify-center min-h-[60px] gap-3">
          {status === 'define_requirements' ? (
            <>
              <Button
                variant="outline"
                size="lg"
                className="px-8 rounded-sm gap-2 hover:cursor-pointer"
                onClick={handleSkip}
              >
                <SkipForward className="size-4" />
                Skip
              </Button>
              <Button
                size="lg"
                className="px-8 rounded-sm gap-2 bg-primary text-primary-foreground hover:cursor-pointer"
                onClick={handleSaveAndContinue}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save & Continue
              </Button>
            </>
          ) : status === 'completed' ? (
            <Button
              size="lg"
              className="px-12 py-6 text-lg rounded-sm shadow-lg hover:shadow-primary/20 hover:scale-105 active:scale-95 transition-all gap-3 bg-primary text-primary-foreground font-bold hover:cursor-pointer"
              onClick={onFinish}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
            >
              <Clock className="size-5" />
              Start Building {localCountdown > 0 && `(${localCountdown}s)`}
              <ArrowRight className="size-5" />
            </Button>
          ) : status === 'error' ? (
            <Button
              variant="destructive"
              size="lg"
              className="px-12 rounded-sm gap-3 shadow-lg hover:scale-105 active:scale-95 transition-all hover:cursor-pointer"
              onClick={() => retryWorkspaceSetup(workspaceId)}
            >
              Retry Initialization
            </Button>
          ) : null}
        </div>

        {/* Fixed height container for hint text to prevent layout jumps */}
        <div className="h-6 flex items-center justify-center w-full">
          {status === 'completed' && (
            <p className="text-xs text-muted-foreground animate-pulse text-center">
              Tip: Press <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-sans font-bold">⌘</kbd> + <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-sans font-bold">Enter</kbd> to skip
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
