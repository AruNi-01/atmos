'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  cn,
  ParticleField,
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@workspace/ui';
import {
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FolderOpen,
  ArrowRight,
  Terminal as TerminalIcon,
  GitBranch,
  Github,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { AtmosWordmark } from '@/shared/components/ui/AtmosWordmark';
import { FileBrowser } from '@/features/files/components/FileBrowser';
import { useProjectStore } from '@/features/project/store/use-project-store';
import { wsProjectApi } from '@/api/ws-api';
import { systemApi } from '@/api/rest-api';
import { useSearchParams, usePathname } from 'next/navigation';
import { useAppRouter } from '@/shared/hooks/use-app-router';
import { InstallToolPopover } from '@/features/welcome/components/InstallToolPopover';
import { useDialogStore } from '@/app-shell/state/use-dialog-store';
import { useAtmosComputerStore } from '@/features/connection/lib/atmos-computer-store';
import {
  canUseNativeDirectoryPicker,
  pickLocalDirectory,
} from '@/shared/lib/desktop-directory-picker';

interface OnboardingPageProps {
  onComplete: () => void;
}

type Step = 'intro' | 'check' | 'project';

export default function OnboardingPage({ onComplete }: OnboardingPageProps) {
  const t = useTranslations('onboarding');
  const addProject = useProjectStore(s => s.addProject);
  const setSelectedProjectId = useDialogStore(s => s.setSelectedProjectId);
  const setPendingSidebarProjectId = useDialogStore(s => s.setPendingSidebarProjectId);

  const router = useAppRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const rawStep = searchParams.get('step');
  const currentStep: Step =
    rawStep === 'intro' || rawStep === 'check' || rawStep === 'project' ? rawStep : 'intro';

  const setCurrentStep = (step: Step) => {
    const params = new URLSearchParams(window.location.search);
    params.set('step', step);
    router.push(`${pathname}?${params.toString()}`);
  };

  // Step 2: Env check states
  const [tmuxData, setTmuxData] = useState<{ installed: boolean; version: string | null } | null>(null);
  const [gitData, setGitData] = useState<{ installed: boolean; version: string | null } | null>(null);
  const [ghData, setGhData] = useState<{ installed: boolean; version: string | null; username: string | null } | null>(null);
  const [envChecking, setEnvChecking] = useState(false);
  const [envCheckError, setEnvCheckError] = useState<string | null>(null);

  const runEnvChecks = async () => {
    setEnvChecking(true);
    setEnvCheckError(null);
    try {
      const [tmux, git, gh] = await Promise.all([
        systemApi.getTmuxStatus(),
        systemApi.getGitStatus(),
        systemApi.getGhCliStatus(),
      ]);
      setTmuxData({ installed: tmux.installed, version: tmux.version });
      setGitData({ installed: git.installed, version: git.version });
      setGhData({ installed: gh.installed, version: gh.version, username: gh.username ?? null });
    } catch (err) {
      console.error('Failed to run environment checks:', err);
      setTmuxData(null);
      setGitData(null);
      setGhData(null);
      setEnvCheckError(t('check.checkFailed'));
    } finally {
      setEnvChecking(false);
    }
  };

  useEffect(() => {
    if (currentStep === 'check') {
      void runEnvChecks();
    }
    // Intentionally only re-run when the step changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runEnvChecks closes over step-local setters
  }, [currentStep]);

  const isTmuxInstalled = tmuxData?.installed ?? false;
  const isGitInstalled = gitData?.installed ?? false;
  const isGhInstalled = ghData?.installed ?? false;
  const hasMissingDeps = !isTmuxInstalled || !isGitInstalled || !isGhInstalled;

  const handleRecheck = () => {
    void runEnvChecks();
  };

  // Step 3: Project import states
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isGitRepo, setIsGitRepo] = useState<boolean | null>(null);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [isPickingDirectory, setIsPickingDirectory] = useState(false);
  const pathValidationSeq = useRef(0);
  const connectionMode = useAtmosComputerStore((s) => s.connectionMode);
  // Native OS picker only when Desktop is talking to the local machine.
  // Relay / remote computers still need the in-app FileBrowser (WS FS API).
  const useNativePicker =
    canUseNativeDirectoryPicker() && connectionMode === 'local';

  // Validate path when it changes
  useEffect(() => {
    if (!path) {
      pathValidationSeq.current += 1;
      setIsValidating(false);
      setValidationError(null);
      setIsGitRepo(null);
      return;
    }

    // Invalidate previous result immediately so submit cannot use stale validation.
    const seq = ++pathValidationSeq.current;
    setIsValidating(true);
    setValidationError(null);
    setIsGitRepo(null);

    const timeoutId = setTimeout(async () => {
      try {
        const result = await wsProjectApi.validatePath(path);
        if (seq !== pathValidationSeq.current) return;
        if (result.is_valid) {
          if (result.suggested_name) {
            setName((current) => current || result.suggested_name || '');
          }
          setIsGitRepo(result.is_git_repo);
          if (!result.is_git_repo) {
            setValidationError(t('project.validation.notGitRepo'));
          }
        } else {
          setValidationError(result.error || t('project.validation.invalid'));
        }
      } catch (err) {
        if (seq !== pathValidationSeq.current) return;
        setValidationError(err instanceof Error ? err.message : t('project.validation.invalid'));
      } finally {
        if (seq === pathValidationSeq.current) {
          setIsValidating(false);
        }
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [path, t]);

  const applySelectedProjectPath = useCallback(
    (selectedPath: string, suggestedName?: string | null) => {
      // Invalidate any in-flight validation and let the path debounce effect
      // run wsProjectApi.validatePath for this exact directory.
      pathValidationSeq.current += 1;
      setPath(selectedPath);
      if (suggestedName) {
        setName(suggestedName);
      }
      setIsGitRepo(null);
      setIsValidating(true);
      setValidationError(null);
    },
    [],
  );

  const handleFileBrowserSelect = (
    selectedPath: string,
    _isRepo: boolean,
    suggestedName: string | null
  ) => {
    applySelectedProjectPath(selectedPath, suggestedName);
    setShowFileBrowser(false);
  };

  const handleBrowse = useCallback(async () => {
    if (useNativePicker) {
      setIsPickingDirectory(true);
      try {
        const selected = await pickLocalDirectory({
          defaultPath: path || undefined,
          title: t('project.fields.browse'),
        });
        if (selected) {
          applySelectedProjectPath(selected);
        }
      } finally {
        setIsPickingDirectory(false);
      }
      return;
    }
    setShowFileBrowser(true);
  }, [useNativePicker, path, t, applySelectedProjectPath]);

  const handleProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !path || isValidating || isGitRepo === null || (validationError && isGitRepo === null)) return;
    setIsSubmitting(true);
    try {
      const newProjectId = await addProject({
        name,
        mainFilePath: path,
      });
      // Welcome composer uses selectedProjectId; sidebar uses a one-shot pending id
      // so Add Workspace / ⌘N / GlobalSearch do not fight this selection.
      setSelectedProjectId(newProjectId);
      setPendingSidebarProjectId(newProjectId);
      // Import finishes onboarding — go straight to the home shell.
      onComplete();
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Failed to import project');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmitProject =
    Boolean(name && path) &&
    !isSubmitting &&
    !isValidating &&
    // Allow non-git directories (warning only); block until a validation result exists.
    isGitRepo !== null &&
    // Hard failures leave isGitRepo null; the not-git case sets isGitRepo=false with a warning.
    !(validationError && isGitRepo === null);

  const stepsList: { id: Step; label: string }[] = [
    { id: 'intro', label: t('steps.intro') },
    { id: 'check', label: t('steps.check') },
    { id: 'project', label: t('steps.project') },
  ];

  const imageSrc = '/figures/welcome.png';

  return (
    <div className="relative flex h-screen w-screen bg-background text-foreground select-none overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top_right,rgba(120,119,198,0.04),transparent_50%)]" />

      {/* Centered split: form + art hug the middle instead of stretching to the edges */}
      <div className="relative z-10 flex h-full w-full justify-center">
        <div className="flex h-full w-full max-w-6xl flex-col md:flex-row">
          {/* Left: form column — no scroll */}
          <div className="flex h-full min-h-0 w-full flex-col justify-center overflow-hidden px-8 py-12 md:w-[58%] md:px-10 md:py-20 md:pr-6 border-r border-border/10 bg-background/80 backdrop-blur-sm">
            <div className="w-full max-w-xl space-y-10 animate-in fade-in slide-in-from-left-4 duration-300 md:ml-auto">
            
            <div className="flex justify-start">
              <AtmosWordmark 
                layout="compact" 
                letterClassName="text-8xl md:text-[7rem] font-semibold tracking-tight" 
                logoClassName="size-24 md:size-28"
                sloganClassName="hidden"
              />
            </div>

            {/* Stepper displayed horizontally right above step content */}
            <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border/40 pb-4">
              {stepsList.map((step, idx) => {
                const isActive = currentStep === step.id;
                const isPast = stepsList.findIndex(s => s.id === currentStep) > idx;

                return (
                  <div key={step.id} className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex size-5 items-center justify-center rounded-full text-[10px] font-medium border transition-colors duration-300",
                        isActive
                          ? "border-foreground bg-foreground text-background"
                          : isPast
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-500"
                          : "border-muted-foreground/30 text-muted-foreground/50"
                      )}
                    >
                      {isPast ? '✓' : idx + 1}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] font-semibold uppercase tracking-wider transition-colors duration-300",
                        isActive ? "text-foreground" : "text-muted-foreground/40"
                      )}
                    >
                      {step.label}
                    </span>
                    {idx < stepsList.length - 1 && (
                      <span className="text-muted-foreground/20 text-xs ml-1 select-none">/</span>
                    )}
                  </div>
                );
              })}
            </nav>

            {/* Setup Step Content */}
            <div className="w-full">
              {/* STEP 1: INTRO */}
              {currentStep === 'intro' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-8">
                  <div className="space-y-3">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                      {t('intro.title')}
                    </h1>
                    <p className="text-muted-foreground text-xs leading-relaxed max-w-md">
                      {t('intro.subtitle')}
                    </p>
                  </div>

                  {/* Feature Columns */}
                  <div className="grid gap-6 py-2">
                    <div className="flex gap-4 items-start">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-foreground/5 border border-foreground/10 text-foreground shrink-0 mt-1">
                        <Sparkles className="size-5" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-foreground">{t('intro.features.agent')}</h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {t('intro.features.agentDesc')}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-4 items-start">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-foreground/5 border border-foreground/10 text-foreground shrink-0 mt-1">
                        <TerminalIcon className="size-5" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-foreground">{t('intro.features.tmux')}</h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {t('intro.features.tmuxDesc')}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-4 items-start">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-foreground/5 border border-foreground/10 text-foreground shrink-0 mt-1">
                        <GitBranch className="size-5" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-foreground">{t('intro.features.canvas')}</h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {t('intro.features.canvasDesc')}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button
                      onClick={() => setCurrentStep('check')}
                      className="rounded-full px-6 font-medium gap-2 group cursor-pointer"
                    >
                      {t('intro.next')}
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                    </Button>
                  </div>
                </div>
              )}

              {/* STEP 2: DEPENDENCY CHECK */}
              {currentStep === 'check' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-8">
                  <div className="space-y-3">
                    <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                      {t('check.title')}
                    </h2>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      {t('check.subtitle')}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <Card className="bg-muted/10 border-border/40 overflow-hidden">
                      <CardContent className="p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <TerminalIcon className="size-5 text-muted-foreground" />
                          <div>
                            <h4 className="text-xs font-semibold text-foreground">tmux</h4>
                            <p className="text-[10px] text-muted-foreground">{t('check.tmuxDesc')}</p>
                          </div>
                        </div>
                        {envChecking ? (
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        ) : isTmuxInstalled ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500">
                            <CheckCircle2 className="size-3.5" />
                            {t('check.statusInstalled')} {tmuxData?.version && `(${tmuxData.version})`}
                          </span>
                        ) : (
                          <InstallToolPopover toolId="tmux" toolName="tmux" onInstalled={handleRecheck} />
                        )}
                      </CardContent>
                    </Card>
 
                    <Card className="bg-muted/10 border-border/40 overflow-hidden">
                      <CardContent className="p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <GitBranch className="size-5 text-muted-foreground" />
                          <div>
                            <h4 className="text-xs font-semibold text-foreground">Git</h4>
                            <p className="text-[10px] text-muted-foreground">{t('check.gitDesc')}</p>
                          </div>
                        </div>
                        {envChecking ? (
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        ) : isGitInstalled ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500">
                            <CheckCircle2 className="size-3.5" />
                            {t('check.statusInstalled')} {gitData?.version && `(${gitData.version})`}
                          </span>
                        ) : (
                          <InstallToolPopover toolId="git" toolName="Git" onInstalled={handleRecheck} />
                        )}
                      </CardContent>
                    </Card>
 
                    <Card className="bg-muted/10 border-border/40 overflow-hidden">
                      <CardContent className="p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <Github className="size-5 text-muted-foreground" />
                          <div>
                            <h4 className="text-xs font-semibold text-foreground">GitHub CLI (gh)</h4>
                            <p className="text-[10px] text-muted-foreground">{t('check.ghDesc')}</p>
                          </div>
                        </div>
                        {envChecking ? (
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        ) : isGhInstalled ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500">
                            <CheckCircle2 className="size-3.5" />
                            {t('check.statusInstalled')} {ghData?.username && `(@${ghData.username})`}
                          </span>
                        ) : (
                          <InstallToolPopover toolId="gh" toolName="GitHub CLI (gh)" onInstalled={handleRecheck} />
                        )}
                      </CardContent>
                    </Card>
                  </div>
                  {envCheckError && (
                    <p className="text-xs text-amber-500 flex items-center gap-1.5">
                      <AlertCircle className="size-3.5" />
                      {envCheckError}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <Button
                      onClick={() => setCurrentStep('project')}
                      className="rounded-full px-6 font-medium cursor-pointer"
                      disabled={envChecking || hasMissingDeps}
                    >
                      {t('check.next')}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleRecheck}
                      disabled={envChecking}
                      className="rounded-full px-6 font-medium gap-2 border-border/40 hover:bg-muted/20 cursor-pointer"
                    >
                      <RefreshCw className={cn("size-3.5", envChecking && "animate-spin")} />
                      {t('check.recheck')}
                    </Button>
                    {hasMissingDeps && !envChecking ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            className="rounded-full px-4 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            {t('check.skip')}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-72 space-y-3 p-4 border border-border bg-popover text-popover-foreground rounded-2xl shadow-xl"
                        >
                          <div className="space-y-1.5">
                            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                              <AlertCircle className="size-3.5 text-amber-500 shrink-0" />
                              {t('check.skipWarning.title')}
                            </p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {t('check.skipWarning.description')}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setCurrentStep('project')}
                            className="w-full rounded-full text-xs cursor-pointer"
                          >
                            {t('check.skipWarning.confirm')}
                          </Button>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <Button
                        variant="ghost"
                        onClick={() => setCurrentStep('project')}
                        disabled={envChecking}
                        className="rounded-full px-4 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        {t('check.skip')}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 3: FIRST PROJECT */}
              {currentStep === 'project' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-8">
                  <div className="space-y-3">
                    <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                      {t('project.title')}
                    </h2>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      {t('project.subtitle')}
                    </p>
                  </div>

                  <form onSubmit={handleProjectSubmit} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="path" className="text-xs font-semibold text-foreground">
                        {t('project.fields.path')}
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="path"
                          value={path}
                          onChange={(e) => setPath(e.target.value)}
                          placeholder={t('project.fields.pathPlaceholder')}
                          className="font-mono text-xs border-border/40 bg-muted/10 focus-visible:ring-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleBrowse()}
                          disabled={isPickingDirectory}
                          className="gap-1 border-border/40 hover:bg-muted/20 cursor-pointer shrink-0"
                        >
                          <FolderOpen className="size-4" />
                          <span className="hidden sm:inline">{t('project.fields.browse')}</span>
                        </Button>
                      </div>

                      {isValidating && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <Loader2 className="size-3 animate-spin" />
                          {t('project.validation.validating')}
                        </p>
                      )}

                      {isGitRepo !== null && !validationError && (
                        <p className="text-[10px] text-emerald-500 flex items-center gap-1.5">
                          <CheckCircle2 className="size-3" />
                          {t('project.validation.gitRepo')}
                        </p>
                      )}

                      {validationError && (
                        <p className="text-[10px] text-amber-500 flex items-center gap-1.5">
                          <AlertCircle className="size-3" />
                          {validationError}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-xs font-semibold text-foreground">
                        {t('project.fields.name')}
                      </Label>
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t('project.fields.namePlaceholder')}
                        className="border-border/40 bg-muted/10 focus-visible:ring-1"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <Button
                        type="submit"
                        disabled={!canSubmitProject}
                        className="rounded-full px-6 font-medium cursor-pointer"
                      >
                        {isSubmitting ? (
                          <Loader2 className="size-4 animate-spin mr-2" />
                        ) : null}
                        {t('project.submit')}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={onComplete}
                        className="rounded-full px-4 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        {t('project.next')}
                      </Button>
                    </div>
                  </form>

                  {!useNativePicker ? (
                    <FileBrowser
                      open={showFileBrowser}
                      onOpenChange={setShowFileBrowser}
                      onSelect={handleFileBrowserSelect}
                      title={t('project.fields.browse')}
                      selectLabel={t('project.submit')}
                      dirsOnly={true}
                    />
                  ) : null}
                </div>
              )}
            </div>

          </div>
        </div>

          {/* Right: particle art — sits next to the form inside the centered cluster */}
          <div className="relative hidden h-full w-[42%] md:flex items-center justify-center bg-[#09090b] overflow-hidden animate-in fade-in slide-in-from-right-4 duration-500">
            <ParticleField
              src={imageSrc}
              sampleStep={3}
              threshold={34}
              dotSize={1}
              renderScale={1.1}
              align="bottom"
              className="w-full h-full"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(900px 600px at 55% 50%, transparent 40%, color-mix(in srgb, var(--background) 88%, transparent) 92%)",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
