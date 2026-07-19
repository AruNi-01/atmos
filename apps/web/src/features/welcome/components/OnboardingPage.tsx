'use client';

import React, { useState, useEffect } from 'react';
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@workspace/ui';
import {
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  FolderOpen,
  ArrowRight,
  Terminal as TerminalIcon,
  GitBranch,
  Github,
  Sparkles,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { AtmosWordmark } from '@/shared/components/ui/AtmosWordmark';
import { FileBrowser } from '@/features/files/components/FileBrowser';
import { useProjectStore } from '@/features/project/store/use-project-store';
import { wsProjectApi } from '@/api/ws-api';
import { systemApi } from '@/api/rest-api';
import { useSearchParams, usePathname } from 'next/navigation';
import { useAppRouter } from '@/shared/hooks/use-app-router';


type OS = 'macos' | 'linux' | 'windows';

interface InstallMethod {
  label: string;
  command?: string;
  notes?: string;
  link?: string;
}

const INSTALL_GUIDES: Record<string, Record<OS, InstallMethod[]>> = {
  tmux: {
    macos: [
      { label: 'Homebrew', command: 'brew install tmux' },
      { label: 'MacPorts', command: 'port install tmux' },
    ],
    linux: [
      { label: 'APT (Ubuntu/Debian)', command: 'sudo apt update && sudo apt install -y tmux' },
      { label: 'DNF (Fedora/RHEL)', command: 'sudo dnf install -y tmux' },
      { label: 'Pacman (Arch)', command: 'sudo pacman -S --noconfirm tmux' },
    ],
    windows: [
      { label: 'WSL', notes: 'tmux is not natively supported on Windows. Please install WSL (Windows Subsystem for Linux) first, then run:', command: 'sudo apt install tmux' },
    ],
  },
  git: {
    macos: [
      { label: 'Homebrew', command: 'brew install git' },
      { label: 'Xcode Tools', command: 'xcode-select --install' },
    ],
    linux: [
      { label: 'APT (Ubuntu/Debian)', command: 'sudo apt update && sudo apt install -y git' },
      { label: 'DNF (Fedora/RHEL)', command: 'sudo dnf install -y git' },
      { label: 'Pacman (Arch)', command: 'sudo pacman -S --noconfirm git' },
    ],
    windows: [
      { label: 'Winget', command: 'winget install --id Git.Git -e --source winget' },
      { label: 'Chocolatey', command: 'choco install git' },
      { label: 'Installer', link: 'https://git-scm.com/download/win', notes: 'Or download the official standalone Git installer.' },
    ],
  },
  gh: {
    macos: [
      { label: 'Homebrew', command: 'brew install gh' },
      { label: 'MacPorts', command: 'port install gh' },
    ],
    linux: [
      {
        label: 'APT (Ubuntu/Debian)',
        command: 'sudo mkdir -p -m 755 /etc/apt/keyrings \\\n&& wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \\\n&& sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \\\n&& echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \\\n&& sudo apt update \\\n&& sudo apt install -y gh',
      },
      {
        label: 'DNF (Fedora/RHEL)',
        command: 'sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo \\\n&& sudo dnf install -y gh',
      },
      { label: 'Pacman (Arch)', command: 'sudo pacman -S --noconfirm github-cli' },
    ],
    windows: [
      { label: 'Winget', command: 'winget install --id GitHub.cli' },
      { label: 'Chocolatey', command: 'choco install gh' },
      { label: 'Installer', link: 'https://github.com/cli/cli/releases', notes: 'Or download the latest standalone installer.' },
    ],
  },
};

interface InstallPopoverProps {
  toolId: 'tmux' | 'git' | 'gh';
  toolName: string;
}

function InstallPopover({ toolId, toolName }: InstallPopoverProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const guides = INSTALL_GUIDES[toolId];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full px-3 py-1 text-[11px] font-semibold h-7 border-border/40 hover:bg-muted/20 text-foreground cursor-pointer"
        >
          Install
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[420px] p-5 border border-border bg-popover text-popover-foreground rounded-2xl shadow-xl z-50">
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Install {toolName}</h4>
            <p className="text-xs text-muted-foreground mt-1">Select your operating system and preferred installation method.</p>
          </div>

          <Tabs defaultValue="macos" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-muted/40 p-1 rounded-xl">
              <TabsTrigger value="macos" className="rounded-lg text-xs py-1.5 cursor-pointer">macOS</TabsTrigger>
              <TabsTrigger value="linux" className="rounded-lg text-xs py-1.5 cursor-pointer">Linux</TabsTrigger>
              <TabsTrigger value="windows" className="rounded-lg text-xs py-1.5 cursor-pointer">Windows</TabsTrigger>
            </TabsList>

            {(['macos', 'linux', 'windows'] as OS[]).map((os) => {
              const methods = guides[os];
              return (
                <TabsContent key={os} value={os} className="mt-4 space-y-4">
                  {methods.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No instructions available.</p>
                  ) : (
                    <Tabs defaultValue={methods[0].label} className="w-full">
                      {methods.length > 1 && (
                        <TabsList className="flex flex-wrap gap-1 bg-transparent p-0 border-b border-border/40 pb-2 mb-3">
                          {methods.map((m) => (
                            <TabsTrigger
                              key={m.label}
                              value={m.label}
                              className="text-[11px] px-2.5 py-1 rounded-md border border-transparent data-[state=active]:bg-muted/40 data-[state=active]:border-border/40 cursor-pointer"
                            >
                              {m.label}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                      )}

                      {methods.map((m, idx) => (
                        <TabsContent key={m.label} value={m.label} className="space-y-3 outline-none">
                          {m.notes && (
                            <p className="text-xs text-muted-foreground leading-relaxed">{m.notes}</p>
                          )}
                          {m.command && (
                            <div className="relative group">
                              <pre className="text-[11px] font-mono bg-muted/40 p-3 pr-10 rounded-xl border border-border/40 overflow-x-auto leading-relaxed text-foreground max-h-[160px] whitespace-pre-wrap break-all">
                                {m.command}
                              </pre>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="absolute right-2 top-2 h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer rounded-lg"
                                onClick={() => handleCopy(m.command!, `${os}-${idx}`)}
                              >
                                {copiedId === `${os}-${idx}` ? (
                                  <Check className="size-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="size-3.5" />
                                )}
                              </Button>
                            </div>
                          )}
                          {m.link && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full text-xs font-medium cursor-pointer rounded-xl"
                              onClick={() => window.open(m.link, '_blank')}
                            >
                              <ExternalLink className="mr-2 size-3.5" />
                              Official Download Page
                            </Button>
                          )}
                        </TabsContent>
                      ))}
                    </Tabs>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface OnboardingPageProps {
  onComplete: () => void;
}

type Step = 'intro' | 'check' | 'project' | 'ready';

export default function OnboardingPage({ onComplete }: OnboardingPageProps) {
  const t = useTranslations('onboarding');
  const addProject = useProjectStore(s => s.addProject);

  const router = useAppRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const rawStep = searchParams.get('step');
  const currentStep: Step = (rawStep === 'intro' || rawStep === 'check' || rawStep === 'project' || rawStep === 'ready') ? rawStep : 'intro';

  const setCurrentStep = (step: Step) => {
    const params = new URLSearchParams(window.location.search);
    params.set('step', step);
    router.push(`${pathname}?${params.toString()}`);
  };

  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Step 2: Env check states
  const [tmuxData, setTmuxData] = useState<{ installed: boolean; version: string | null } | null>(null);
  const [gitData, setGitData] = useState<{ installed: boolean; version: string | null } | null>(null);
  const [ghData, setGhData] = useState<{ installed: boolean; version: string | null; username: string | null } | null>(null);
  const [envChecking, setEnvChecking] = useState(false);

  const runEnvChecks = async () => {
    setEnvChecking(true);
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
    } finally {
      setEnvChecking(false);
    }
  };

  useEffect(() => {
    if (currentStep === 'check') {
      runEnvChecks();
    }
  }, [currentStep]);

  const isTmuxInstalled = tmuxData?.installed ?? false;
  const isGitInstalled = gitData?.installed ?? false;
  const isGhInstalled = ghData?.installed ?? false;

  const handleRecheck = () => {
    runEnvChecks();
  };

  // Step 3: Project import states
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isGitRepo, setIsGitRepo] = useState<boolean | null>(null);
  const [showFileBrowser, setShowFileBrowser] = useState(false);

  // Validate path when it changes
  useEffect(() => {
    if (path) {
      const timeoutId = setTimeout(() => {
        handleValidatePath();
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [path]);

  const handleValidatePath = async () => {
    if (!path) return;
    setIsValidating(true);
    setValidationError(null);
    setIsGitRepo(null);

    try {
      const result = await wsProjectApi.validatePath(path);
      if (result.is_valid) {
        if (result.suggested_name && !name) {
          setName(result.suggested_name);
        }
        setIsGitRepo(result.is_git_repo);
        if (!result.is_git_repo) {
          setValidationError(t('project.validation.notGitRepo'));
        }
      } else {
        setValidationError(result.error || t('project.validation.invalid'));
      }
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : t('project.validation.invalid'));
    } finally {
      setIsValidating(false);
    }
  };

  const handleFileBrowserSelect = (
    selectedPath: string,
    isRepo: boolean,
    suggestedName: string | null
  ) => {
    setPath(selectedPath);
    if (suggestedName) {
      setName(suggestedName);
    }
    setIsGitRepo(isRepo);
    setShowFileBrowser(false);
  };

  const handleProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !path) return;
    setIsSubmitting(true);
    try {
      await addProject({
        name,
        mainFilePath: path,
      });
      setCurrentStep('ready');
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Failed to import project');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedText(cmd);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const stepsList: { id: Step; label: string }[] = [
    { id: 'intro', label: t('steps.intro') },
    { id: 'check', label: t('steps.check') },
    { id: 'project', label: t('steps.project') },
    { id: 'ready', label: t('steps.ready') },
  ];

  const imageSrc = '/figures/welcome.png';

  return (
    <div className="relative flex h-screen w-screen bg-background text-foreground select-none overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top_right,rgba(120,119,198,0.04),transparent_50%)]" />

      {/* Split container: full width/height split-screen */}
      <div className="relative z-10 flex h-full w-full flex-col md:flex-row">
        
        {/* Left Side: Form content, occupies 55% width on desktop, scrollable, vertically centered */}
        <div className="flex h-full w-full flex-col justify-center overflow-y-auto px-8 py-12 md:w-[55%] md:px-16 md:py-20 border-r border-border/10 bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-xl mx-auto space-y-10 animate-in fade-in slide-in-from-left-4 duration-300">
            
            {/* AtmosWordmark styled significantly larger */}
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
                          <InstallPopover toolId="tmux" toolName="tmux" />
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
                          <InstallPopover toolId="git" toolName="Git" />
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
                          <InstallPopover toolId="gh" toolName="GitHub CLI (gh)" />
                        )}
                      </CardContent>
                    </Card>
                  </div>
                   {!envChecking && (!isTmuxInstalled || !isGitInstalled || !isGhInstalled) && (
                    <div className="space-y-3 bg-muted/10 border border-border/40 p-4 rounded-xl">
                      <h4 className="text-xs font-semibold text-foreground flex items-center gap-2">
                        <AlertCircle className="size-4 text-amber-500" />
                        {t('check.actionInstall')}
                      </h4>
                      <div className="relative">
                        <pre className="text-xs font-mono bg-muted/40 p-3 rounded-lg border border-border/40 pr-12 text-muted-foreground overflow-x-auto">
                          brew install tmux git gh
                        </pre>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleCopyCommand('brew install tmux git gh')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 size-8 text-muted-foreground/60 hover:text-foreground cursor-pointer"
                        >
                          {copiedText === 'brew install tmux git gh' ? (
                            <Check className="size-4 text-emerald-500" />
                          ) : (
                            <Copy className="size-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <Button
                      onClick={() => setCurrentStep('project')}
                      className="rounded-full px-6 font-medium cursor-pointer"
                      disabled={envChecking}
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
                    <Button
                      variant="ghost"
                      onClick={() => setCurrentStep('project')}
                      className="rounded-full px-4 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {t('check.skip')}
                    </Button>
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
                          onClick={() => setShowFileBrowser(true)}
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
                        disabled={isSubmitting || !name || !path || Boolean(validationError && isGitRepo === null)}
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
                        onClick={() => setCurrentStep('ready')}
                        className="rounded-full px-4 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        {t('project.next')}
                      </Button>
                    </div>
                  </form>

                  <FileBrowser
                    open={showFileBrowser}
                    onOpenChange={setShowFileBrowser}
                    onSelect={handleFileBrowserSelect}
                    title={t('project.fields.browse')}
                    selectLabel={t('project.submit')}
                    dirsOnly={true}
                  />
                </div>
              )}

              {/* STEP 4: READY */}
              {currentStep === 'ready' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-8 text-left">
                  <div className="flex justify-start">
                    <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                      <CheckCircle2 className="size-8" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                      {t('ready.title')}
                    </h2>
                    <p className="text-muted-foreground text-xs leading-relaxed max-w-md">
                      {t('ready.subtitle')}
                    </p>
                  </div>

                  <div className="pt-2">
                    <Button
                      onClick={onComplete}
                      className="rounded-full px-8 py-6 text-sm font-semibold cursor-pointer"
                    >
                      {t('ready.action')}
                    </Button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Right Side: Full-Bleed Authentic Particle Field Animation */}
        <div className="relative hidden h-full md:flex md:w-[45%] items-center justify-center bg-[#09090b] overflow-hidden animate-in fade-in slide-in-from-right-4 duration-500">
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
                "radial-gradient(900px 600px at 50% 50%, transparent 45%, color-mix(in srgb, var(--background) 88%, transparent) 92%)",
            }}
          />
        </div>

      </div>
    </div>
  );
}
