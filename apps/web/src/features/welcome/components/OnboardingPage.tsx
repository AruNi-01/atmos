'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  Input,
  Label,
  cn,
  ParticleField,
  TabsSubtle,
  TabsSubtleItem,
} from '@workspace/ui';
import {
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  FolderGit2,
  Terminal as TerminalIcon,
  GitBranch,
  Github,
  Sparkles,
  Loader2,
  Bot,
  PlaneLanding,
  type LucideIcon,
} from 'lucide-react';
import { AtmosWordmark } from '@/shared/components/ui/AtmosWordmark';
import { FileBrowser } from '@/features/files/components/FileBrowser';
import { useProjectStore } from '@/features/project/store/use-project-store';
import {
  codeAgentCustomApi,
  functionSettingsApi,
  wsProjectApi,
} from '@/api/ws-api';
import {
  systemApi,
  type TerminalAgentCliStatusItem,
} from '@/api/rest-api';
import { useSearchParams, usePathname } from 'next/navigation';
import { useAppRouter } from '@/shared/hooks/use-app-router';
import { InstallToolPopover } from '@/features/welcome/components/InstallToolPopover';
import {
  OnboardingStepActions,
  type OnboardingStepId,
} from '@/features/welcome/components/OnboardingStepActions';
import { useDialogStore } from '@/app-shell/state/use-dialog-store';
import { useAtmosComputerStore } from '@/features/connection/lib/atmos-computer-store';
import {
  canUseNativeDirectoryPicker,
  pickLocalDirectory,
} from '@/shared/lib/desktop-directory-picker';
import { AgentIcon } from '@/features/agent/components/AgentIcon';
import { AGENT_OPTIONS } from '@/features/wiki/components/AgentSelect';
import {
  buildBuiltInEntries,
  isBuiltInAgentId,
} from '@/features/settings/components/settings/settings-modal-utils';
import { applyQuotaProvidersForAgents } from '@/features/quota-usage/lib/apply-quota-providers-for-agents';
import {
  DEFAULT_AGENT_YOLO_MODE,
  setAgentYoloMode,
} from '@/features/agent/lib/terminal-agent-yolo';

interface OnboardingPageProps {
  onComplete: () => void;
}

type Step = OnboardingStepId;

const PROJECT_FORM_ID = 'onboarding-project-form';

const STEP_ICONS: Record<Step, LucideIcon> = {
  intro: PlaneLanding,
  check: TerminalIcon,
  agents: Bot,
  project: FolderGit2,
};

const PREFERRED_DEFAULT_AGENT_IDS = [
  'claude',
  'codex',
  'cursor',
  'gemini',
  'grok-build',
  'opencode',
  'antigravity',
] as const;

function pickDefaultAgentId(candidateIds: string[]): string | null {
  for (const preferred of PREFERRED_DEFAULT_AGENT_IDS) {
    if (candidateIds.includes(preferred)) return preferred;
  }
  return candidateIds[0] ?? null;
}

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
    rawStep === 'intro' || rawStep === 'check' || rawStep === 'agents' || rawStep === 'project'
      ? rawStep
      : 'intro';

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

  // Step 3: Built-in agent detection
  const [agentStatuses, setAgentStatuses] = useState<TerminalAgentCliStatusItem[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(() => new Set());
  const [defaultAgentId, setDefaultAgentId] = useState<string | null>(null);
  const [agentsChecking, setAgentsChecking] = useState(false);
  const [agentsCheckError, setAgentsCheckError] = useState<string | null>(null);
  const [agentsSaving, setAgentsSaving] = useState(false);
  const [agentsSaveError, setAgentsSaveError] = useState<string | null>(null);
  /** Default-on: agents launch with skip-permissions / YOLO flags. */
  const [yoloMode, setYoloMode] = useState(DEFAULT_AGENT_YOLO_MODE);
  const agentsSelectionInitializedRef = useRef(false);

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

  const applyAgentDetectionDefaults = useCallback((agents: TerminalAgentCliStatusItem[]) => {
    const installedIds = agents.filter((agent) => agent.installed).map((agent) => agent.agent_id);
    setSelectedAgentIds(new Set(installedIds));
    setDefaultAgentId(pickDefaultAgentId(installedIds));
    agentsSelectionInitializedRef.current = true;
  }, []);

  const runAgentChecks = useCallback(async (options?: { resetSelection?: boolean }) => {
    const resetSelection = options?.resetSelection ?? false;
    setAgentsChecking(true);
    setAgentsCheckError(null);
    try {
      const result = await systemApi.getTerminalAgentsStatus();
      const agents = Array.isArray(result.agents) ? result.agents : [];
      setAgentStatuses(agents);
      if (resetSelection || !agentsSelectionInitializedRef.current) {
        applyAgentDetectionDefaults(agents);
      }
    } catch (err) {
      console.error('Failed to detect terminal agents:', err);
      setAgentStatuses([]);
      setAgentsCheckError(t('agents.checkFailed'));
    } finally {
      setAgentsChecking(false);
    }
  }, [applyAgentDetectionDefaults, t]);

  useEffect(() => {
    if (currentStep === 'agents') {
      void runAgentChecks({ resetSelection: !agentsSelectionInitializedRef.current });
    }
    // Intentionally only re-run when the step changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runAgentChecks closes over step-local state
  }, [currentStep]);

  const toggleAgentSelected = useCallback((agentId: string, nextChecked: boolean) => {
    setSelectedAgentIds((prev) => {
      const next = new Set(prev);
      if (nextChecked) {
        next.add(agentId);
      } else {
        next.delete(agentId);
      }
      return next;
    });
    setDefaultAgentId((prev) => {
      if (nextChecked) {
        return prev ?? agentId;
      }
      if (prev !== agentId) return prev;
      return null;
    });
  }, []);

  // Keep default inside the selected set once selection settles.
  useEffect(() => {
    if (selectedAgentIds.size === 0) {
      if (defaultAgentId !== null) setDefaultAgentId(null);
      return;
    }
    if (defaultAgentId && selectedAgentIds.has(defaultAgentId)) return;
    const installedSelected = agentStatuses
      .filter((agent) => agent.installed && selectedAgentIds.has(agent.agent_id))
      .map((agent) => agent.agent_id);
    const selected = Array.from(selectedAgentIds);
    setDefaultAgentId(pickDefaultAgentId(installedSelected.length > 0 ? installedSelected : selected));
  }, [agentStatuses, defaultAgentId, selectedAgentIds]);

  const persistAgentPreferences = useCallback(async () => {
    const customData = await codeAgentCustomApi.get();
    const allAgents = Array.isArray(customData?.agents) ? customData.agents : [];
    const customOnly = allAgents.filter((agent) => !isBuiltInAgentId(agent.id));
    const existingBuiltIn = new Map(
      allAgents
        .filter((agent) => isBuiltInAgentId(agent.id))
        .map((agent) => [agent.id, agent] as const),
    );

    const overrides: Record<
      string,
      { cmd?: string; flags?: string; interactiveFlags?: string; enabled?: boolean }
    > = {};
    for (const agent of AGENT_OPTIONS) {
      const existing = existingBuiltIn.get(agent.id);
      const draft: {
        cmd?: string;
        flags?: string;
        interactiveFlags?: string;
        enabled?: boolean;
      } = {
        enabled: selectedAgentIds.has(agent.id),
      };
      if (existing?.cmd && existing.cmd !== agent.cmd) {
        draft.cmd = existing.cmd;
      }
      if (existing?.flags !== undefined && existing.flags !== (agent.params || '')) {
        draft.flags = existing.flags;
      }
      if (
        existing?.interactiveFlags !== undefined &&
        existing.interactiveFlags !== (agent.interactiveParams || '')
      ) {
        draft.interactiveFlags = existing.interactiveFlags;
      }
      overrides[agent.id] = draft;
    }

    await codeAgentCustomApi.update([
      ...customOnly,
      ...buildBuiltInEntries(overrides),
    ]);

    if (defaultAgentId && selectedAgentIds.has(defaultAgentId)) {
      await functionSettingsApi.update(
        'agent_cli',
        'center_fix_terminal_default_agent',
        defaultAgentId,
      );
    }

    await setAgentYoloMode(yoloMode);

    // AI Quota Usage: only track providers for agents the user enabled;
    // turn footer carousel on for those providers (and the footer master switch).
    await applyQuotaProvidersForAgents(selectedAgentIds);
  }, [defaultAgentId, selectedAgentIds, yoloMode]);

  const handleAgentsContinue = useCallback(async () => {
    setAgentsSaving(true);
    setAgentsSaveError(null);
    try {
      // Only persist when detection succeeded; avoid disabling every agent on a failed probe.
      if (agentStatuses.length > 0) {
        await persistAgentPreferences();
      }
      setCurrentStep('project');
    } catch (err) {
      console.error('Failed to save agent preferences:', err);
      setAgentsSaveError(t('agents.saveFailed'));
    } finally {
      setAgentsSaving(false);
    }
  }, [agentStatuses.length, persistAgentPreferences, t]);

  // Step 4: Project import states
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
    { id: 'agents', label: t('steps.agents') },
    { id: 'project', label: t('steps.project') },
  ];
  const selectedStepIndex = Math.max(
    0,
    stepsList.findIndex((step) => step.id === currentStep),
  );
  const installedAgentCount = agentStatuses.filter((agent) => agent.installed).length;
  const selectedAgentCount = selectedAgentIds.size;

  const imageSrc = '/figures/welcome.png';

  return (
    <div className="relative flex h-screen w-screen bg-background text-foreground select-none overflow-hidden">
      {/* Background decoration — same token as shell so gutters never look like a second surface */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top_right,rgba(120,119,198,0.04),transparent_50%)]" />

      {/* Full-viewport split: form | art (shared bg-background, no inset color slab) */}
      <div className="relative z-10 flex h-full w-full flex-col md:flex-row">
          {/* Left: page never scrolls; middle content may. Actions follow content (sticky max bottom). */}
          <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background border-r border-border/10 px-8 pt-12 pb-6 md:w-[58%] md:px-10 md:pt-16 md:pb-8 md:pr-8">
            <div className="mx-auto flex h-full min-h-0 w-full max-w-xl flex-col animate-in fade-in slide-in-from-left-4 duration-300 md:ml-auto md:mr-2">
              {/* Top block sits a bit lower; stays fixed while middle scrolls */}
              <div className="shrink-0 space-y-8 pb-2">
                <div className="flex justify-start pt-2 md:pt-4">
                  <AtmosWordmark
                    layout="compact"
                    letterClassName="text-8xl md:text-[7rem] font-semibold tracking-tight"
                    logoClassName="size-24 md:size-28"
                    sloganClassName="hidden"
                  />
                </div>

                {/* Fluid Functionalism TabsSubtle · Active Label — free step navigation */}
                <div className="w-full border-b border-border/40 pb-4">
                  <TabsSubtle
                    idPrefix="onboarding"
                    activeLabel
                    selectedIndex={selectedStepIndex}
                    onSelect={(index) => {
                      const step = stepsList[index];
                      if (step) setCurrentStep(step.id);
                    }}
                  >
                    {stepsList.map((step, index) => (
                      <TabsSubtleItem
                        key={step.id}
                        index={index}
                        label={step.label}
                        icon={STEP_ICONS[step.id]}
                      />
                    ))}
                  </TabsSubtle>
                </div>
              </div>

              {/* Scroll region: content + actions. Short pages keep actions under content;
                  long pages pin actions to the scrollport bottom (max bottom limit). */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                  <div className="py-6">
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
                </div>
              )}

              {/* STEP 3: BUILT-IN AGENTS */}
              {currentStep === 'agents' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
                  <div className="space-y-3">
                    <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                      {t('agents.title')}
                    </h2>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      {t('agents.subtitle')}
                    </p>
                    {!agentsChecking && !agentsCheckError && agentStatuses.length > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                        <p className="text-[11px] text-muted-foreground">
                          {t('agents.summary', {
                            installed: installedAgentCount,
                            selected: selectedAgentCount,
                            total: agentStatuses.length,
                          })}
                        </p>
                        <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-foreground">
                          <Checkbox
                            checked={yoloMode}
                            onCheckedChange={(checked) => setYoloMode(checked === true)}
                            aria-label={t('agents.yoloAria')}
                          />
                          <span className="font-medium">{t('agents.yoloLabel')}</span>
                        </label>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pr-1">
                    {agentsChecking && agentStatuses.length === 0 ? (
                      <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-muted/10 px-4 py-6 text-xs text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        {t('agents.detecting')}
                      </div>
                    ) : (
                      agentStatuses.map((agent) => {
                        const selected = selectedAgentIds.has(agent.agent_id);
                        const isDefault = defaultAgentId === agent.agent_id;
                        const canSetDefault = selected && !isDefault;
                        return (
                          <Card
                            key={agent.agent_id}
                            className={cn(
                              // Always reserve the same border width so checked state only recolors.
                              'group/agent overflow-hidden border bg-muted/10 transition-colors',
                              selected
                                ? 'border-foreground/20 bg-muted/20'
                                : 'border-border/40',
                            )}
                          >
                            <CardContent className="flex h-14 items-center gap-3 p-3">
                              <Checkbox
                                checked={selected}
                                onCheckedChange={(checked) =>
                                  toggleAgentSelected(agent.agent_id, checked === true)
                                }
                                aria-label={t('agents.selectAria', { name: agent.label })}
                                className="size-4 shrink-0"
                              />
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <span className="shrink-0">
                                  <AgentIcon
                                    registryId={agent.agent_id}
                                    name={agent.label}
                                    size={20}
                                  />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex h-5 items-center gap-2">
                                    <h4 className="truncate text-xs font-semibold text-foreground">
                                      {agent.label}
                                    </h4>
                                    {isDefault ? (
                                      <Badge
                                        variant="secondary"
                                        className="h-5 shrink-0 px-1.5 text-[10px] font-semibold"
                                      >
                                        {t('agents.defaultBadge')}
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <p className="mt-0.5 truncate font-mono text-[10px] leading-4 text-muted-foreground">
                                    {agent.cmd}
                                  </p>
                                </div>
                              </div>
                              {/* Fixed-size action slot: status crossfades to Set Default on hover */}
                              <div className="relative h-8 w-[7.5rem] shrink-0">
                                <div
                                  className={cn(
                                    'absolute inset-0 flex items-center justify-end transition-[opacity,transform] duration-150 ease-out',
                                    canSetDefault &&
                                      'group-hover/agent:pointer-events-none group-hover/agent:scale-95 group-hover/agent:opacity-0',
                                  )}
                                >
                                  <span
                                    className={cn(
                                      'inline-flex items-center gap-1 text-[11px] whitespace-nowrap',
                                      agent.installed
                                        ? 'font-semibold text-emerald-500'
                                        : 'font-medium text-muted-foreground/70',
                                    )}
                                  >
                                    {agent.installed ? (
                                      <CheckCircle2 className="size-3.5 shrink-0" />
                                    ) : (
                                      <Bot className="size-3.5 shrink-0" />
                                    )}
                                    {agent.installed
                                      ? t('agents.statusInstalled')
                                      : t('agents.statusMissing')}
                                  </span>
                                </div>
                                {canSetDefault ? (
                                  <div className="absolute inset-0 flex items-center justify-end pointer-events-none scale-95 opacity-0 transition-[opacity,transform] duration-150 ease-out group-hover/agent:pointer-events-auto group-hover/agent:scale-100 group-hover/agent:opacity-100">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      className="h-8 rounded-full border-0 px-2.5 text-[11px] cursor-pointer shadow-none"
                                      onClick={() => setDefaultAgentId(agent.agent_id)}
                                    >
                                      {t('agents.setDefault')}
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })
                    )}
                  </div>

                  {agentsCheckError && (
                    <p className="flex items-center gap-1.5 text-xs text-amber-500">
                      <AlertCircle className="size-3.5" />
                      {agentsCheckError}
                    </p>
                  )}
                  {agentsSaveError && (
                    <p className="flex items-center gap-1.5 text-xs text-amber-500">
                      <AlertCircle className="size-3.5" />
                      {agentsSaveError}
                    </p>
                  )}
                  {!agentsChecking &&
                    !agentsCheckError &&
                    agentStatuses.length > 0 &&
                    installedAgentCount === 0 && (
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        {t('agents.noneInstalledHint')}
                      </p>
                    )}
                </div>
              )}

              {/* STEP 4: FIRST PROJECT */}
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

                  <form
                    id={PROJECT_FORM_ID}
                    onSubmit={handleProjectSubmit}
                    className="space-y-5"
                  >
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
                          className="h-9 sm:h-9 gap-1 border-border/40 hover:bg-muted/20 cursor-pointer shrink-0"
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

                  {/* Sticky max-bottom: sits under short content; pins to scrollport bottom on long pages */}
                  <div className="sticky bottom-0 z-10 mt-2 bg-background/95 pt-4 pb-2 backdrop-blur-sm supports-[backdrop-filter]:bg-background/85">
                    <OnboardingStepActions
                      step={currentStep}
                      onGoToStep={setCurrentStep}
                      onComplete={onComplete}
                      envChecking={envChecking}
                      hasMissingDeps={hasMissingDeps}
                      onRecheckEnv={handleRecheck}
                      agentsChecking={agentsChecking}
                      agentsSaving={agentsSaving}
                      onAgentsContinue={() => void handleAgentsContinue()}
                      onRecheckAgents={() => void runAgentChecks({ resetSelection: false })}
                      canSubmitProject={canSubmitProject}
                      isSubmitting={isSubmitting}
                      projectFormId={PROJECT_FORM_ID}
                    />
                  </div>
              </div>
            </div>
          </div>

          {/* Right: particle art — fills remaining viewport, same bg-background as shell */}
          <div className="relative hidden h-full min-w-0 flex-1 md:flex items-center justify-center overflow-hidden bg-background animate-in fade-in slide-in-from-right-4 duration-500">
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
  );
}
