"use client";

import React from "react";
import { useTranslations } from "next-intl";
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
import { Terminal, type TerminalRef } from "@/features/terminal/components/Terminal";
import {
  useProjects,
  useProjectsLoading,
  ensureProjectBootstrap,
} from "@/features/project/hooks/use-project-bootstrap-query";
import {
  buildSkillInstallCommand,
  hasInferredDownloadUrl,
  resolveSkillSourceUrl,
  type SkillMarketItem,
} from "../lib/market-data";

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
  const t = useTranslations("skills.installTerminalDialog" as never);
  const tr = React.useCallback(
    (key: string, values?: Record<string, string | number>) =>
      t.has(key as never) ? t(key as never, values as never) : "",
    [t],
  );
  const projects = useProjects();
  const isLoadingProjects = useProjectsLoading();
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
          projectName: tr("scope.global.title") || skill?.title || "",
          workspaceName: homeDir,
          cwd: homeDir,
          cwdLabel: "~",
          scopeHint: tr("scope.global.targetHint"),
          targetLabel: tr("scope.global.targetLabel"),
        }
      : selectedProject
      ? {
          workspaceId: selectedProject.id,
          projectName: selectedProject.name,
          workspaceName: selectedProject.mainFilePath ?? selectedProject.name,
          cwd: selectedProject.mainFilePath ?? "",
          cwdLabel: selectedProject.mainFilePath ?? selectedProject.name,
          scopeHint: tr("scope.project.targetHint"),
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

    void Promise.allSettled([fsApi.getHomeDir(), ensureProjectBootstrap()]).then((results) => {
      if (cancelled) {
        return;
      }

      const [homeDirResult] = results;

      if (homeDirResult.status === "fulfilled") {
        setHomeDir(homeDirResult.value);
        setHomeDirError(null);
      } else {
        setHomeDir(null);
        setHomeDirError(
          homeDirResult.reason instanceof Error
            ? homeDirResult.reason.message
            : tr("errors.homeDirectoryLoadFailed"),
        );
      }

      setIsPreparingTargets(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, skill]);

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
        title: tr("copyToast.successTitle"),
        description: tr("copyToast.successDescription"),
        type: "success",
      });
    } catch {
      toastManager.add({
        title: tr("copyToast.errorTitle"),
        description: tr("copyToast.errorDescription"),
        type: "error",
      });
    }
  }, [command, tr]);

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
              {tr("title", { skillTitle: skill.title }) || skill.title}
            </DialogTitle>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyCommand} className="cursor-pointer">
                <Copy className="mr-1.5 size-3.5" />
                {tr("buttons.copyCommand")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(sourceUrl, "_blank", "noopener,noreferrer")}
                className="cursor-pointer"
              >
                <ExternalLink className="mr-1.5 size-3.5" />
                {tr("buttons.viewSource")}
              </Button>
            </div>
          </div>
          <DialogDescription className="pr-12">
            {phase === "configure" ? (
              tr("description.configure")
            ) : (
              <>
                {tr("description.terminalLead") && (
                  <>
                    {tr("description.terminalLead")}{" "}
                  </>
                )}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{command}</code>
                {tr("description.terminalTail") && (
                  <>
                    {" "}
                    {tr("description.terminalTail")}
                  </>
                )}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-5">
          {hasInferredDownloadUrl(skill) && (
            <div>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                {tr("badge.inferredInstallUrl")}
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
                    "flex items-start gap-3 rounded-xl border p-4 text-left cursor-pointer",
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
                      <span className="text-sm font-semibold text-foreground">
                        {tr("scope.global.title")}
                      </span>
                      {installScope === "global" && <Check className="size-4 text-primary" />}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {tr("scope.global.description")}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setInstallScope("project")}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-4 text-left cursor-pointer",
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
                      <span className="text-sm font-semibold text-foreground">
                        {tr("scope.project.title")}
                      </span>
                      {installScope === "project" && <Check className="size-4 text-primary" />}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {tr("scope.project.description")}
                    </p>
                  </div>
                </button>
              </div>

              <div className="mt-4 min-h-0 flex-1">
                {installScope === "project" ? (
                  <div className="flex h-full min-h-0 flex-col space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-medium text-foreground">
                        {tr("projects.title")}
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {tr("projects.available", { count: projects.length }) || String(projects.length)}
                      </span>
                    </div>

                    {isLoadingProjects || isPreparingTargets ? (
                      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                        {tr("projects.loading")}
                      </div>
                    ) : projects.length > 0 ? (
                      <div className="grid min-h-0 flex-1 auto-rows-max gap-2 overflow-auto pr-1">
                        {projects.map((project) => (
                          <button
                            key={project.id}
                            type="button"
                            onClick={() => setSelectedProjectId(project.id)}
                            className={cn(
                              "flex items-start justify-between gap-3 rounded-lg border px-3 py-3 text-left cursor-pointer",
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
                        {tr("projects.emptyState")}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                    {tr("scope.global.panelHint")}
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-border bg-muted/20 px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                  {terminalTarget
                    ? terminalTarget.targetLabel
                    : installScope === "global"
                      ? tr("target.preparingGlobalInstall")
                      : tr("target.chooseProject")}
                </p>
                <p className="mt-1 break-all text-xs text-muted-foreground">
                  {tr("labels.cwd")}{" "}
                  <code className="rounded bg-background px-1 py-0.5">
                    {terminalTarget?.cwdLabel ||
                      (installScope === "global"
                        ? (isPreparingTargets
                            ? tr("target.loadingHomeDirectory")
                            : "~")
                        : tr("target.selectProjectToContinue"))}
                  </code>
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {homeDirError && installScope === "global"
                    ? homeDirError
                    : terminalTarget?.scopeHint ||
                      (installScope === "global"
                        ? tr("target.loadingHomeDirectoryHint")
                        : tr("target.selectProjectHint"))}
                </p>
              </div>

              <div className="mt-4 flex justify-end">
                <Button onClick={handleStartTerminal} disabled={!canStartTerminal} className="cursor-pointer">
                  <SquareTerminal className="mr-1.5 size-4" />
                  {tr("buttons.openTerminal")}
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
                      {tr("labels.cwd")} <code className="rounded bg-background px-1 py-0.5">{terminalTarget?.cwdLabel}</code>
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{terminalTarget?.scopeHint}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleCloseTerminalView} className="shrink-0 cursor-pointer">
                    <X className="mr-1.5 size-3.5" />
                    {tr("buttons.backToSetup")}
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
