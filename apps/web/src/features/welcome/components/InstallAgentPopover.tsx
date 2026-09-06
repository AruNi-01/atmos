'use client';

import React, { useMemo, useState } from 'react';
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
import { PackageInstallTerminalDialog } from '@/features/welcome/components/PackageInstallTerminalDialog';
import {
  detectInstallOs,
  preferredAgentInstallCommand,
  TERMINAL_AGENT_INSTALL_GUIDES,
  type InstallOs,
} from '@/features/welcome/lib/terminal-agent-install-guides';

export interface InstallAgentPopoverProps {
  agentId: string;
  agentName: string;
  onInstalled: () => void | Promise<void>;
  checkInstalled: () => Promise<boolean>;
  /** Controlled open (e.g. auto-open when user enables a missing agent). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerClassName?: string;
  triggerSize?: 'sm' | 'default';
}

/**
 * Onboarding install guide for a missing terminal agent CLI.
 * Mirrors InstallToolPopover (tmux/git/gh): OS tabs + type tabs + in-app terminal run.
 */
export function InstallAgentPopover({
  agentId,
  agentName,
  onInstalled,
  checkInstalled,
  open: controlledOpen,
  onOpenChange,
  triggerClassName,
  triggerSize = 'sm',
}: InstallAgentPopoverProps) {
  const t = useTranslations('onboarding');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [selectedOs, setSelectedOs] = useState<InstallOs>(() => detectInstallOs());
  const [selectedTypeByOs, setSelectedTypeByOs] = useState<Partial<Record<InstallOs, string>>>(
    {},
  );

  const isControlled = controlledOpen !== undefined;
  const popoverOpen = isControlled ? controlledOpen : uncontrolledOpen;
  const setPopoverOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const guides = TERMINAL_AGENT_INSTALL_GUIDES[agentId];
  const hostPreferredCommand = useMemo(
    () => preferredAgentInstallCommand(agentId, detectInstallOs()),
    [agentId],
  );

  const activeMethods = guides?.[selectedOs] ?? [];
  const activeType =
    selectedTypeByOs[selectedOs] ?? activeMethods[0]?.type ?? activeMethods[0]?.label ?? '';
  const activeMethod =
    activeMethods.find((m) => m.type === activeType || m.label === activeType) ??
    activeMethods[0] ??
    null;
  const runCommand =
    activeMethod?.command?.trim() || hostPreferredCommand || null;

  const handleCopy = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!guides) {
    return null;
  }

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
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
                {t('check.install.title', { toolName: agentName })}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('agents.install.description')}
              </p>
            </div>

            <Button
              size="sm"
              className="w-full cursor-pointer gap-2 rounded-xl"
              disabled={!runCommand}
              onClick={() => {
                setPopoverOpen(false);
                setTerminalOpen(true);
              }}
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

            <Tabs
              value={selectedOs}
              onValueChange={(value) => setSelectedOs(value as InstallOs)}
              className="w-full"
            >
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

              {(['macos', 'linux', 'windows'] as InstallOs[]).map((os) => {
                const methods = guides[os];
                const typeValue =
                  selectedTypeByOs[os] ?? methods[0]?.type ?? methods[0]?.label ?? '';
                return (
                  <TabsContent key={os} value={os} className="mt-4 space-y-4">
                    {methods.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{t('check.install.empty')}</p>
                    ) : (
                      <Tabs
                        value={typeValue}
                        onValueChange={(next) =>
                          setSelectedTypeByOs((prev) => ({ ...prev, [os]: next }))
                        }
                        className="w-full"
                      >
                        {methods.length > 1 && (
                          <TabsList className="mb-3 flex flex-wrap gap-1 border-b border-border/40 bg-transparent p-0 pb-2">
                            {methods.map((m) => (
                              <TabsTrigger
                                key={`${m.type}-${m.label}`}
                                value={m.type}
                                className="cursor-pointer rounded-md border border-transparent px-2.5 py-1 text-[11px] data-[state=active]:border-border/40 data-[state=active]:bg-muted/40"
                              >
                                {m.type}
                              </TabsTrigger>
                            ))}
                          </TabsList>
                        )}

                        {methods.map((m, idx) => (
                          <TabsContent
                            key={`${m.type}-${m.label}`}
                            value={m.type}
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
        toolId={agentId}
        toolName={agentName}
        installCommand={runCommand}
        checkInstalled={checkInstalled}
        onInstalled={onInstalled}
      />
    </>
  );
}
