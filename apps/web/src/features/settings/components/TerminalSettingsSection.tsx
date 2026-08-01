'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Switch,
  cn,
} from '@workspace/ui';
import {
  Check,
  ChevronDown,
  Gauge,
  Keyboard,
  Link2,
  MessageSquareText,
} from 'lucide-react';
import type { TerminalFileLinkOpenMode } from '@/features/settings/store/terminal-link-settings-store';
import {
  MAX_TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_BYTES,
  MIN_TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_BYTES,
  TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_STEP_BYTES,
  normalizeTerminalSideContextPromptBudgetBytes,
} from '@/features/settings/store/terminal-side-chat-settings-store';
import {
  QUICK_OPEN_APP_MAP,
  QUICK_OPEN_APP_OPTIONS,
  QuickOpenAppIcon,
  type QuickOpenAppName,
} from '@/app-shell/quick-open-apps';

function SettingRow({
  title,
  description,
  children,
  wide = false,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  wide?: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border px-2 py-4 last:border-b-0">
      <div
        className={cn(
          'grid gap-8',
          wide
            ? 'grid-cols-[minmax(0,1fr)_320px]'
            : 'grid-cols-[minmax(0,1fr)_100px]',
        )}
      >
        <div>
          <p className="text-base font-medium text-foreground">{title}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
          {footer}
        </div>
        <div className="flex items-center justify-end">{children}</div>
      </div>
    </div>
  );
}

function SettingsGroup({
  open,
  onOpenChange,
  icon: Icon,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="overflow-hidden rounded-2xl border border-border"
    >
      <div className="flex items-start justify-between gap-4 px-6 py-5">
        <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
          <div className="flex items-start gap-3">
            <span className="relative mt-0.5 size-5 shrink-0">
              <Icon className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
              <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-medium text-foreground">{title}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </div>
          </div>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        <div className="border-t border-border px-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function TerminalSettingsSection({
  fileLinkOpenMode,
  fileLinkOpenApp,
  useLastSplitAgentOnSplit,
  lastSplitAgentId,
  sideContextPromptBudgetBytes,
  richInputEnabled,
  richInputTriggerBarVisible,
  setFileLinkOpenMode,
  setFileLinkOpenApp,
  setUseLastSplitAgentOnSplit,
  setSideContextPromptBudgetBytes,
  setRichInputEnabled,
  setRichInputTriggerBarVisible,
  maxWarmWorkspaces,
  maxGlobalTerminalPanes,
  setMaxWarmWorkspaces,
  setMaxGlobalTerminalPanes,
}: {
  fileLinkOpenMode: TerminalFileLinkOpenMode;
  fileLinkOpenApp: QuickOpenAppName;
  useLastSplitAgentOnSplit: boolean;
  lastSplitAgentId: string | null;
  sideContextPromptBudgetBytes: number;
  richInputEnabled: boolean;
  richInputTriggerBarVisible: boolean;
  setFileLinkOpenMode: (mode: TerminalFileLinkOpenMode) => Promise<void> | void;
  setFileLinkOpenApp: (app: QuickOpenAppName) => Promise<void> | void;
  setUseLastSplitAgentOnSplit: (enabled: boolean) => void;
  setSideContextPromptBudgetBytes: (bytes: number) => Promise<void> | void;
  setRichInputEnabled: (enabled: boolean) => Promise<void> | void;
  setRichInputTriggerBarVisible: (visible: boolean) => Promise<void> | void;
  maxWarmWorkspaces: number;
  maxGlobalTerminalPanes: number;
  setMaxWarmWorkspaces: (size: number) => Promise<void> | void;
  setMaxGlobalTerminalPanes: (panels: number) => Promise<void> | void;
}) {
  const t = useTranslations('settings.terminalSection');
  const locale = useLocale();
  const [behaviorExpanded, setBehaviorExpanded] = React.useState(true);
  const [richInputExpanded, setRichInputExpanded] = React.useState(true);
  const [sideChatExpanded, setSideChatExpanded] = React.useState(true);
  const [performanceExpanded, setPerformanceExpanded] = React.useState(true);
  const [localTerminalCacheMaxSize, setLocalTerminalCacheMaxSize] = React.useState(maxWarmWorkspaces.toString());
  const [localTerminalCacheMaxPanels, setLocalTerminalCacheMaxPanels] = React.useState(maxGlobalTerminalPanes.toString());
  const [localSideContextBudget, setLocalSideContextBudget] = React.useState(
    sideContextPromptBudgetBytes.toString(),
  );
  const terminalLinkModeOptions = [
    {
      value: 'atmos',
      label: t('linkModes.atmos.label'),
      description: t('linkModes.atmos.description'),
    },
    {
      value: 'finder',
      label: t('linkModes.finder.label'),
      description: t('linkModes.finder.description'),
    },
    {
      value: 'app',
      label: t('linkModes.app.label'),
      description: t('linkModes.app.description'),
    },
  ] as const;
  const activeTerminalLinkMode =
    terminalLinkModeOptions.find((option) => option.value === fileLinkOpenMode) ??
    terminalLinkModeOptions[0];
  const activeQuickOpenApp = QUICK_OPEN_APP_MAP[fileLinkOpenApp];
  const formattedMinSideContextBudget =
    MIN_TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_BYTES.toLocaleString(locale);
  const formattedMaxSideContextBudget =
    MAX_TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_BYTES.toLocaleString(locale);

  React.useEffect(() => {
    setLocalSideContextBudget(sideContextPromptBudgetBytes.toString());
  }, [sideContextPromptBudgetBytes]);

  React.useEffect(() => {
    setLocalTerminalCacheMaxSize(maxWarmWorkspaces.toString());
  }, [maxWarmWorkspaces]);

  React.useEffect(() => {
    setLocalTerminalCacheMaxPanels(maxGlobalTerminalPanes.toString());
  }, [maxGlobalTerminalPanes]);

  const handleTerminalCacheMaxSizeCommit = async (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      setLocalTerminalCacheMaxSize(maxWarmWorkspaces.toString());
      return;
    }
    const normalized = Math.min(50, Math.max(1, parsed));
    setLocalTerminalCacheMaxSize(normalized.toString());
    await setMaxWarmWorkspaces(normalized);
  };

  const handleTerminalCacheMaxPanelsCommit = async (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      setLocalTerminalCacheMaxPanels(maxGlobalTerminalPanes.toString());
      return;
    }
    const normalized = Math.min(100, Math.max(1, parsed));
    setLocalTerminalCacheMaxPanels(normalized.toString());
    await setMaxGlobalTerminalPanes(normalized);
  };

  const handleSideContextBudgetCommit = async (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) {
      setLocalSideContextBudget(sideContextPromptBudgetBytes.toString());
      return;
    }

    const normalized = normalizeTerminalSideContextPromptBudgetBytes(parsed);
    setLocalSideContextBudget(normalized.toString());
    await setSideContextPromptBudgetBytes(normalized);
  };

  return (
    <div className="space-y-4">
      <SettingsGroup
        open={behaviorExpanded}
        onOpenChange={setBehaviorExpanded}
        icon={Link2}
        title={t('groups.behavior.title')}
        description={t('groups.behavior.description')}
      >
        <SettingRow
          title={t('fileLinkOpenMode.title')}
          description={t('fileLinkOpenMode.description')}
          wide
        >
          <div className="flex items-center justify-end gap-3">
            {fileLinkOpenMode === 'app' && activeQuickOpenApp && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="min-w-44 justify-between">
                    <span className="flex min-w-0 items-center gap-2">
                      <QuickOpenAppIcon
                        iconName={activeQuickOpenApp.iconName}
                        themed={activeQuickOpenApp.themed}
                        className="size-4 shrink-0"
                      />
                      <span className="truncate">{activeQuickOpenApp.label}</span>
                    </span>
                    <ChevronDown className="ml-2 size-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  {QUICK_OPEN_APP_OPTIONS.map((app) => (
                    <DropdownMenuItem
                      key={app.name}
                      className="cursor-pointer"
                      onClick={() => void setFileLinkOpenApp(app.name)}
                    >
                      <QuickOpenAppIcon
                        iconName={app.iconName}
                        themed={app.themed}
                        className="mr-2 size-4"
                      />
                      <span className="flex-1">{app.label}</span>
                      {fileLinkOpenApp === app.name && <Check className="size-4" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="min-w-48 justify-between">
                  <span>{activeTerminalLinkMode.label}</span>
                  <ChevronDown className="ml-2 size-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                {terminalLinkModeOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    className="cursor-pointer items-start"
                    onClick={() => void setFileLinkOpenMode(option.value as TerminalFileLinkOpenMode)}
                  >
                    <div className="flex-1 pr-3">
                      <p className="text-sm font-medium text-foreground">{option.label}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {option.description}
                      </p>
                    </div>
                    {fileLinkOpenMode === option.value && <Check className="mt-0.5 size-4 shrink-0" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SettingRow>
        <SettingRow
          title={t('defaultSplitAgent.title')}
          description={t('defaultSplitAgent.description')}
          footer={
            lastSplitAgentId ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {t('defaultSplitAgent.lastAgent')}{' '}
                <span className="font-medium text-foreground">{lastSplitAgentId}</span>
              </p>
            ) : null
          }
        >
          <Switch
            checked={useLastSplitAgentOnSplit}
            onCheckedChange={setUseLastSplitAgentOnSplit}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        open={richInputExpanded}
        onOpenChange={setRichInputExpanded}
        icon={Keyboard}
        title={t('groups.richInput.title')}
        description={t('groups.richInput.description')}
      >
        <SettingRow
          title={t('richInputEnabled.title')}
          description={t('richInputEnabled.description')}
        >
          <Switch
            checked={richInputEnabled}
            onCheckedChange={(value) => void setRichInputEnabled(!!value)}
            aria-label={t('richInputEnabled.title')}
          />
        </SettingRow>
        <SettingRow
          title={t('richInputTriggerBar.title')}
          description={t('richInputTriggerBar.description')}
        >
          <Switch
            checked={richInputTriggerBarVisible}
            disabled={!richInputEnabled}
            onCheckedChange={(value) => void setRichInputTriggerBarVisible(!!value)}
            aria-label={t('richInputTriggerBar.title')}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        open={sideChatExpanded}
        onOpenChange={setSideChatExpanded}
        icon={MessageSquareText}
        title={t('groups.sideChat.title')}
        description={t('groups.sideChat.description')}
      >
        <SettingRow
          title={t('sideContextBudget.title')}
          description={t('sideContextBudget.description', {
            min: formattedMinSideContextBudget,
            max: formattedMaxSideContextBudget,
          })}
          wide
        >
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={MIN_TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_BYTES}
              max={MAX_TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_BYTES}
              step={TERMINAL_SIDE_CONTEXT_PROMPT_BUDGET_STEP_BYTES}
              value={localSideContextBudget}
              onChange={(event) => setLocalSideContextBudget(event.target.value)}
              onBlur={(event) => void handleSideContextBudgetCommit(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void handleSideContextBudgetCommit(localSideContextBudget);
                }
              }}
              className="w-32"
            />
            <span className="text-sm text-muted-foreground">{t('sideContextBudget.bytes')}</span>
          </div>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        open={performanceExpanded}
        onOpenChange={setPerformanceExpanded}
        icon={Gauge}
        title={t('groups.performance.title')}
        description={t('groups.performance.description')}
      >
        <SettingRow
          title={t('cacheWorkspaces.title')}
          description={t('cacheWorkspaces.description')}
          wide
        >
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={50}
              step={1}
              value={localTerminalCacheMaxSize}
              onChange={(event) => setLocalTerminalCacheMaxSize(event.target.value)}
              onBlur={(event) => void handleTerminalCacheMaxSizeCommit(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void handleTerminalCacheMaxSizeCommit(localTerminalCacheMaxSize);
                }
              }}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">{t('cacheWorkspaces.contexts')}</span>
          </div>
        </SettingRow>
        <SettingRow
          title={t('cachePanels.title')}
          description={t('cachePanels.description')}
          wide
        >
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={100}
              step={1}
              value={localTerminalCacheMaxPanels}
              onChange={(event) => setLocalTerminalCacheMaxPanels(event.target.value)}
              onBlur={(event) => void handleTerminalCacheMaxPanelsCommit(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void handleTerminalCacheMaxPanelsCommit(localTerminalCacheMaxPanels);
                }
              }}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">{t('cachePanels.panels')}</span>
          </div>
        </SettingRow>
      </SettingsGroup>
    </div>
  );
}
