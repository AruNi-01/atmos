'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Button,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  cn,
} from '@workspace/ui';
import { Check, Copy, ExternalLink, SquareTerminal } from 'lucide-react';
import {
  PackageInstallTerminalDialog,
  type OnboardingInstallToolId,
} from '@/features/welcome/components/PackageInstallTerminalDialog';

type OS = 'macos' | 'linux' | 'windows';

interface InstallMethod {
  label: string;
  command?: string;
  notes?: string;
  link?: string;
}

const INSTALL_GUIDES: Record<OnboardingInstallToolId, Record<OS, InstallMethod[]>> = {
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
      {
        label: 'WSL',
        notes:
          'tmux is not natively supported on Windows. Please install WSL (Windows Subsystem for Linux) first, then run:',
        command: 'sudo apt install tmux',
      },
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
      {
        label: 'Installer',
        link: 'https://git-scm.com/download/win',
        notes: 'Or download the official standalone Git installer.',
      },
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
        command:
          'sudo mkdir -p -m 755 /etc/apt/keyrings \\\n&& wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \\\n&& sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \\\n&& echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \\\n&& sudo apt update \\\n&& sudo apt install -y gh',
      },
      {
        label: 'DNF (Fedora/RHEL)',
        command:
          'sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo \\\n&& sudo dnf install -y gh',
      },
      { label: 'Pacman (Arch)', command: 'sudo pacman -S --noconfirm github-cli' },
    ],
    windows: [
      { label: 'Winget', command: 'winget install --id GitHub.cli' },
      { label: 'Chocolatey', command: 'choco install gh' },
      {
        label: 'Installer',
        link: 'https://github.com/cli/cli/releases',
        notes: 'Or download the latest standalone installer.',
      },
    ],
  },
};

export interface InstallToolPopoverProps {
  toolId: OnboardingInstallToolId;
  toolName: string;
  onInstalled: () => void | Promise<void>;
  /** Defaults to onboarding compact outline style. */
  triggerClassName?: string;
  /** Optional trigger size for denser surfaces (e.g. Settings). */
  triggerSize?: 'sm' | 'default';
}

/**
 * Shared install guide for tmux / git / gh — used by onboarding and Settings → Integrations.
 * Opens PackageInstallTerminalDialog for in-app install, plus manual OS commands.
 */
export function InstallToolPopover({
  toolId,
  toolName,
  onInstalled,
  triggerClassName,
  triggerSize = 'sm',
}: InstallToolPopoverProps) {
  const t = useTranslations('onboarding');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);

  const handleCopy = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const guides = INSTALL_GUIDES[toolId];

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size={triggerSize}
            className={cn(
              'cursor-pointer',
              triggerSize === 'sm' &&
                'h-7 rounded-full border-border/40 px-3 py-1 text-[11px] font-semibold hover:bg-muted/20 text-foreground',
              triggerClassName,
            )}
          >
            {t('check.install.button')}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="z-50 w-[420px] rounded-2xl border border-border bg-popover p-5 text-popover-foreground shadow-xl"
        >
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                {t('check.install.title', { toolName })}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('check.install.description')}
              </p>
            </div>

            <Button
              size="sm"
              className="w-full cursor-pointer gap-2 rounded-xl"
              onClick={() => setTerminalOpen(true)}
            >
              <SquareTerminal className="size-3.5" />
              {t('check.install.runInTerminal')}
            </Button>

            <div className="relative">
              <div className="absolute inset-x-0 top-1/2 h-px bg-border/50" />
              <p className="relative mx-auto w-fit bg-popover px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                {t('check.install.orManual')}
              </p>
            </div>

            <Tabs defaultValue="macos" className="w-full">
              <TabsList className="grid w-full grid-cols-3 rounded-xl bg-muted/40 p-1">
                <TabsTrigger value="macos" className="cursor-pointer rounded-lg py-1.5 text-xs">
                  {t('check.install.os.macos')}
                </TabsTrigger>
                <TabsTrigger value="linux" className="cursor-pointer rounded-lg py-1.5 text-xs">
                  {t('check.install.os.linux')}
                </TabsTrigger>
                <TabsTrigger value="windows" className="cursor-pointer rounded-lg py-1.5 text-xs">
                  {t('check.install.os.windows')}
                </TabsTrigger>
              </TabsList>

              {(['macos', 'linux', 'windows'] as OS[]).map((os) => {
                const methods = guides[os];
                return (
                  <TabsContent key={os} value={os} className="mt-4 space-y-4">
                    {methods.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{t('check.install.empty')}</p>
                    ) : (
                      <Tabs defaultValue={methods[0]!.label} className="w-full">
                        {methods.length > 1 && (
                          <TabsList className="mb-3 flex flex-wrap gap-1 border-b border-border/40 bg-transparent p-0 pb-2">
                            {methods.map((m) => (
                              <TabsTrigger
                                key={m.label}
                                value={m.label}
                                className="cursor-pointer rounded-md border border-transparent px-2.5 py-1 text-[11px] data-[state=active]:border-border/40 data-[state=active]:bg-muted/40"
                              >
                                {m.label}
                              </TabsTrigger>
                            ))}
                          </TabsList>
                        )}

                        {methods.map((m, idx) => (
                          <TabsContent
                            key={m.label}
                            value={m.label}
                            className="space-y-3 outline-none"
                          >
                            {m.notes ? (
                              <p className="text-xs leading-relaxed text-muted-foreground">
                                {m.notes}
                              </p>
                            ) : null}
                            {m.command ? (
                              <div className="group relative">
                                <pre className="max-h-[160px] overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-border/40 bg-muted/40 p-3 pr-10 font-mono text-[11px] leading-relaxed text-foreground">
                                  {m.command}
                                </pre>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="absolute right-2 top-2 h-7 w-7 cursor-pointer rounded-lg text-muted-foreground hover:text-foreground"
                                  onClick={() => handleCopy(m.command!, `${os}-${idx}`)}
                                >
                                  {copiedId === `${os}-${idx}` ? (
                                    <Check className="size-3.5 text-emerald-500" />
                                  ) : (
                                    <Copy className="size-3.5" />
                                  )}
                                </Button>
                              </div>
                            ) : null}
                            {m.link ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full cursor-pointer rounded-xl text-xs font-medium"
                                onClick={() => window.open(m.link, '_blank', 'noopener,noreferrer')}
                              >
                                <ExternalLink className="mr-2 size-3.5" />
                                {t('check.install.download')}
                              </Button>
                            ) : null}
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

      <PackageInstallTerminalDialog
        open={terminalOpen}
        onOpenChange={setTerminalOpen}
        toolId={toolId}
        toolName={toolName}
        onInstalled={onInstalled}
      />
    </>
  );
}
