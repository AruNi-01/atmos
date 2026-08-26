"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ShieldAlert,
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
import { cn } from "@/shared/lib/utils";
import { WorkspaceSetupProgress, useProjectStore } from "@/features/project/store/use-project-store";
import { wsScriptApi, wsWorkspaceApi } from "@/api/ws-api";
import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";
import { motion, useReducedMotion } from "motion/react";
import { useHotkeys } from "react-hotkeys-hook";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { atmosDarkTheme, defaultTerminalOptions } from "../../terminal/lib/theme";
import { getWorkspaceSetupCurrentStepKey, type WorkspaceSetupStepKey } from "@/features/workspace/lib/workspace-setup";
import { ScriptTrustReview } from "@/shared/components/ScriptTrustReview";

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
  pauseAutoFinishEnabled?: boolean;
  autoFinishSeconds?: number;
  onAutoFinishHoverChange?: (hovered: boolean) => void;
}

export const WorkspaceSetupProgressView: React.FC<WorkspaceSetupProgressProps> = ({
  progress,
  onFinish,
  compact = false,
  pauseAutoFinishEnabled = true,
  autoFinishSeconds,
  onAutoFinishHoverChange,
}) => {
  const t = useTranslations("Workspace.components.setupProgress");
  const stepT = useTranslations("Workspace.components.workspaceSetup.steps");
  const { status, stepTitle, output, workspaceId, stepKey, lastStepKey, failedStepKey, setupContext } =
    progress;
  const retryWorkspaceSetup = useProjectStore((s) => s.retryWorkspaceSetup);
  const reduceMotion = useReducedMotion();
  const needsScriptTrust = progress.requiresScriptTrust === true;
  const [isTrustingScript, setIsTrustingScript] = useState(false);

  /**
   * The server sends the whole script file here, serialized from the same read
   * as `scriptHash`, so what is displayed always matches what gets trusted.
   */
  const scriptsForReview = useMemo<Record<string, string>>(() => {
    if (!needsScriptTrust) return {};
    try {
      const parsed = JSON.parse(output) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { setup: output };
      }
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
          key,
          typeof value === "string" ? value : JSON.stringify(value),
        ]),
      );
    } catch {
      // Older server sent just the setup command.
      return { setup: output };
    }
  }, [needsScriptTrust, output]);

  const handleTrustScript = async () => {
    const projectGuid = progress.scriptProjectGuid;
    const hash = progress.scriptHash;
    if (!projectGuid || !hash || isTrustingScript) return;

    setIsTrustingScript(true);
    try {
      // The hash pins what was rendered above: if the file changed since, the
      // server rejects this and the script is shown again.
      await wsScriptApi.trust(projectGuid, hash, workspaceId);
    } catch (error) {
      toastManager.add({
        title: t("scriptTrust.trustFailed"),
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      setIsTrustingScript(false);
    }
  };

  const currentStepKey: WorkspaceSetupStepKey = useMemo(
    () => getWorkspaceSetupCurrentStepKey(progress),
    [progress],
  );
  const failedStepToSkip = failedStepKey ?? currentStepKey;

  // requirement.md is pre-filled synchronously during workspace creation
  // (see backend `handle_workspace_create`). The step is still surfaced in
  // the setup checklist so users can see what was prepared, but it will be
  // rendered as already-completed because `currentStepKey` advances past it.
  const contextStep = useMemo(() => {
    const hasGithubIssue = !!setupContext?.hasGithubIssue;
    const hasGithubPr = !!setupContext?.hasGithubPr;
    const hasRequirementStep = !!setupContext?.hasRequirementStep;

    if (!hasGithubIssue && !hasGithubPr && !hasRequirementStep) {
      return null;
    }

    if (hasGithubPr) {
      return {
        id: "write_requirement" as const,
        title: stepT("fillPrSpec"),
        description: t("stepDescriptions.linkedPrWritten"),
      };
    }

    if (hasGithubIssue) {
      return {
        id: "write_requirement" as const,
        title: stepT("fillIssueSpec"),
        description: t("stepDescriptions.linkedIssueWritten"),
      };
    }

    return {
      id: "write_requirement" as const,
      title: stepT("writeRequirementSpec"),
      description: t("stepDescriptions.requirementSaved"),
    };
  }, [setupContext, stepT, t]);

  const todoStep = useMemo(
    () =>
      !!setupContext?.autoExtractTodos
        ? {
            id: "extract_todos" as const,
            title: stepT("extractTodos"),
            description: t("stepDescriptions.extractTodos"),
          }
        : null,
    [setupContext?.autoExtractTodos, stepT, t],
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
        title: stepT("createWorkspace"),
        description: t("stepDescriptions.createWorkspace"),
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
        title: stepT("runSetupScript"),
        description: t("stepDescriptions.runSetupScript"),
      });
    }

    nextSteps.push({
      id: "ready",
      title: stepT("ready"),
      description: t("stepDescriptions.ready"),
    });

    return nextSteps;
  }, [contextStep, showSetupScriptStep, stepT, t, todoStep]);

  const currentStepIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === currentStepKey),
  );
  const displayStepTitle =
    steps.find((step) => step.id === failedStepToSkip)?.title ?? stepTitle;
  const useCompactSteps = steps.length >= 5;
  const progressValue =
    status === "completed"
      ? 100
      : (currentStepIndex + 0.5) * (100 / Math.max(1, steps.length));

  const [isHovered, setIsHovered] = useState(false);
  const localRemainingRef = useRef(5_000);
  const localDeadlineRef = useRef<number | null>(null);
  const localCompletedRef = useRef(false);
  const [countdownStatus, setCountdownStatus] = useState(status);
  const [localRemainingMs, setLocalRemainingMs] = useState(5_000);
  if (countdownStatus !== status) {
    setCountdownStatus(status);
    setLocalRemainingMs(5_000);
  }
  const confirmationKey = `${workspaceId ?? ""}:${stepKey ?? ""}:${progress.requiresConfirmation ? "confirm" : "idle"}`;
  const [confirmingTodosState, setConfirmingTodosState] = useState({ key: confirmationKey, value: false });
  const [skippingFailedStepState, setSkippingFailedStepState] = useState({ workspaceId, value: false });
  const [isTodoEditing, setIsTodoEditing] = useState(false);
  const [editedTodoOutput, setEditedTodoOutput] = useState<string | null>(null);
  const staleKey = `${status}:${stepKey ?? ""}:${stepTitle}:${output.length}:${progress.requiresConfirmation ? "confirm" : "run"}`;
  const [staleState, setStaleState] = useState({ key: staleKey, value: false });
  const localCountdown = Math.max(0, Math.ceil(localRemainingMs / 1_000));
  const displayedCountdown = autoFinishSeconds ?? localCountdown;
  const isConfirmingTodos = progress.requiresConfirmation && confirmingTodosState.key === confirmationKey
    ? confirmingTodosState.value
    : false;
  const isSkippingFailedStep = status === "error" && skippingFailedStepState.workspaceId === workspaceId
    ? skippingFailedStepState.value
    : false;
  const isStale = staleState.key === staleKey ? staleState.value : false;

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

    let fitFrame = 0;
    const resizeObserver = new ResizeObserver(() => {
      if (fitFrame) return;
      fitFrame = window.requestAnimationFrame(() => {
        fitFrame = 0;
        if (terminalContainerRef.current) {
          fitAddon.fit();
        }
      });
    });
    resizeObserver.observe(terminalContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (fitFrame) window.cancelAnimationFrame(fitFrame);
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
    if (autoFinishSeconds != null || status !== "completed") {
      localRemainingRef.current = 5_000;
      localDeadlineRef.current = null;
      localCompletedRef.current = false;
      return;
    }

    const captureRemaining = () => {
      if (localDeadlineRef.current == null) return;
      localRemainingRef.current = Math.max(0, localDeadlineRef.current - Date.now());
      localDeadlineRef.current = null;
      setLocalRemainingMs(localRemainingRef.current);
    };

    if (isHovered && pauseAutoFinishEnabled) {
      captureRemaining();
      return;
    }

    if (localRemainingRef.current <= 0) {
      if (!localCompletedRef.current) {
        localCompletedRef.current = true;
        onFinish();
      }
      return;
    }

    localDeadlineRef.current = Date.now() + localRemainingRef.current;
    const timer = window.setInterval(() => {
      const next = Math.max(0, (localDeadlineRef.current ?? 0) - Date.now());
      localRemainingRef.current = next;
      setLocalRemainingMs(next);
      if (next > 0 || localCompletedRef.current) return;
      localCompletedRef.current = true;
      localDeadlineRef.current = null;
      window.clearInterval(timer);
      onFinish();
    }, 100);

    return () => {
      captureRemaining();
      window.clearInterval(timer);
    };
  }, [autoFinishSeconds, isHovered, onFinish, pauseAutoFinishEnabled, status]);

  // Detect stale progress: if no update arrives for 30s while in-progress,
  // the backend may have finished silently (e.g. plan build failure, lost WS events).
  // Skip detection when waiting for user confirmation (requiresConfirmation).
  useEffect(() => {
    if (status === "completed" || status === "error" || progress.requiresConfirmation) {
      return;
    }
    // Allow a longer timeout for setup scripts which may take a while to run.
    const timeoutMs = status === "setting_up" ? 120_000 : 90_000;
    const timer = setTimeout(() => setStaleState({ key: staleKey, value: true }), timeoutMs);
    return () => clearTimeout(timer);
  }, [progress.requiresConfirmation, staleKey, status]);

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
      setConfirmingTodosState({ key: confirmationKey, value: true });
      await wsWorkspaceApi.confirmTodos(workspaceId, finalOutput);
    } catch (error) {
      console.error("Failed to confirm extracted TODOs:", error);
      setConfirmingTodosState({ key: confirmationKey, value: false });
      toastManager.add({
        title: t("toasts.continueFailedTitle"),
        description: t("toasts.continueFailedDescription"),
        type: "error",
      });
    }
  };

  const skippableFailedStepKey =
    status === "error" && failedStepToSkip !== "create_worktree"
      ? failedStepToSkip
      : null;
  const canSkipFailedStep = skippableFailedStepKey !== null;

  const handleSkipFailedStep = async () => {
    if (!workspaceId || !skippableFailedStepKey || isSkippingFailedStep) return;

    try {
      setSkippingFailedStepState({ workspaceId, value: true });
      await wsWorkspaceApi.skipSetupStep(workspaceId, skippableFailedStepKey, {
        initialRequirement: progress.retryContext?.initialRequirement ?? null,
        githubIssue: progress.retryContext?.githubIssue ?? null,
        autoExtractTodos: progress.retryContext?.autoExtractTodos ?? false,
      });
    } catch (error) {
      console.error("Failed to skip setup step:", error);
      setSkippingFailedStepState({ workspaceId, value: false });
      toastManager.add({
        title: t("toasts.skipFailedTitle"),
        description: t("toasts.skipFailedDescription"),
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

  const statusPanelClass = cn(
    "flex w-full items-center justify-center border text-center text-sm text-muted-foreground",
    compact ? "rounded-lg px-4 py-5" : "min-h-[200px] flex-1 rounded-xl px-6",
  );
  const reviewPanelClass = cn(
    "flex w-full flex-col overflow-hidden border bg-background",
    compact ? "max-h-[280px] rounded-lg" : "min-h-[260px] flex-1 rounded-xl",
  );
  const actionSize = compact ? "sm" : "default";

  const renderBody = () => {
    if (status === "completed") {
      return (
        <div className={cn(statusPanelClass, "border-border bg-background")}>
          <div className="max-w-md space-y-2">
            <p className="text-sm font-medium text-foreground">{t("states.readyTitle")}</p>
            <p>{t("states.readyDescription")}</p>
          </div>
        </div>
      );
    }

    if (showTerminalPanel) {
      return (
        <div
          className={cn(
            "relative flex w-full flex-col overflow-hidden border border-border bg-[#09090b]",
            compact ? "h-52 rounded-lg" : "min-h-[60px] flex-1 rounded-xl",
          )}
        >
          <div className="flex items-center justify-between border-b border-white/5 bg-[#161b22] px-4 py-2">
            <div className="flex gap-1.5">
              <div className="size-2.5 rounded-full bg-[#ff5f56]" />
              <div className="size-2.5 rounded-full bg-[#ffbd2e]" />
              <div className="size-2.5 rounded-full bg-[#27c93f]" />
            </div>
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#8b949e]">
              {t("outputLabel")}
            </span>
          </div>
          <div className={cn("min-h-0 flex-1 overflow-hidden bg-[#09090b]", compact ? "p-3" : "p-4")}>
            <div ref={terminalContainerRef} className="h-full w-full" />
          </div>
        </div>
      );
    }

    if (status === "error") {
      return (
        <div className={cn(statusPanelClass, "border-destructive/30 bg-destructive/5")}>
          <div className="max-w-md space-y-2">
            <p className="text-sm font-medium text-foreground">{t("states.failedTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {displayStepTitle || t("states.failedFallbackDescription")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("states.failedHint")}
            </p>
          </div>
        </div>
      );
    }

    if (currentStepKey === "create_worktree") {
      return (
        <div className={cn(statusPanelClass, "border-border bg-background")}>
          <div className="max-w-md space-y-2">
            <p className="text-sm font-medium text-foreground">{t("states.creatingWorktreeTitle")}</p>
            <p>{t("states.creatingWorktreeDescription")}</p>
          </div>
        </div>
      );
    }

    if (needsScriptTrust) {
      return (
        <div className={cn(reviewPanelClass, "border-destructive/40")}>
          <div className={cn(
            "flex items-start gap-3 border-b border-destructive/40 bg-destructive/5",
            compact ? "px-4 py-3" : "px-5 py-4",
          )}>
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {t("scriptTrust.title")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("scriptTrust.description")}
              </p>
            </div>
          </div>
          <div className={cn("min-h-0 flex-1 overflow-auto", compact ? "px-4 py-3" : "px-5 py-4")}>
            <ScriptTrustReview scripts={scriptsForReview} highlightField="setup" />
          </div>
        </div>
      );
    }

    if (currentStepKey === "extract_todos") {
      const todoContent = editedTodoOutput ?? output;
      return (
        <div className={cn(reviewPanelClass, "border-border")}>
          <div className={cn(
            "flex items-start justify-between gap-2 border-b border-border",
            compact ? "px-4 py-3" : "px-5 py-4",
          )}>
            <div>
              <p className="text-sm font-medium text-foreground">
                {progress.requiresConfirmation ? t("todo.reviewTitle") : t("todo.generatingTitle")}
              </p>
              {progress.requiresConfirmation && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("todo.confirmDescription")}
                </p>
              )}
            </div>
            {progress.requiresConfirmation && todoContent.trim().length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => {
                  if (!isTodoEditing && editedTodoOutput === null) {
                    setEditedTodoOutput(output);
                  }
                  setIsTodoEditing(!isTodoEditing);
                }}
                title={isTodoEditing ? t("todo.switchToPreviewMode") : t("todo.switchToEditMode")}
              >
                {isTodoEditing ? (
                  <>
                    <Eye />
                    {t("todo.preview")}
                  </>
                ) : (
                  <>
                    <Pencil />
                    {t("todo.edit")}
                  </>
                )}
              </Button>
            )}
          </div>
          <div className={cn("min-h-0 flex-1 overflow-y-auto", compact ? "px-4 py-3" : "px-5 py-4")}>
            {todoContent.trim().length > 0 ? (
              isTodoEditing ? (
                <Textarea
                  className={cn(
                    "w-full resize-none border-none bg-transparent px-3 py-2 font-mono text-sm text-foreground shadow-none focus-visible:ring-0",
                    compact ? "min-h-[120px]" : "min-h-[240px]",
                  )}
                  value={editedTodoOutput ?? output}
                  onChange={(e) => setEditedTodoOutput(e.target.value)}
                />
              ) : (
                <MarkdownRenderer className="prose prose-sm max-w-none text-sm text-foreground dark:prose-invert">
                  {todoContent}
                </MarkdownRenderer>
              )
            ) : (
              <div className={cn(
                "flex items-center justify-center text-sm text-muted-foreground",
                compact ? "min-h-[72px]" : "h-full min-h-[160px]",
              )}>
                {t("todo.waiting")}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (currentStepKey === "run_setup_script") {
      return (
        <div className={cn(statusPanelClass, "border-border bg-background")}>
          <div className="max-w-md space-y-2">
            <p className="text-sm font-medium text-foreground">{t("states.runningSetupScriptTitle")}</p>
            <p>
              {t("states.runningSetupScriptDescription")}
              {!output.trim() ? ` ${t("states.runningSetupScriptOutputHint")}` : ""}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className={cn(statusPanelClass, "border-border bg-background")}>
        <div className="max-w-md space-y-2">
          <p className="text-sm font-medium text-foreground">{t("states.preparingTitle")}</p>
          <p>{t("states.preparingDescription")}</p>
        </div>
      </div>
    );
  };

  const renderActions = () => {
    if (status === "completed") {
      return (
        <Button
          size={actionSize}
          onClick={onFinish}
          onMouseEnter={() => {
            setIsHovered(true);
            onAutoFinishHoverChange?.(true);
          }}
          onMouseLeave={() => {
            setIsHovered(false);
            onAutoFinishHoverChange?.(false);
          }}
        >
          <Clock />
          {displayedCountdown > 0
            ? t("actions.startBuildingWithCountdown", { seconds: displayedCountdown })
            : t("actions.startBuilding")}
          <ArrowRight />
        </Button>
      );
    }

    if (status === "error") {
      return (
        <>
          {canSkipFailedStep && (
            <Button
              variant="outline"
              size={actionSize}
              loading={isSkippingFailedStep}
              onClick={handleSkipFailedStep}
            >
              {isSkippingFailedStep ? t("actions.skipping") : t("actions.skip")}
            </Button>
          )}
          <Button
            variant="destructive"
            size={actionSize}
            onClick={() => retryWorkspaceSetup(workspaceId)}
          >
            {t("actions.retryInitialization")}
          </Button>
        </>
      );
    }

    if (isStale) {
      return (
        <>
          <Button variant="outline" size={actionSize} onClick={onFinish}>
            {t("actions.skipAndEnterWorkspace")}
          </Button>
          <Button
            variant="destructive"
            size={actionSize}
            onClick={() => retryWorkspaceSetup(workspaceId)}
          >
            {t("actions.retryInitialization")}
          </Button>
        </>
      );
    }

    if (needsScriptTrust) {
      return (
        <>
          <Button
            variant="outline"
            size={actionSize}
            disabled={isTrustingScript}
            onClick={onFinish}
          >
            {t("scriptTrust.skip")}
          </Button>
          <Button
            variant="destructive"
            size={actionSize}
            loading={isTrustingScript}
            disabled={!progress.scriptHash}
            onClick={handleTrustScript}
          >
            {isTrustingScript ? t("scriptTrust.trusting") : t("scriptTrust.trustAndRun")}
            {!isTrustingScript && <ArrowRight />}
          </Button>
        </>
      );
    }

    if (progress.requiresConfirmation) {
      return (
        <Button
          size={actionSize}
          loading={isConfirmingTodos}
          disabled={(editedTodoOutput ?? output).trim().length === 0}
          onClick={handleConfirmTodos}
        >
          {isConfirmingTodos ? t("actions.savingTodos") : t("actions.nextSaveTodos")}
          {!isConfirmingTodos && <ArrowRight />}
        </Button>
      );
    }

    return null;
  };

  const actions = renderActions();
  const showKeyboardTip = status === "completed" && !compact;
  const bodyKey = [
    status,
    currentStepKey,
    showTerminalPanel ? "term" : "copy",
    needsScriptTrust ? "trust" : "plain",
    progress.requiresConfirmation ? "confirm" : "run",
  ].join(":");

  return (
    <div className={cn(
      "mx-auto flex flex-col bg-background",
      compact
        ? "h-auto w-full max-w-none gap-4 overflow-visible rounded-xl p-4"
        : "h-full max-w-5xl gap-6 overflow-hidden p-6",
    )}>
      <div className={cn(
        "w-full shrink-0 space-y-2 text-center",
        compact ? "pt-0" : "pt-4",
      )}>
        <h2 className={cn("font-bold tracking-tight", compact ? "text-lg" : "text-3xl")}>
          {t("header.title")}
        </h2>
        <p className="text-muted-foreground">
          {status === "completed"
            ? t("header.completed")
            : status === "error"
              ? t("header.error")
              : isStale
                ? t("header.stale")
                : t("header.inProgress")}
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
                "min-w-0 flex-1 basis-0 border",
                compact || useCompactSteps ? "rounded-lg px-2.5 py-2" : "rounded-xl p-4",
                isActive
                  ? "border-primary bg-primary/5"
                  : "border-border bg-muted/30",
                isDone && !isActive && "border-emerald-500/30 bg-emerald-500/5",
                isFailed && "border-destructive bg-destructive/5",
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

      <div className={cn("w-full shrink-0", compact ? "space-y-2" : "space-y-4")}>
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 font-medium">
            {status === "error" ? (
              <AlertCircle className="size-4 text-destructive" />
            ) : (
              <Terminal className="size-4 text-primary" />
            )}
            {displayStepTitle}
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

      <motion.div
        key={bodyKey}
        initial={compact && !reduceMotion ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: compact && !reduceMotion ? 0.18 : 0, ease: [0.22, 1, 0.36, 1] }}
        className={cn("w-full min-w-0", !compact && "flex min-h-0 flex-1 flex-col")}
      >
        {renderBody()}
      </motion.div>

      {(actions || showKeyboardTip) && (
        <div className={cn(
          "flex w-full shrink-0 flex-col items-center gap-2",
          !compact && "pb-2",
        )}>
          {actions && (
            <motion.div
              initial={compact && !reduceMotion ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{ duration: compact && !reduceMotion ? 0.18 : 0, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-wrap justify-center gap-2"
            >
              {actions}
            </motion.div>
          )}

          {showKeyboardTip && (
            <p className="text-center text-xs text-muted-foreground">
              {t("tip.press")}{" "}
              <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium font-sans">
                ⌘
              </kbd>{" "}
              +{" "}
              <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium font-sans">
                Enter
              </kbd>{" "}
              {t("tip.toContinue")}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
