"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
  toastManager,
} from "@workspace/ui";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/motion/tabs";
import { CircleHelp, Loader2 } from "lucide-react";
import { wsScriptApi } from "@/api/ws-api";
import {
  WORKSPACE_SCRIPT_ENV_VARS,
  WORKSPACE_SCRIPT_PHASES,
  emptyWorkspaceScripts,
  insertTokenAtSelection,
  phaseStatus,
  scriptsAreDirty,
  type WorkspaceScriptPhase,
  type WorkspaceScripts,
} from "@/features/workspace/lib/workspace-script-dialog";

const CodeMirrorEditor = dynamic(
  () =>
    import("@/features/editor/components/BaseCodeMirrorEditor").then(
      (mod) => mod.BaseCodeMirrorEditor,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    ),
  },
);

type ScriptEditorView = {
  focus: () => void;
  state: {
    doc: { toString: () => string };
    selection: { main: { from: number; to: number } };
  };
  dispatch: (spec: {
    changes: { from: number; to: number; insert: string };
    selection: { anchor: number };
  }) => void;
};

interface WorkspaceScriptDialogProps {
  projectId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const WorkspaceScriptDialog: React.FC<WorkspaceScriptDialogProps> = ({
  projectId,
  isOpen,
  onClose,
}) => {
  const t = useTranslations("Workspace.components.scriptDialog");
  const tRef = useRef(t);
  tRef.current = t;
  const editorViewRef = useRef<ScriptEditorView | null>(null);
  const [scripts, setScripts] = useState<WorkspaceScripts>(emptyWorkspaceScripts);
  const [initialScripts, setInitialScripts] = useState<WorkspaceScripts | null>(null);
  const [activePhase, setActivePhase] = useState<WorkspaceScriptPhase>("setup");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const savingRef = useRef(false);

  const dirty = scriptsAreDirty(scripts, initialScripts);
  const activeScript = scripts[activePhase];

  const resetEditor = useCallback(() => {
    setScripts(emptyWorkspaceScripts());
    setInitialScripts(null);
    setActivePhase("setup");
    setShowExitConfirm(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      resetEditor();
      return;
    }
    if (!projectId) return;

    let cancelled = false;
    setScripts(emptyWorkspaceScripts());
    setInitialScripts(null);
    setIsLoading(true);
    void (async () => {
      try {
        const { scripts: next } = await wsScriptApi.get(projectId);
        if (cancelled) return;
        const loaded = {
          setup: next.setup || "",
          run: next.run || "",
          purge: next.purge || "",
        };
        setScripts(loaded);
        setInitialScripts(loaded);
      } catch (error) {
        console.error("Failed to load scripts:", error);
        if (cancelled) return;
        toastManager.add({
          title: tRef.current("toasts.errorTitle"),
          description: tRef.current("toasts.loadFailed"),
          type: "error",
        });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, projectId, resetEditor]);

  const handleSave = useCallback(async () => {
    if (!projectId || savingRef.current || isLoading || !scriptsAreDirty(scripts, initialScripts)) {
      return;
    }
    savingRef.current = true;
    setIsSaving(true);
    try {
      await wsScriptApi.save(projectId, scripts);
      setInitialScripts(scripts);
      setShowExitConfirm(false);
      onClose();
    } catch (error) {
      console.error("Failed to save scripts:", error);
      toastManager.add({
        title: t("toasts.errorTitle"),
        description: t("toasts.saveFailed"),
        type: "error",
      });
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [initialScripts, isLoading, onClose, projectId, scripts, t]);

  const handleCloseAttempt = useCallback(() => {
    if (dirty) {
      setShowExitConfirm(true);
      return;
    }
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      void handleSave();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave, isOpen]);

  const updateActiveScript = useCallback(
    (value: string) => {
      setScripts((current) => ({ ...current, [activePhase]: value }));
    },
    [activePhase],
  );

  const handleCreateEditor = useCallback((view: ScriptEditorView) => {
    editorViewRef.current = view;
  }, []);

  const selectPhase = useCallback((phase: WorkspaceScriptPhase) => {
    setActivePhase(phase);
    requestAnimationFrame(() => editorViewRef.current?.focus());
  }, []);

  const insertEnv = useCallback(
    (token: string) => {
      const view = editorViewRef.current;
      const current = view?.state.doc.toString() ?? activeScript;
      const from = view?.state.selection.main.from ?? current.length;
      const to = view?.state.selection.main.to ?? current.length;
      const next = insertTokenAtSelection(current, from, to, token);
      const insertion = next.value.slice(from, next.caret);
      if (view) {
        view.dispatch({
          changes: { from, to, insert: insertion },
          selection: { anchor: next.caret },
        });
        view.focus();
        return;
      }
      updateActiveScript(next.value);
    },
    [activeScript, updateActiveScript],
  );

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleCloseAttempt()}>
        <DialogContent
          className="flex h-[min(86vh,640px)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]"
          onInteractOutside={(event) => {
            event.preventDefault();
            handleCloseAttempt();
          }}
          onEscapeKeyDown={(event) => {
            if (!dirty) return;
            event.preventDefault();
            setShowExitConfirm(true);
          }}
        >
          <DialogHeader className="shrink-0 px-6 pb-3 pr-12 pt-6 text-left">
            <div className="flex min-w-0 items-center gap-2.5">
              <DialogTitle>{t("title")}</DialogTitle>
              {dirty ? (
                <span className="rounded-full bg-foreground/6 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {t("unsaved")}
                </span>
              ) : null}
            </div>
            <DialogDescription className="sr-only">{t("title")}</DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col px-6">
            <PhaseTabs
              activePhase={activePhase}
              scripts={scripts}
              initialScripts={initialScripts}
              onSelect={selectPhase}
            />
            <p className="mb-3 mt-3 shrink-0 text-xs leading-5 text-muted-foreground">
              {t(`${activePhase}.help`)}
            </p>

            <div
              id={`workspace-script-${activePhase}`}
              role="tabpanel"
              aria-label={t(`${activePhase}.title`)}
              className={cn(
                "relative flex min-h-[200px] flex-1 flex-col overflow-hidden rounded-lg border border-border",
                "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
              )}
            >
              {isLoading ? (
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              ) : (
                <>
                  <CodeMirrorEditor
                    className="h-full min-h-0"
                    language="shell"
                    value={activeScript}
                    onChange={updateActiveScript}
                    onCreateEditor={(view) => {
                      handleCreateEditor(view);
                    }}
                    onSave={() => void handleSave()}
                    lineWrap
                    autoFocus
                  />
                  {activeScript.trim().length === 0 ? (
                    <div className="pointer-events-none absolute inset-y-0 right-0 left-10 pt-2 font-mono text-[13px] leading-[1.6] text-muted-foreground/70">
                      {t(`${activePhase}.placeholder`)}
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <EnvInsertBar disabled={isLoading} onInsert={insertEnv} />
          </div>

          <DialogFooter className="flex-row items-center justify-between px-6 pb-5 pt-2">
            <TrustHint />
            <Button onClick={() => void handleSave()} disabled={!dirty || isLoading} loading={isSaving}>
              {isSaving ? t("actions.saving") : t("actions.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <DialogContent className="w-[min(92vw,420px)]">
          <DialogHeader>
            <DialogTitle>{t("confirmExit.title")}</DialogTitle>
            <DialogDescription>{t("confirmExit.description")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isSaving}
              onClick={() => {
                setShowExitConfirm(false);
                onClose();
              }}
            >
              {t("confirmExit.discardChanges")}
            </Button>
            <Button onClick={() => void handleSave()} loading={isSaving}>
              {t("confirmExit.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

function isWorkspaceScriptPhase(value: string): value is WorkspaceScriptPhase {
  return (WORKSPACE_SCRIPT_PHASES as readonly string[]).includes(value);
}

function PhaseTabs({
  activePhase,
  scripts,
  initialScripts,
  onSelect,
}: {
  activePhase: WorkspaceScriptPhase;
  scripts: WorkspaceScripts;
  initialScripts: WorkspaceScripts | null;
  onSelect: (phase: WorkspaceScriptPhase) => void;
}) {
  const t = useTranslations("Workspace.components.scriptDialog");

  return (
    <Tabs
      value={activePhase}
      onValueChange={(value) => {
        if (isWorkspaceScriptPhase(value)) onSelect(value);
      }}
      variant="pill"
      className="shrink-0"
    >
      <TabsList className="h-8 gap-0.5 p-0.5">
        {WORKSPACE_SCRIPT_PHASES.map((phase, index) => {
          const status = phaseStatus(scripts[phase], initialScripts?.[phase]);
          return (
            <TabsTrigger
              key={phase}
              value={phase}
              className="h-7 gap-1.5 px-3 text-xs"
            >
              <span
                data-script-phase={phase}
                data-script-phase-status={status}
                className="inline-flex items-center gap-1.5"
              >
                <span className="font-mono tabular-nums">{index + 1}</span>
                {t(`${phase}.title`)}
                {status === "edited" ? (
                  <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                ) : null}
              </span>
              <span className="sr-only">{t(`status.${status}`)}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

function EnvInsertBar({
  disabled,
  onInsert,
}: {
  disabled: boolean;
  onInsert: (token: string) => void;
}) {
  const t = useTranslations("Workspace.components.scriptDialog");

  return (
    <div className="mt-3 shrink-0">
      <p className="text-[11px] font-medium text-muted-foreground">{t("env.title")}</p>
      <TooltipProvider delayDuration={200}>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {WORKSPACE_SCRIPT_ENV_VARS.map((item) => (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-env-var={item.id}
                  disabled={disabled}
                  onClick={() => onInsert(item.token)}
                  className="h-7 cursor-pointer rounded-md border border-border bg-background px-2 font-mono text-[11px] text-foreground/80 hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  {item.token}
                </button>
              </TooltipTrigger>
              <TooltipContent>{t(`env.${item.id}`)}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
}

function TrustHint() {
  const t = useTranslations("Workspace.components.scriptDialog");

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={t("trustHint.label")}
          >
            <CircleHelp className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="max-w-xs text-pretty">
          {t("trustHint.tooltip")}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
