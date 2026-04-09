"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Sparkles,
  Terminal,
} from "lucide-react";
import { Button, Textarea, toastManager } from "@workspace/ui";
import { cn } from "@/lib/utils";
import { WorkspaceSetupProgress, useProjectStore } from "@/hooks/use-project-store";
import { wsWorkspaceApi } from "@/api/ws-api";
import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer";
import { useHotkeys } from "react-hotkeys-hook";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { atmosDarkTheme, defaultTerminalOptions } from "../terminal/theme";
import { getWorkspaceSetupCurrentStepKey, type WorkspaceSetupStepKey } from "@/utils/workspace-setup";

const Progress = ({ value, className }: { value: number; className?: string }) => (
  <div className={cn("w-full overflow-hidden rounded-full bg-muted", className)}>
    <div
      className="h-full bg-primary transition-all duration-500 ease-in-out"
      style={{ width: `${value}%` }}
    />
  </div>
);

interface WorkspaceSetupProgressProps {
  progress: WorkspaceSetupProgress;
  onFinish: () => void;
  compact?: boolean;
}

export const WorkspaceSetupProgressView: React.FC<WorkspaceSetupProgressProps> = ({
  progress,
  onFinish,
  compact = false,
}) => {
  const { status, stepTitle, output, workspaceId, stepKey, lastStepKey, failedStepKey, setupContext } =
    progress;
  const retryWorkspaceSetup = useProjectStore((s) => s.retryWorkspaceSetup);

  const currentStepKey: WorkspaceSetupStepKey = useMemo(
    () => getWorkspaceSetupCurrentStepKey(progress),
    [progress],
  );

  const contextStep = useMemo(() => {
    const hasGithubIssue = !!setupContext?.hasGithubIssue;
    const hasRequirementStep = !!setupContext?.hasRequirementStep;

    if (!hasGithubIssue && !hasRequirementStep) {
      return null;
    }

    if (hasGithubIssue) {
      return {
        id: "write_requirement" as const,
        title: "Fill Requirement Spec",
        description: "Write the linked GitHub issue into requirement.md.",
      };
    }

    return {
      id: "write_requirement" as const,
      title: "Write Requirement Spec",
      description: "Save the initial requirement specification for this workspace.",
    };
  }, [setupContext]);

  const todoStep = useMemo(
    () =>
      !!setupContext?.autoExtractTodos
        ? {
            id: "extract_todos" as const,
            title: "Extract TODOs",
            description: "Generate task.md from the linked issue with the routed LLM provider.",
          }
        : null,
    [setupContext?.autoExtractTodos],
  );

  const showSetupScriptStep =
    setupContext?.hasSetupScript === true ||
    status === "setting_up" ||
    stepKey === "run_setup_script" ||
    lastStepKey === "run_setup_script";

  const steps = useMemo(() => {
    const nextSteps: Array<{
      id: WorkspaceSetupStepKey;
      title: string;
      description: string;
    }> = [
      {
        id: "create_worktree",
        title: "Create Workspace",
        description: "Create the worktree and reserve the workspace directory.",
      },
    ];

    if (contextStep) {
      nextSteps.push(contextStep);
    }

    if (todoStep) {
      nextSteps.push(todoStep);
    }

    if (showSetupScriptStep) {
      nextSteps.push({
        id: "run_setup_script",
        title: "Run Setup Script",
        description: "Execute project setup commands for this workspace.",
      });
    }

    nextSteps.push({
      id: "ready",
      title: "Ready",
      description: "Finalize setup and hand off to the workspace.",
    });

    return nextSteps;
  }, [contextStep, showSetupScriptStep, todoStep]);

  const currentStepIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === currentStepKey),
  );
  const useCompactSteps = steps.length >= 5;
  const progressValue =
    status === "completed"
      ? 100
      : (currentStepIndex + 0.5) * (100 / Math.max(1, steps.length));

  const [localCountdown, setLocalCountdown] = useState(5);
  const [isHovered, setIsHovered] = useState(false);
  const [isConfirmingTodos, setIsConfirmingTodos] = useState(false);
  const [isSkippingSetupScript, setIsSkippingSetupScript] = useState(false);
  const [isTodoEditing, setIsTodoEditing] = useState(false);
  const [editedTodoOutput, setEditedTodoOutput] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);

  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const lastWrittenLengthRef = useRef(0);

  const showTerminalPanel =
    (status === "setting_up" || status === "error") && output.trim().length > 0;

  useEffect(() => {
    if (!showTerminalPanel || !terminalContainerRef.current || terminalRef.current) return;

    const term = new XTerm({
      ...defaultTerminalOptions,
      theme: atmosDarkTheme,
      disableStdin: true,
      cursorBlink: true,
      convertEol: true,
      fontSize: 12,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalContainerRef.current);
    fitAddon.fit();

    terminalRef.current = term;

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
  }, [showTerminalPanel]);

  useEffect(() => {
    if (!terminalRef.current) return;

    if (output.length > lastWrittenLengthRef.current) {
      const newChunk = output.slice(lastWrittenLengthRef.current);
      terminalRef.current.write(newChunk);
      lastWrittenLengthRef.current = output.length;
    } else if (output.length < lastWrittenLengthRef.current) {
      terminalRef.current.clear();
      terminalRef.current.write(output);
      lastWrittenLengthRef.current = output.length;
    }
  }, [output]);

  useEffect(() => {
    if (status !== "completed") {
      setLocalCountdown(5);
      return;
    }

    if (localCountdown > 0 && !isHovered) {
      const timer = setInterval(() => {
        setLocalCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isHovered, localCountdown, status]);

  useEffect(() => {
    if (status === "completed" && localCountdown === 0) {
      onFinish();
    }
  }, [localCountdown, onFinish, status]);

  // Detect stale progress: if no update arrives for 30s while in-progress,
  // the backend may have finished silently (e.g. plan build failure, lost WS events).
  // Skip detection when waiting for user confirmation (requiresConfirmation).
  useEffect(() => {
    if (status === "completed" || status === "error" || status === "setting_up" || progress.requiresConfirmation) {
      setIsStale(false);
      return;
    }
    setIsStale(false);
    const timer = setTimeout(() => setIsStale(true), 90_000);
    return () => clearTimeout(timer);
  }, [status, stepKey, stepTitle, output, progress.requiresConfirmation]);

  useEffect(() => {
    if (!progress.requiresConfirmation) {
      setIsConfirmingTodos(false);
    }
  }, [progress.requiresConfirmation, progress.status, progress.stepKey]);

  useEffect(() => {
    if (status !== "error") {
      setIsSkippingSetupScript(false);
    }
  }, [status]);

  useHotkeys(
    "mod+enter",
    () => {
      if (status === "completed") onFinish();
    },
    { enableOnFormTags: true },
  );

  const handleConfirmTodos = async () => {
    const finalOutput = editedTodoOutput ?? output;
    if (!workspaceId || !finalOutput.trim() || isConfirmingTodos) return;

    try {
      setIsConfirmingTodos(true);
      await wsWorkspaceApi.confirmTodos(workspaceId, finalOutput);
    } catch (error) {
      console.error("Failed to confirm extracted TODOs:", error);
      setIsConfirmingTodos(false);
      toastManager.add({
        title: "Could not continue setup",
        description: "Failed to save the generated TODOs into task.md.",
        type: "error",
      });
    }
  };

  const canSkipSetupScript = status === "error" && failedStepKey === "run_setup_script";

  const handleSkipSetupScript = async () => {
    if (!workspaceId || isSkippingSetupScript) return;

    try {
      setIsSkippingSetupScript(true);
      await wsWorkspaceApi.skipSetupScript(workspaceId);
    } catch (error) {
      console.error("Failed to skip setup script:", error);
      setIsSkippingSetupScript(false);
      toastManager.add({
        title: "Could not skip setup script",
        description: "Failed to mark the workspace as ready.",
        type: "error",
      });
    }
  };

  const renderStepIcon = (
    step: { id: WorkspaceSetupStepKey },
    stepIndex: number,
  ) => {
    const isFailed = status === "error" && step.id === currentStepKey;
    const isActive = status !== "completed" && status !== "error" && step.id === currentStepKey;
    const isDone = stepIndex < currentStepIndex || status === "completed";

    if (isFailed) {
      return <AlertCircle className="size-5 text-destructive" />;
    }
    if (isDone) {
      return <CheckCircle2 className="size-5 text-emerald-500" />;
    }
    if (isActive) {
      if (step.id === "write_requirement") {
        return <FileText className="size-5 text-primary" />;
      }
      if (step.id === "extract_todos") {
        return <Sparkles className="size-5 text-primary" />;
      }
      if (step.id === "ready") {
        return <Sparkles className="size-5 text-primary" />;
      }
      return <Loader2 className="size-5 animate-spin text-primary" />;
    }
    return <Circle className="size-5 text-muted-foreground" />;
  };

  const renderBody = () => {
    if (status === "completed") {
      return (
        <div className={cn(
          "flex w-full flex-1 items-center justify-center border border-border bg-background text-center text-sm text-muted-foreground",
          compact ? "min-h-[140px] rounded-lg px-4" : "min-h-[200px] rounded-xl px-6",
        )}>
          <div className="max-w-md space-y-2">
            <p className="text-sm font-medium text-foreground">Workspace is ready</p>
            <p>Setup completed. You can enter the workspace and start building.</p>
          </div>
        </div>
      );
    }

    if (showTerminalPanel) {
      return (
          <div className={cn(
            "relative flex w-full flex-1 flex-col overflow-hidden border border-border bg-[#09090b]",
            compact ? "min-h-[180px] rounded-lg shadow-lg" : "min-h-[60px] rounded-xl shadow-2xl",
          )}>
          <div className="flex items-center justify-between border-b border-white/5 bg-[#161b22] px-4 py-2">
            <div className="flex gap-1.5">
              <div className="size-2.5 rounded-full bg-[#ff5f56]" />
              <div className="size-2.5 rounded-full bg-[#ffbd2e]" />
              <div className="size-2.5 rounded-full bg-[#27c93f]" />
            </div>
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#8b949e]">
              Setup Output
            </span>
          </div>
          <div className={cn("flex-1 overflow-hidden bg-[#09090b]", compact ? "p-3" : "p-4")}>
            <div ref={terminalContainerRef} className="h-full w-full" />
          </div>
        </div>
      );
    }

    if (status === "error") {
      return (
        <div className={cn(
          "flex w-full flex-1 items-center justify-center border border-destructive/30 bg-destructive/5 text-center",
          compact ? "min-h-[160px] rounded-lg px-4" : "min-h-[200px] rounded-xl px-6",
        )}>
          <div className="max-w-md space-y-2">
            <p className="text-sm font-medium text-foreground">Workspace setup failed</p>
            <p className="text-sm text-muted-foreground">
              {stepTitle || "The current setup step failed before the workspace became ready."}
            </p>
            <p className="text-xs text-muted-foreground">
              Adjust the conflicting input if needed, then retry initialization.
            </p>
          </div>
        </div>
      );
    }

    if (currentStepKey === "create_worktree") {
      return (
        <div className={cn(
          "flex w-full flex-1 items-center justify-center border border-border bg-background text-center text-sm text-muted-foreground",
          compact ? "min-h-[140px] rounded-lg px-4" : "min-h-[200px] rounded-xl px-6",
        )}>
          <div className="max-w-md space-y-2">
            <p className="text-sm font-medium text-foreground">Creating workspace worktree</p>
            <p>Reserving the workspace directory and preparing the branch checkout.</p>
          </div>
        </div>
      );
    }

    if (currentStepKey === "write_requirement") {
      return (
        <div className={cn(
          "flex w-full flex-1 items-center justify-center border border-border bg-background text-center text-sm text-muted-foreground",
          compact ? "min-h-[140px] rounded-lg px-4" : "min-h-[200px] rounded-xl px-6",
        )}>
          <div className="max-w-md space-y-2">
            <p className="text-sm font-medium text-foreground">
              {contextStep?.title ?? "Preparing workspace context"}
            </p>
            <p>{contextStep?.description ?? "Writing the initial context into the workspace."}</p>
          </div>
        </div>
      );
    }

    if (currentStepKey === "extract_todos") {
      const todoContent = editedTodoOutput ?? output;
      return (
        <div className={cn(
          "flex w-full flex-1 flex-col overflow-hidden border border-border bg-background",
          compact ? "min-h-[220px] rounded-lg" : "min-h-[260px] rounded-xl",
        )}>
          <div className={cn(
            "flex items-start justify-between border-b border-border",
            compact ? "px-4 py-3" : "px-5 py-4",
          )}>
            <div>
              <p className="text-sm font-medium text-foreground">
                {progress.requiresConfirmation ? "Review initial TODOs" : "Generating initial TODOs"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {progress.requiresConfirmation
                  ? "Confirm this markdown to write it into .atmos/context/task.md and continue setup."
                  : "Streaming markdown tasks from the linked issue."}
              </p>
            </div>
            {progress.requiresConfirmation && todoContent.trim().length > 0 && (
              <button
                onClick={() => {
                  if (!isTodoEditing && editedTodoOutput === null) {
                    setEditedTodoOutput(output);
                  }
                  setIsTodoEditing(!isTodoEditing);
                }}
                className="flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
                title={isTodoEditing ? "Switch to Preview mode" : "Switch to Edit mode"}
              >
                {isTodoEditing ? (
                  <>
                    <Eye className="size-3" />
                    <span>Preview</span>
                  </>
                ) : (
                  <>
                    <Pencil className="size-3" />
                    <span>Edit</span>
                  </>
                )}
              </button>
            )}
          </div>
          <div className={cn("flex-1 overflow-y-auto", compact ? "px-4 py-3" : "px-5 py-4")}>
            {todoContent.trim().length > 0 ? (
              isTodoEditing ? (
                <Textarea
                  className="min-h-[240px] w-full resize-none border-none bg-transparent px-3 py-2 font-mono text-sm text-foreground shadow-none focus-visible:ring-0"
                  value={editedTodoOutput ?? output}
                  onChange={(e) => setEditedTodoOutput(e.target.value)}
                />
              ) : (
                <MarkdownRenderer className="prose prose-sm max-w-none text-sm text-foreground dark:prose-invert">
                  {todoContent}
                </MarkdownRenderer>
              )
            ) : (
              <div className="flex h-full min-h-[160px] items-center justify-center text-sm text-muted-foreground">
                Waiting for the routed LLM provider to stream TODO markdown...
              </div>
            )}
          </div>
        </div>
      );
    }

    if (currentStepKey === "run_setup_script") {
      return (
        <div className={cn(
          "flex w-full flex-1 items-center justify-center border border-border bg-background text-center text-sm text-muted-foreground",
          compact ? "min-h-[140px] rounded-lg px-4" : "min-h-[200px] rounded-xl px-6",
        )}>
          <div className="max-w-md space-y-2">
            <p className="text-sm font-medium text-foreground">Running workspace setup script</p>
            <p>
              Waiting for the project setup command to finish.
              {!output.trim() ? " Output will appear here once the script writes to the terminal." : ""}
            </p>
          </div>
        </div>
      );
    }

    return (
        <div className={cn(
          "flex w-full flex-1 items-center justify-center border border-border bg-background text-center text-sm text-muted-foreground",
          compact ? "min-h-[140px] rounded-lg px-4" : "min-h-[200px] rounded-xl px-6",
        )}>
        <div className="max-w-md space-y-2">
          <p className="text-sm font-medium text-foreground">Preparing workspace</p>
          <p>Setup is still in progress. This view will update as the next step starts.</p>
        </div>
      </div>
    );
  };

  return (
    <div className={cn(
      "mx-auto flex flex-col overflow-hidden bg-background",
      compact ? "w-full max-w-none gap-4 rounded-xl p-4" : "h-full max-w-5xl gap-6 p-6",
    )}>
      <div className={cn(
        "w-full shrink-0 space-y-2 text-center",
        compact ? "pt-0" : "pt-4",
      )}>
        <h2 className={cn("font-bold tracking-tight", compact ? "text-lg" : "text-3xl")}>
          Workspace Setup
        </h2>
        <p className="text-muted-foreground">
          {status === "completed"
            ? "Everything is ready."
            : status === "error"
              ? "Setup stopped before completion."
              : isStale
                ? "Setup appears to be unresponsive. You can retry or skip."
                : "Preparing this workspace based on your creation options."}
        </p>
      </div>

      <div
        className={cn(
          "flex w-full shrink-0 flex-nowrap overflow-hidden",
          compact ? "gap-2" : useCompactSteps ? "gap-2" : "gap-4",
        )}
      >
        {steps.map((step, idx) => {
          const isFailed = status === "error" && step.id === currentStepKey;
          const isActive =
            status !== "completed" && status !== "error" && step.id === currentStepKey;
          const isDone = idx < currentStepIndex || status === "completed";

          return (
            <div
              key={step.id}
              className={cn(
                "min-w-0 flex-1 basis-0 border transition-all duration-300",
                compact || useCompactSteps ? "rounded-lg px-2.5 py-2" : "rounded-xl p-4",
                isActive
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-muted/30",
                isDone && !isActive && "border-emerald-500/30 bg-emerald-500/5",
                isFailed && "border-destructive bg-destructive/5 ring-1 ring-destructive",
              )}
            >
              <div className={cn("flex min-w-0 items-center", useCompactSteps ? "mb-1 gap-2" : "mb-2 gap-3")}>
                {renderStepIcon(step, idx)}
                <span
                  className={cn(
                    "min-w-0 truncate font-semibold",
                    compact || useCompactSteps ? "text-[12px]" : "text-sm",
                    isActive
                      ? "text-primary"
                      : isDone
                        ? "text-emerald-600 dark:text-emerald-400"
                        : isFailed
                          ? "text-destructive"
                          : "text-foreground",
                  )}
                >
                  {step.title}
                </span>
              </div>
              <p
                className={cn(
                  "overflow-hidden text-muted-foreground",
                  compact || useCompactSteps ? "line-clamp-2 text-[10px] leading-tight" : "text-xs",
                )}
              >
                {step.description}
              </p>
            </div>
          );
        })}
      </div>

      <div className="w-full shrink-0 space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 font-medium">
            {status === "error" ? (
              <AlertCircle className="size-4 text-destructive" />
            ) : (
              <Terminal className="size-4 text-primary" />
            )}
            {stepTitle}
          </span>
          <span className="tabular-nums text-muted-foreground">
            {Math.round(progressValue)}%
          </span>
        </div>
        <Progress
          value={progressValue}
          className={cn("h-2 transition-all duration-500", status === "error" && "bg-destructive/20")}
        />
      </div>

      {renderBody()}

      <div className={cn(
        "flex w-full shrink-0 flex-col items-center gap-2",
        compact ? "pb-0" : "pb-2",
      )}>
        <div className={cn("flex justify-center gap-3", compact ? "min-h-[44px]" : "min-h-[60px]")}>
          {status === "completed" ? (
            <Button
              size={compact ? "default" : "lg"}
              className={cn(
                "gap-3 rounded-sm font-bold text-primary-foreground shadow-lg transition-all hover:scale-105 hover:shadow-primary/20 active:scale-95",
                compact ? "px-4 py-2 text-sm" : "px-12 py-6 text-lg",
              )}
              onClick={onFinish}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
            >
              <Clock className="size-5" />
              Start Building {localCountdown > 0 && `(${localCountdown}s)`}
              <ArrowRight className="size-5" />
            </Button>
          ) : status === "error" ? (
            <>
              {canSkipSetupScript && (
                <Button
                  variant="outline"
                  size={compact ? "default" : "lg"}
                  className={cn(
                    "rounded-sm shadow-lg transition-all hover:scale-105 active:scale-95",
                    compact ? "px-4" : "px-8",
                  )}
                  disabled={isSkippingSetupScript}
                  onClick={handleSkipSetupScript}
                >
                  {isSkippingSetupScript ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Skipping...
                    </>
                  ) : (
                    "Skip"
                  )}
                </Button>
              )}
              <Button
                variant="destructive"
                size={compact ? "default" : "lg"}
                className={cn(
                  "rounded-sm shadow-lg transition-all hover:scale-105 active:scale-95",
                  compact ? "px-4" : "px-12",
                )}
                onClick={() => retryWorkspaceSetup(workspaceId)}
              >
                Retry Initialization
              </Button>
            </>
          ) : isStale ? (
            <>
              <Button
                variant="outline"
                size={compact ? "default" : "lg"}
                className={cn(
                  "rounded-sm shadow-lg transition-all hover:scale-105 active:scale-95",
                  compact ? "px-4" : "px-8",
                )}
                onClick={onFinish}
              >
                Skip & Enter Workspace
              </Button>
              <Button
                variant="destructive"
                size={compact ? "default" : "lg"}
                className={cn(
                  "rounded-sm shadow-lg transition-all hover:scale-105 active:scale-95",
                  compact ? "px-4" : "px-12",
                )}
                onClick={() => retryWorkspaceSetup(workspaceId)}
              >
                Retry Initialization
              </Button>
            </>
          ) : progress.requiresConfirmation ? (
            <Button
              size={compact ? "default" : "lg"}
              className={cn(
                "gap-3 rounded-sm shadow-lg transition-all hover:scale-105 active:scale-95",
                compact ? "px-4" : "px-12",
              )}
              disabled={isConfirmingTodos || (editedTodoOutput ?? output).trim().length === 0}
              onClick={handleConfirmTodos}
            >
              {isConfirmingTodos ? (
                <>
                  <Loader2 className="size-5 animate-spin" />
                  Saving TODOs...
                </>
              ) : (
                <>
                  Next: Save TODOs
                  <ArrowRight className="size-5" />
                </>
              )}
            </Button>
          ) : null}
        </div>

        <div className={cn("flex w-full items-center justify-center", compact ? "h-5" : "h-6")}>
          {status === "completed" && !compact && (
            <p className="animate-pulse text-center text-xs text-muted-foreground">
              Tip: Press{" "}
              <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-bold font-sans">
                ⌘
              </kbd>{" "}
              +{" "}
              <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-bold font-sans">
                Enter
              </kbd>{" "}
              to continue
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
