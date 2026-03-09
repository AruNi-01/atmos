"use client";

import React from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  toastManager,
  cn,
} from "@workspace/ui";
import {
  Check,
  Copy,
  ExternalLink,
  FolderGit2,
  Home,
  SquareTerminal,
  X,
} from "lucide-react";
import { fsApi } from "@/api/ws-api";
import { Terminal, type TerminalRef } from "@/components/terminal/Terminal";
import { useProjectStore } from "@/hooks/use-project-store";
import {
  buildSkillInstallCommand,
  hasInferredDownloadUrl,
  resolveSkillSourceUrl,
  type SkillMarketItem,
} from "./market-data";

interface SkillInstallTerminalDialogProps {
  open: boolean;
  skill: SkillMarketItem | null;
  onOpenChange: (open: boolean) => void;
}

type InstallScope = "global" | "project";
type InstallPhase = "configure" | "terminal";

export const SkillInstallTerminalDialog: React.FC<SkillInstallTerminalDialogProps> = ({
  open,
  skill,
  onOpenChange,
}) => {
  const terminalRef = React.useRef<TerminalRef | null>(null);
  const startedRef = React.useRef(false);
  const commandStartTimerRef = React.useRef<number | null>(null);
  const { projects, fetchProjects, isLoading: isLoadingProjects } = useProjectStore();
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [sessionError, setSessionError] = React.useState<string | null>(null);
  const [installScope, setInstallScope] = React.useState<InstallScope>("global");
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState<InstallPhase>("configure");
  const [homeDir, setHomeDir] = React.useState<string | null>(null);
  const [homeDirError, setHomeDirError] = React.useState<string | null>(null);
  const [isPreparingTargets, setIsPreparingTargets] = React.useState(false);

  const command = skill ? buildSkillInstallCommand(skill.downloadUrl) : "";
  const sourceUrl = skill ? resolveSkillSourceUrl(skill) : "";
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const terminalWorkspaceId =
    installScope === "global" ? "default" : selectedProject?.id ?? null;

  const terminalTarget =
    installScope === "global" && homeDir
      ? {
          workspaceId: "default",
          projectName: "Global",
          workspaceName: "Home",
          cwd: homeDir,
          cwdLabel: "~",
          scopeHint: "In the interactive terminal, choose Global Installation scope.",
          targetLabel: "Global installation",
        }
      : selectedProject
      ? {
          workspaceId: selectedProject.id,
          projectName: selectedProject.name,
          workspaceName: "Project",
          cwd: selectedProject.mainFilePath,
          cwdLabel: selectedProject.mainFilePath,
          scopeHint: "In the interactive terminal, choose Project Installation scope.",
          targetLabel: selectedProject.name,
        }
      : null;

  React.useEffect(() => {
    if (!open || !skill) {
      startedRef.current = false;
      if (commandStartTimerRef.current) {
        window.clearTimeout(commandStartTimerRef.current);
        commandStartTimerRef.current = null;
      }
      setSessionId(null);
      setSessionError(null);
      setInstallScope("global");
      setSelectedProjectId(null);
      setPhase("configure");
      setHomeDir(null);
      setHomeDirError(null);
      setIsPreparingTargets(false);
      return;
    }

    startedRef.current = false;
    if (commandStartTimerRef.current) {
      window.clearTimeout(commandStartTimerRef.current);
      commandStartTimerRef.current = null;
    }
    setSessionError(null);
    setPhase("configure");
    setInstallScope("global");
    setSelectedProjectId(null);
    setHomeDir(null);
    setHomeDirError(null);
  }, [open, skill]);

  React.useEffect(() => {
    if (!open || !skill) {
      return;
    }

    let cancelled = false;
    setIsPreparingTargets(true);

    void Promise.allSettled([fsApi.getHomeDir(), fetchProjects()]).then((results) => {
      if (cancelled) {
        return;
      }

      const [homeDirResult] = results;

      if (homeDirResult.status === "fulfilled") {
        setHomeDir(homeDirResult.value);
        setHomeDirError(null);
      } else {
        setHomeDir(null);
        setHomeDirError(homeDirResult.reason instanceof Error ? homeDirResult.reason.message : "Failed to load home directory");
      }

      setIsPreparingTargets(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, skill, fetchProjects]);

  React.useEffect(() => {
    if (!open || !skill || phase !== "terminal" || !terminalWorkspaceId) {
      setSessionId(null);
      return;
    }

    startedRef.current = false;
    if (commandStartTimerRef.current) {
      window.clearTimeout(commandStartTimerRef.current);
      commandStartTimerRef.current = null;
    }
    setSessionError(null);
    setSessionId(`skills-install-${terminalWorkspaceId}-${skill.id}-${Date.now()}`);
  }, [open, skill, phase, terminalWorkspaceId]);

  const closeDialog = React.useCallback(() => {
    if (commandStartTimerRef.current) {
      window.clearTimeout(commandStartTimerRef.current);
      commandStartTimerRef.current = null;
    }
    terminalRef.current?.destroy();
    onOpenChange(false);
  }, [onOpenChange]);

  const sendInstallCommand = React.useCallback(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;
    if (commandStartTimerRef.current) {
      window.clearTimeout(commandStartTimerRef.current);
      commandStartTimerRef.current = null;
    }
    terminalRef.current?.sendText(`${command}\r`);
  }, [command]);

  const queueInstallCommand = React.useCallback(
    (delayMs: number) => {
      if (startedRef.current) {
        return;
      }

      if (commandStartTimerRef.current) {
        window.clearTimeout(commandStartTimerRef.current);
      }

      commandStartTimerRef.current = window.setTimeout(() => {
        commandStartTimerRef.current = null;
        sendInstallCommand();
      }, delayMs);
    },
    [sendInstallCommand],
  );

  const handleCopyCommand = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
      toastManager.add({
        title: "Command copied",
        description: "Install command copied to clipboard.",
        type: "success",
      });
    } catch {
      toastManager.add({
        title: "Copy failed",
        description: "Clipboard is not available.",
        type: "error",
      });
    }
  }, [command]);

  const handleStartTerminal = () => {
    if (!terminalTarget) {
      return;
    }
    setPhase("terminal");
  };

  const handleCloseTerminalView = React.useCallback(() => {
    if (commandStartTimerRef.current) {
      window.clearTimeout(commandStartTimerRef.current);
      commandStartTimerRef.current = null;
    }
    startedRef.current = false;
    terminalRef.current?.destroy();
    setSessionId(null);
    setSessionError(null);
    setPhase("configure");
  }, []);

  if (!skill) {
    return null;
  }

  const canStartTerminal = installScope === "global" ? !!homeDir : !!selectedProject;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeDialog();
        }
      }}
    >
      <DialogContent
        showCloseButton={phase !== "terminal"}
        onPointerDownOutside={(e) => {
          if (phase === "terminal") e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (phase === "terminal") e.preventDefault();
        }}
        className="flex h-[min(760px,calc(100vh-2rem))] w-[calc(100vw-2rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:w-[840px] sm:!max-w-[1240px]"
      >
        <DialogHeader className="border-b border-border px-6 py-5 text-left">
          <div className="flex flex-wrap items-center gap-3 pr-12">
            <DialogTitle className="flex items-center gap-2 text-base">
              <SquareTerminal className="size-4.5 text-primary" />
              Install {skill.title}
            </DialogTitle>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyCommand} className="cursor-pointer">
                <Copy className="mr-1.5 size-3.5" />
                Copy Command
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(sourceUrl, "_blank", "noopener,noreferrer")}
                className="cursor-pointer"
              >
                <ExternalLink className="mr-1.5 size-3.5" />
                Open Source
              </Button>
            </div>
          </div>
          <DialogDescription className="pr-12">
            {phase === "configure" ? (
              <>
                Choose whether to install this skill globally or into a specific project, then launch a temporary shell terminal.
              </>
            ) : (
              <>
                A temporary shell terminal runs <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{command}</code>. Complete any interactive prompts, then close this dialog yourself.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-5">
          {hasInferredDownloadUrl(skill) && (
            <div>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                Install URL inferred from relative markdown link
              </span>
            </div>
          )}

          {phase === "configure" ? (
            <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-background p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setInstallScope("global")}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-4 text-left transition-all cursor-pointer",
                    installScope === "global"
                      ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                      : "border-border hover:bg-muted/40",
                  )}
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Home className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">Global</span>
                      {installScope === "global" && <Check className="size-4 text-primary" />}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Start the terminal in <code className="rounded bg-muted px-1 py-0.5">~</code> and install into your global skills directory.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setInstallScope("project")}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-4 text-left transition-all cursor-pointer",
                    installScope === "project"
                      ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                      : "border-border hover:bg-muted/40",
                  )}
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <FolderGit2 className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">Project</span>
                      {installScope === "project" && <Check className="size-4 text-primary" />}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Pick one project below and start the terminal in that project&apos;s main path.
                    </p>
                  </div>
                </button>
              </div>

              <div className="mt-4 min-h-0 flex-1">
                {installScope === "project" ? (
                  <div className="flex h-full min-h-0 flex-col space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-medium text-foreground">Projects</h3>
                      <span className="text-xs text-muted-foreground">{projects.length} available</span>
                    </div>

                    {isLoadingProjects || isPreparingTargets ? (
                      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                        Loading projects...
                      </div>
                    ) : projects.length > 0 ? (
                      <div className="grid min-h-0 flex-1 auto-rows-max gap-2 overflow-auto pr-1">
                        {projects.map((project) => (
                          <button
                            key={project.id}
                            type="button"
                            onClick={() => setSelectedProjectId(project.id)}
                            className={cn(
                              "flex items-start justify-between gap-3 rounded-lg border px-3 py-3 text-left transition-colors cursor-pointer",
                              selectedProjectId === project.id
                                ? "border-primary/40 bg-primary/5"
                                : "border-border hover:bg-muted/40",
                            )}
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground">{project.name}</p>
                              <p className="mt-1 break-all text-xs leading-relaxed text-muted-foreground">
                                {project.mainFilePath}
                              </p>
                            </div>
                            {selectedProjectId === project.id && <Check className="mt-0.5 size-4 shrink-0 text-primary" />}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                        No projects available. Choose Global instead.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                    Global installation will start in your home directory.
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-border bg-muted/20 px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                  {terminalTarget
                    ? terminalTarget.targetLabel
                    : installScope === "global"
                      ? "Preparing global installation"
                      : "Choose a project"}
                </p>
                <p className="mt-1 break-all text-xs text-muted-foreground">
                  CWD:{" "}
                  <code className="rounded bg-background px-1 py-0.5">
                    {terminalTarget?.cwdLabel ||
                      (installScope === "global"
                        ? (isPreparingTargets ? "Loading home directory..." : "~")
                        : "Select a project to continue")}
                  </code>
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {homeDirError && installScope === "global"
                    ? homeDirError
                    : terminalTarget?.scopeHint ||
                      (installScope === "global"
                        ? "Loading your home directory before opening the terminal."
                        : "Select a project, then start the terminal.")}
                </p>
              </div>

              <div className="mt-4 flex justify-end">
                <Button onClick={handleStartTerminal} disabled={!canStartTerminal} className="cursor-pointer">
                  <SquareTerminal className="mr-1.5 size-4" />
                  Install in Terminal
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col space-y-4">
              <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{terminalTarget?.targetLabel}</p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      CWD: <code className="rounded bg-background px-1 py-0.5">{terminalTarget?.cwdLabel}</code>
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{terminalTarget?.scopeHint}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleCloseTerminalView} className="shrink-0 cursor-pointer">
                    <X className="mr-1.5 size-3.5" />
                    Close Terminal
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
                  <span className="truncate">{terminalTarget?.targetLabel}</span>
                  <span className="truncate text-right">{terminalTarget?.cwdLabel || "~"}</span>
                </div>

                <div className="min-h-0 flex-1 bg-background">
                  {sessionId && terminalTarget && (
                    <Terminal
                      ref={terminalRef}
                      sessionId={sessionId}
                      workspaceId={terminalTarget.workspaceId}
                      projectName={terminalTarget.projectName}
                      workspaceName={terminalTarget.workspaceName}
                      terminalName={`skills-install-${skill.id}`}
                      noTmux={true}
                      cwd={terminalTarget.cwd}
                      onSessionReady={() => {
                        queueInstallCommand(1400);
                      }}
                      onData={() => {
                        if (!startedRef.current) {
                          queueInstallCommand(500);
                        }
                      }}
                      onSessionError={(_, error) => {
                        setSessionError(error);
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {sessionError && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {sessionError}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
