'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useQueryState } from 'nuqs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  cn,
  toastManager,
  MotionSidebar,
  MotionSidebarContent,
  MotionSidebarHeader,
  MotionSidebarMenu,
  MotionSidebarMenuButton,
  MotionSidebarMenuItem,
  MotionSidebarProvider,
} from '@workspace/ui';
import {
  Bot,
  Building2,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  Languages,
  LoaderCircle,
  Package,
  RotateCw,
  Plus,
  Route,
  Save,
  SlidersHorizontal,
  Trash2,
  UserCog,
  Webhook,
  GitBranch,
  Archive,
} from 'lucide-react';
import InfoCircleIcon from '@workspace/ui/components/icons/info-circle-icon';
import TerminalIcon from '@workspace/ui/components/icons/terminal-icon';
import { BotIcon } from '@workspace/ui/components/icons/bot-icon';
import BrainCircuitIcon from '@workspace/ui/components/icons/brain-circuit-icon';
import { BellIcon } from '@workspace/ui/components/icons/bell-icon';
import WorldIcon from '@workspace/ui/components/icons/world-icon';
import { FolderKanbanIcon } from '@workspace/ui/components/icons/folder-kanban-icon';
import { AGENT_OPTIONS } from '@/components/wiki/AgentSelect';
import { AgentIcon } from '@/components/agent/AgentIcon';
import { isTauriRuntime } from '@/lib/desktop-runtime';
import { AtmosWordmark } from '@/components/ui/AtmosWordmark';
import {
  checkForUpdate,
  downloadAndInstallUpdate,
  getUpdateReleaseNotesUrl,
  type UpdateStatus,
} from '@/hooks/use-updater';
import { useTerminalLinkSettings, type TerminalFileLinkOpenMode } from '@/hooks/use-terminal-link-settings';
import { useWorkspaceSettings } from '@/hooks/use-workspace-settings';
import { QUICK_OPEN_APP_MAP, QUICK_OPEN_APP_OPTIONS, QuickOpenAppIcon } from '@/components/layout/quick-open-apps';
import {
  agentBehaviourSettingsApi,
  codeAgentCustomApi,
  type CodeAgentCustomEntry,
  llmProvidersApi,
  type LlmProvidersFile,
  type SessionTitleFormatConfig,
} from '@/api/ws-api';
import { systemApi } from '@/api/rest-api';
import { LlmProviderEditorDialog } from '@/components/layout/LlmProvidersModal';
import { WIKI_LANGUAGE_OPTIONS } from '@/components/wiki/wiki-languages';
import { useWebSocketStore } from '@/hooks/use-websocket';
import { settingsModalParams } from '@/lib/nuqs/searchParams';
import { useNotificationSettings, type PushServerConfig, type PushServerType } from '@/hooks/use-notification-settings';
import {
  requestBrowserNotificationPermission,
  sendBrowserNotification,
  showDesktopNotification,
} from '@/lib/notifications';
import { RemoteAccessSection } from '@/components/dialogs/RemoteAccessSection';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSectionOverride?: SettingsSectionId | null;
}

const SETTINGS_SECTIONS = [
  {
    id: 'code-agent',
    label: 'Code Agent',
    description: 'Agent startup commands and custom parameters',
  },
  {
    id: 'terminal',
    label: 'Terminal',
    description: 'Terminal preferences and link behavior',
  },
  {
    id: 'workspace',
    label: 'Workspace',
    description: 'Deletion behavior and cleanup options',
  },
  {
    id: 'ai',
    label: 'AI & Provider',
    description: 'Providers and lightweight task routing',
  },
  {
    id: 'notify',
    label: 'Notify',
    description: 'Notification channels and agent event triggers',
  },
  {
    id: 'remote-access',
    label: 'Remote Access',
    description: 'Tunnel gateway and remote browser access',
  },
  {
    id: 'about',
    label: 'About',
    description: 'Product overview and desktop updates',
  },
] as const;

type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id'];

const TERMINAL_LINK_MODE_OPTIONS = [
  {
    value: 'atmos',
    label: 'Atmos',
    description: 'Open files in the built-in editor and reveal directories in Files.',
  },
  {
    value: 'finder',
    label: 'Finder',
    description: 'Open files and directories in Finder.',
  },
  {
    value: 'app',
    label: 'Quick Open App',
    description: 'Open terminal file links with a selected external app.',
  },
] as const;

const FEATURE_LANGUAGE_OPTIONS = WIKI_LANGUAGE_OPTIONS.filter(
  (option) => option.value !== 'other',
);

function fallbackProviderLabel(providerId: string): string {
  return providerId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeSessionTitleFormat(
  value?: SessionTitleFormatConfig | null,
): SessionTitleFormatConfig {
  return {
    include_agent_name: !!value?.include_agent_name,
    include_project_name: !!value?.include_project_name,
    include_intent_emoji: !!value?.include_intent_emoji,
  };
}

function sessionTitleFormatPreview(format: SessionTitleFormatConfig): string {
  const segments: string[] = [];
  if (format.include_agent_name) segments.push('[agentName]');
  if (format.include_project_name) segments.push('[projectName]');
  segments.push(format.include_intent_emoji ? '🎨 title desc' : 'title desc');
  return segments.join(' | ');
}

const BUILT_IN_AGENT_IDS = new Set<string>(AGENT_OPTIONS.map((agent) => agent.id));

function isBuiltInAgentId(id: string): boolean {
  return BUILT_IN_AGENT_IDS.has(id);
}

function dedupeCodeAgentEntries(entries: CodeAgentCustomEntry[]): CodeAgentCustomEntry[] {
  const deduped = new Map<string, CodeAgentCustomEntry>();
  for (const entry of entries) {
    const id = entry.id?.trim();
    if (!id) continue;
    deduped.set(id, { ...entry, id, enabled: entry.enabled !== false });
  }
  return Array.from(deduped.values());
}

function buildBuiltInOverrides(entries: CodeAgentCustomEntry[]) {
  const next: Record<string, { cmd?: string; flags?: string; enabled?: boolean }> = {};

  for (const agent of AGENT_OPTIONS) {
    const entry = entries.find((item) => item.id === agent.id);
    if (!entry) continue;

    const cmd = entry.cmd !== agent.cmd ? entry.cmd : undefined;
    const flags = entry.flags !== (agent.params || '') ? entry.flags : undefined;
    const enabled = entry.enabled === false ? false : undefined;
    if (!cmd && !flags && enabled === undefined) continue;

    next[agent.id] = {};
    if (cmd !== undefined) next[agent.id].cmd = cmd;
    if (flags !== undefined) next[agent.id].flags = flags;
    if (enabled !== undefined) next[agent.id].enabled = enabled;
  }

  return next;
}

function buildBuiltInEntries(
  overrides: Record<string, { cmd?: string; flags?: string; enabled?: boolean }>,
): CodeAgentCustomEntry[] {
  return AGENT_OPTIONS.flatMap((agent) => {
    const draft = overrides[agent.id];
    const cmd = draft?.cmd ?? agent.cmd;
    const flags = draft?.flags ?? (agent.params || '');
    const enabled = draft?.enabled ?? true;
    const changed = cmd !== agent.cmd || flags !== (agent.params || '') || enabled !== true;

    if (!changed) return [];

    return [{
      id: agent.id,
      label: agent.label,
      cmd,
      flags,
      enabled,
    }];
  });
}

interface AgentHookToolStatus {
  detected: boolean;
  installed: boolean;
  config_path?: string | null;
  error?: string | null;
}

interface AgentHookInstallReport {
  claude_code: AgentHookToolStatus;
  codex: AgentHookToolStatus;
  opencode: AgentHookToolStatus;
}

const HOOK_TOOL_META: { key: keyof AgentHookInstallReport; label: string }[] = [
  { key: "claude_code", label: "Claude Code" },
  { key: "codex", label: "Codex CLI" },
  { key: "opencode", label: "OpenCode" },
];

function AgentHookStatusCard() {
  const [report, setReport] = React.useState<AgentHookInstallReport | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [acting, setActing] = React.useState(false);

  const fetchStatus = React.useCallback(async () => {
    setLoading(true);
    try {
      const config = await import("@/lib/desktop-runtime").then(m => m.getRuntimeApiConfig());
      const base = (await import("@/lib/desktop-runtime")).httpBase(config);
      const res = await fetch(`${base}/hooks/status`);
      if (res.ok) setReport(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  const handleInstall = React.useCallback(async () => {
    setActing(true);
    try {
      const config = await import("@/lib/desktop-runtime").then(m => m.getRuntimeApiConfig());
      const base = (await import("@/lib/desktop-runtime")).httpBase(config);
      const res = await fetch(`${base}/hooks/install`, { method: "POST" });
      if (res.ok) setReport(await res.json());
    } catch { /* ignore */ } finally {
      setActing(false);
    }
  }, []);

  const handleUninstall = React.useCallback(async () => {
    setActing(true);
    try {
      const config = await import("@/lib/desktop-runtime").then(m => m.getRuntimeApiConfig());
      const base = (await import("@/lib/desktop-runtime")).httpBase(config);
      const res = await fetch(`${base}/hooks/uninstall`, { method: "POST" });
      if (res.ok) {
        setReport(await res.json());
      }
    } catch { /* ignore */ } finally {
      setActing(false);
    }
  }, []);

  const anyInstalled = report && HOOK_TOOL_META.some(t => report[t.key].installed);
  const anyDetected = report && HOOK_TOOL_META.some(t => report[t.key].detected);

  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div className="flex items-start justify-between gap-4 px-6 py-5">
        <div>
          <p className="text-base font-medium text-foreground">Agent Hook Status</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Hooks inject into local Agent tool configs so Atmos can track their running state.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleInstall} disabled={acting || loading}>
            {acting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
            Install
          </Button>
          {anyInstalled && (
            <Button variant="outline" size="sm" onClick={handleUninstall} disabled={acting || loading} className="text-destructive hover:text-destructive">
              Uninstall
            </Button>
          )}
        </div>
      </div>

      <div className="border-t border-border px-4">
        {loading && !report ? (
          <div className="px-2 py-4">
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        ) : report ? (
          HOOK_TOOL_META.map(({ key, label }) => {
            const tool = report[key];
            return (
              <div key={key} className="border-b border-border px-2 py-3 last:border-b-0">
                <div className="grid grid-cols-[minmax(0,1fr)_200px] gap-8">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-medium text-foreground">{label}</span>
                    {tool.config_path && (
                      <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]" title={tool.config_path}>
                        {tool.config_path.split(/[\\/]/).slice(-2).join("/")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    {!tool.detected ? (
                      <span className="text-xs text-muted-foreground">Not detected</span>
                    ) : tool.installed ? (
                      <span className="text-xs font-medium text-emerald-500">Installed</span>
                    ) : tool.error ? (
                      <span className="text-xs text-destructive truncate max-w-[180px]" title={tool.error}>Error: {tool.error}</span>
                    ) : (
                      <span className="text-xs text-amber-500">Not installed</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="px-2 py-4 text-sm text-muted-foreground">
            {!anyDetected && "No supported agent tools detected on this system."}
          </div>
        )}
      </div>
    </div>
  );
}

const PUSH_SERVER_TYPE_OPTIONS: { value: PushServerType; label: string; description: string }[] = [
  { value: 'ntfy', label: 'ntfy', description: 'Self-hosted or ntfy.sh push notifications' },
  { value: 'bark', label: 'Bark', description: 'iOS push notifications via Bark' },
  { value: 'gotify', label: 'Gotify', description: 'Self-hosted push notification server' },
  { value: 'custom_webhook', label: 'Custom Webhook', description: 'Send to any HTTP endpoint' },
];

const TEST_NOTIFICATION_PAYLOAD = {
  title: 'Atmos Test Notification',
  body: 'This is a test notification from Atmos.',
};

function WorkspaceSettingsSection() {
  const {
    closePrOnDelete,
    closeIssueOnDelete,
    deleteRemoteBranch,
    confirmBeforeDelete,
    branchPrefix,
    confirmBeforeArchive,
    killTmuxOnArchive,
    closeAcpOnArchive,
    setClosePrOnDelete,
    setCloseIssueOnDelete,
    setDeleteRemoteBranch,
    setConfirmBeforeDelete,
    setBranchPrefix,
    setConfirmBeforeArchive,
    setKillTmuxOnArchive,
    setCloseAcpOnArchive,
    loadSettings,
  } = useWorkspaceSettings();

  const [expanded, setExpanded] = React.useState(true);
  const [branchNamingExpanded, setBranchNamingExpanded] = React.useState(true);
  const [archiveExpanded, setArchiveExpanded] = React.useState(true);

  React.useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return (
    <div className="space-y-4">
      <Collapsible
        open={branchNamingExpanded}
        onOpenChange={setBranchNamingExpanded}
        className="overflow-hidden rounded-2xl border border-border"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5">
          <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
            <div className="flex items-start gap-3">
              <span className="relative mt-0.5 size-5 shrink-0">
                <GitBranch className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
                <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
              </span>
              <div className="min-w-0">
                <p className="text-base font-medium text-foreground">Branch Naming</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Configure the git branch prefix for new workspace branches.
                </p>
              </div>
            </div>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <div className="border-t border-border px-4">
            <div className="border-b border-border px-2 py-4 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
                <div>
                  <p className="text-sm text-foreground">Branch prefix</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    All workspace branches will be prefixed with this value followed by a fixed &lsquo;/&rsquo;.
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <div className="flex items-center gap-0">
                    <Input
                      value={branchPrefix}
                      onChange={(e) => setBranchPrefix(e.target.value)}
                      placeholder="atmos"
                      className="h-8 w-[200px] rounded-r-none border-r-0 focus-visible:ring-0"
                    />
                    <div className="flex h-8 items-center rounded-r-md border border-l-0 bg-muted px-2 text-sm text-muted-foreground">
                      /
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible
        open={expanded}
        onOpenChange={setExpanded}
        className="overflow-hidden rounded-2xl border border-border"
      >
      <div className="flex items-start justify-between gap-4 px-6 py-5">
        <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
          <div className="flex items-start gap-3">
            <span className="relative mt-0.5 size-5 shrink-0">
              <Trash2 className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
              <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-medium text-foreground">Deletion Behavior</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Configure what happens when a workspace is deleted. Project deletion follows the same settings.
              </p>
            </div>
          </div>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        <div className="border-t border-border px-4">
          <div className="border-b border-border px-2 py-4 last:border-b-0">
            <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8">
              <div>
                <p className="text-sm text-foreground">Close associated PR</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Automatically close the linked GitHub pull request when deleting a workspace.
                </p>
              </div>
              <div className="flex items-center justify-end">
                <Switch checked={closePrOnDelete} onCheckedChange={setClosePrOnDelete} />
              </div>
            </div>
          </div>
          <div className="border-b border-border px-2 py-4 last:border-b-0">
            <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8">
              <div>
                <p className="text-sm text-foreground">Close associated Issue</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Automatically close the linked GitHub issue when deleting a workspace.
                </p>
              </div>
              <div className="flex items-center justify-end">
                <Switch checked={closeIssueOnDelete} onCheckedChange={setCloseIssueOnDelete} />
              </div>
            </div>
          </div>
          <div className="border-b border-border px-2 py-4 last:border-b-0">
            <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8">
              <div>
                <p className="text-sm text-foreground">Delete remote branch</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Also delete the remote branch on GitHub when deleting a workspace.
                </p>
              </div>
              <div className="flex items-center justify-end">
                <Switch checked={deleteRemoteBranch} onCheckedChange={setDeleteRemoteBranch} />
              </div>
            </div>
          </div>
          <div className="border-b border-border px-2 py-4 last:border-b-0">
            <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8">
              <div>
                <p className="text-sm text-foreground">Confirm before delete</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Show a confirmation dialog before deleting a workspace.
                </p>
              </div>
              <div className="flex items-center justify-end">
                <Switch checked={confirmBeforeDelete} onCheckedChange={setConfirmBeforeDelete} />
              </div>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>

      <Collapsible
        open={archiveExpanded}
        onOpenChange={setArchiveExpanded}
        className="overflow-hidden rounded-2xl border border-border"
      >
      <div className="flex items-start justify-between gap-4 px-6 py-5">
        <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
          <div className="flex items-start gap-3">
            <span className="relative mt-0.5 size-5 shrink-0">
              <Archive className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
              <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-medium text-foreground">Archive Behavior</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Configure what happens when a workspace is archived. Archived workspaces can be restored later.
              </p>
            </div>
          </div>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        <div className="border-t border-border px-4">
          <div className="border-b border-border px-2 py-4 last:border-b-0">
            <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8">
              <div>
                <p className="text-sm text-foreground">Confirm before archive</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Show a confirmation dialog before archiving a workspace.
                </p>
              </div>
              <div className="flex items-center justify-end">
                <Switch checked={confirmBeforeArchive} onCheckedChange={setConfirmBeforeArchive} />
              </div>
            </div>
          </div>
          <div className="border-b border-border px-2 py-4 last:border-b-0">
            <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8">
              <div>
                <p className="text-sm text-foreground">Kill tmux session</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Terminate the tmux session and PTY processes when archiving. The worktree and branch are preserved.
                </p>
              </div>
              <div className="flex items-center justify-end">
                <Switch checked={killTmuxOnArchive} onCheckedChange={setKillTmuxOnArchive} />
              </div>
            </div>
          </div>
          <div className="border-b border-border px-2 py-4 last:border-b-0">
            <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8">
              <div>
                <p className="text-sm text-foreground">Close ACP Chat Session</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Close any active agent chat sessions when archiving a workspace.
                </p>
              </div>
              <div className="flex items-center justify-end">
                <Switch checked={closeAcpOnArchive} onCheckedChange={setCloseAcpOnArchive} />
              </div>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
    </div>
  );
}

function NotifySettingsSection({
  settings,
  isLoading,
  isSaving,
  onToggleBrowser,
  onToggleDesktop,
  onTestBrowser,
  onTestDesktop,
  onTogglePermissionRequest,
  onToggleTaskComplete,
  onAddPushServer,
  onRemovePushServer,
  onUpdatePushServer,
  onTestPushServer,
}: {
  settings: import('@/hooks/use-notification-settings').NotificationSettings;
  isLoading: boolean;
  isSaving: boolean;
  onToggleBrowser: (checked: boolean) => void;
  onToggleDesktop: (checked: boolean) => void;
  onTestBrowser: () => Promise<boolean>;
  onTestDesktop: () => Promise<boolean>;
  onTogglePermissionRequest: (checked: boolean) => void;
  onToggleTaskComplete: (checked: boolean) => void;
  onAddPushServer: (server: PushServerConfig) => Promise<void>;
  onRemovePushServer: (id: string) => Promise<void>;
  onUpdatePushServer: (id: string, updates: Partial<PushServerConfig>) => Promise<void>;
  onTestPushServer: (index: number) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [pushServersExpanded, setPushServersExpanded] = React.useState(false);
  const [testingServerId, setTestingServerId] = React.useState<string | null>(null);
  const [testingLocalChannel, setTestingLocalChannel] = React.useState<'browser' | 'desktop' | null>(null);
  const [pushServerLocalById, setPushServerLocalById] = React.useState<Record<string, PushServerConfig>>({});

  React.useEffect(() => {
    const ids = new Set(settings.push_servers.map(s => s.id));
    setPushServerLocalById(prev => {
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(next)) {
        if (!ids.has(id)) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [settings.push_servers]);

  const displayPushServer = React.useCallback(
    (server: PushServerConfig) => pushServerLocalById[server.id] ?? server,
    [pushServerLocalById],
  );

  const isPushFieldsDirty = React.useCallback(
    (server: PushServerConfig) => {
      const local = pushServerLocalById[server.id];
      if (!local) return false;
      return (
        local.url !== server.url ||
        (local.token ?? null) !== (server.token ?? null) ||
        (local.topic ?? null) !== (server.topic ?? null) ||
        (local.device_key ?? null) !== (server.device_key ?? null) ||
        (local.custom_body_template ?? null) !== (server.custom_body_template ?? null)
      );
    },
    [pushServerLocalById],
  );

  const setPushFields = React.useCallback((server: PushServerConfig, patch: Partial<PushServerConfig>) => {
    setPushServerLocalById(prev => ({
      ...prev,
      [server.id]: { ...(prev[server.id] ?? server), ...patch },
    }));
  }, []);

  const savePushFields = React.useCallback(
    async (server: PushServerConfig) => {
      const local = pushServerLocalById[server.id];
      if (!local || !isPushFieldsDirty(server)) return;
      await onUpdatePushServer(server.id, {
        url: local.url,
        token: local.token,
        topic: local.topic,
        device_key: local.device_key,
        custom_body_template: local.custom_body_template,
      });
      setPushServerLocalById(prev => {
        const next = { ...prev };
        delete next[server.id];
        return next;
      });
    },
    [isPushFieldsDirty, onUpdatePushServer, pushServerLocalById],
  );

  const handleAddServer = React.useCallback((serverType: PushServerType) => {
    const newServer: PushServerConfig = {
      id: crypto.randomUUID(),
      enabled: true,
      type: serverType,
      url: serverType === 'ntfy' ? 'https://ntfy.sh' : serverType === 'bark' ? 'https://api.day.app' : '',
      token: null,
      topic: serverType === 'ntfy' ? 'atmos' : null,
      device_key: null,
      custom_body_template: null,
    };
    void onAddPushServer(newServer);
    setPushServersExpanded(true);
  }, [onAddPushServer]);

  const handleTestServer = async (serverId: string) => {
    const index = settings.push_servers.findIndex(s => s.id === serverId);
    if (index === -1) return;
    setTestingServerId(serverId);
    const result = await onTestPushServer(index);
    setTestingServerId(null);
    if (result.ok) {
      toastManager.add({ title: 'Test notification sent', type: 'success' });
    } else {
      toastManager.add({ title: 'Test failed', description: result.error ?? 'Unknown error', type: 'error' });
    }
  };

  const handleTestLocalChannel = async (channel: 'browser' | 'desktop') => {
    setTestingLocalChannel(channel);
    let ok = false;
    try {
      ok = channel === 'browser' ? await onTestBrowser() : await onTestDesktop();
    } finally {
      setTestingLocalChannel(null);
    }

    if (ok) {
      toastManager.add({ title: 'Test notification sent', type: 'success' });
      return;
    }

    toastManager.add({
      title: 'Test failed',
      description:
        channel === 'browser'
          ? 'Please allow notifications in your browser settings.'
          : 'The desktop app could not send a system notification.',
      type: 'error',
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="px-6 py-5">
          <p className="text-base font-medium text-foreground">Notification Channels</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Choose how you want to be notified when agents need attention.
          </p>
        </div>

        <div className="border-t border-border px-4">
          <div className="border-b border-border px-2 py-4 last:border-b-0">
            <div className="grid grid-cols-[minmax(0,1fr)_160px] gap-8">
              <div>
                <p className="text-sm font-medium text-foreground">Browser notifications</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Show native browser notifications when agents need attention.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2">
                {settings.browser_notification && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => void handleTestLocalChannel('browser')}
                    disabled={testingLocalChannel === 'browser'}
                  >
                    {testingLocalChannel === 'browser' ? 'Testing...' : 'Test'}
                  </Button>
                )}
                <Switch
                  checked={settings.browser_notification}
                  onCheckedChange={onToggleBrowser}
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>

          {isTauriRuntime() && (
            <div className="border-b border-border px-2 py-4 last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_160px] gap-8">
                <div>
                  <p className="text-sm font-medium text-foreground">Desktop notifications</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Show system-level notifications via the desktop app.
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  {settings.desktop_notification && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => void handleTestLocalChannel('desktop')}
                      disabled={testingLocalChannel === 'desktop'}
                    >
                      {testingLocalChannel === 'desktop' ? 'Testing...' : 'Test'}
                    </Button>
                  )}
                  <Switch
                    checked={settings.desktop_notification}
                    onCheckedChange={onToggleDesktop}
                    disabled={isSaving}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="px-6 py-5">
          <p className="text-base font-medium text-foreground">Event Triggers</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Select which agent events should trigger notifications.
          </p>
        </div>

        <div className="border-t border-border px-4">
          <div className="border-b border-border px-2 py-4 last:border-b-0">
            <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8">
              <div>
                <p className="text-sm font-medium text-foreground">Agent permission requested</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Notify when an agent is waiting for your approval to proceed.
                </p>
              </div>
              <div className="flex items-center justify-end">
                <Switch
                  checked={settings.notify_on_permission_request}
                  onCheckedChange={onTogglePermissionRequest}
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>

          <div className="border-b border-border px-2 py-4 last:border-b-0">
            <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-8">
              <div>
                <p className="text-sm font-medium text-foreground">Agent task complete</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Notify when an agent finishes running (running → idle).
                </p>
              </div>
              <div className="flex items-center justify-end">
                <Switch
                  checked={settings.notify_on_task_complete}
                  onCheckedChange={onToggleTaskComplete}
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <Collapsible
        open={pushServersExpanded}
        onOpenChange={setPushServersExpanded}
        className="overflow-hidden rounded-2xl border border-border"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5">
          <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
            <div className="flex items-start gap-3">
              <span className="relative mt-0.5 size-5 shrink-0">
                <Webhook className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
                <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
              </span>
              <div className="min-w-0">
                <p className="text-base font-medium text-foreground">Push Servers</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Forward notifications to self-hosted push services (ntfy, Bark, Gotify) or custom webhooks.
                </p>
              </div>
            </div>
          </CollapsibleTrigger>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-2 size-4" />
                Add Server
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              {PUSH_SERVER_TYPE_OPTIONS.map(option => (
                <DropdownMenuItem
                  key={option.value}
                  className="cursor-pointer items-start"
                  onClick={() => handleAddServer(option.value)}
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{option.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{option.description}</p>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <CollapsibleContent>
          {settings.push_servers.length === 0 ? (
            <div className="border-t border-border px-6 py-5 text-sm text-muted-foreground">
              No push servers configured yet. Click &quot;Add Server&quot; to get started.
            </div>
          ) : (
            <div className="border-t border-border px-4">
              {settings.push_servers.map((server) => {
                const typeLabel = PUSH_SERVER_TYPE_OPTIONS.find(o => o.value === server.type)?.label ?? server.type;
                const isTesting = testingServerId === server.id;
                const display = displayPushServer(server);
                const pushDirty = isPushFieldsDirty(server);

                return (
                  <div key={server.id} className="border-b border-border px-2 py-4 last:border-b-0 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {typeLabel}
                        </span>
                        <span className="text-sm truncate text-foreground">{display.url}</span>
                        {pushDirty && (
                          <span className="text-[10px] font-medium text-amber-600 dark:text-amber-500 shrink-0">
                            Unsaved
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {pushDirty && (
                          <SaveActionButton
                            saving={isSaving}
                            className="h-7 px-2 text-[11px]"
                            onClick={() => void savePushFields(server)}
                          />
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => void handleTestServer(server.id)}
                          disabled={isTesting || pushDirty}
                        >
                          {isTesting ? 'TESTING...' : 'TEST'}
                        </Button>
                        <Switch
                          checked={server.enabled}
                          onCheckedChange={(checked) => void onUpdatePushServer(server.id, { enabled: !!checked })}
                        />
                        <button
                          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => void onRemovePushServer(server.id)}
                          title="Remove server"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">URL</label>
                        <Input
                          value={display.url}
                          placeholder="https://..."
                          onChange={(e) => setPushFields(server, { url: e.target.value })}
                          className="h-8 text-xs font-mono"
                          disabled={isSaving}
                        />
                      </div>
                      {(server.type === 'ntfy' || server.type === 'gotify') && (
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Token</label>
                          <Input
                            value={display.token ?? ''}
                            placeholder="Optional auth token"
                            onChange={(e) => setPushFields(server, { token: e.target.value || null })}
                            className="h-8 text-xs font-mono"
                            disabled={isSaving}
                          />
                        </div>
                      )}
                      {server.type === 'ntfy' && (
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Topic</label>
                          <Input
                            value={display.topic ?? ''}
                            placeholder="atmos"
                            onChange={(e) => setPushFields(server, { topic: e.target.value || null })}
                            className="h-8 text-xs font-mono"
                            disabled={isSaving}
                          />
                        </div>
                      )}
                      {server.type === 'bark' && (
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Device Key</label>
                          <Input
                            value={display.device_key ?? ''}
                            placeholder="Your Bark device key"
                            onChange={(e) => setPushFields(server, { device_key: e.target.value || null })}
                            className="h-8 text-xs font-mono"
                            disabled={isSaving}
                          />
                        </div>
                      )}
                      {server.type === 'custom_webhook' && (
                        <>
                          <div>
                            <label className="mb-1 block text-xs text-muted-foreground">Auth Token</label>
                            <Input
                              value={display.token ?? ''}
                              placeholder="Optional Bearer token"
                              onChange={(e) => setPushFields(server, { token: e.target.value || null })}
                              className="h-8 text-xs font-mono"
                              disabled={isSaving}
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="mb-1 block text-xs text-muted-foreground">
                              Body template (optional, use {'{{title}}'}, {'{{body}}'}, {'{{tool}}'}, {'{{state}}'})
                            </label>
                            <Input
                              value={display.custom_body_template ?? ''}
                              placeholder='{"text": "{{title}}: {{body}}"}'
                              onChange={(e) => setPushFields(server, { custom_body_template: e.target.value || null })}
                              className="h-8 text-xs font-mono"
                              disabled={isSaving}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function SaveActionButton({
  saving,
  onClick,
  className,
}: {
  saving?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      onClick={onClick}
      disabled={saving}
      className={cn('h-8 rounded-lg px-3 shadow-sm', className)}
    >
      {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
      Save
    </Button>
  );
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  activeSectionOverride,
}) => {
  const installInFlightRef = React.useRef(false);
  const [status, setStatus] = useState<UpdateStatus>({ stage: 'idle' });
  const [isCheckingCliVersion, setIsCheckingCliVersion] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [activeSection, setActiveSection] = useQueryState('activeSettingTab', settingsModalParams.activeSettingTab);
  const [llmConfig, setLlmConfig] = useState<LlmProvidersFile | null>(null);
  const [isLlmConfigLoading, setIsLlmConfigLoading] = useState(false);
  const [providerDialogState, setProviderDialogState] = useState<{
    open: boolean;
    providerId: string | null;
  }>({ open: false, providerId: null });
  const [providersExpanded, setProvidersExpanded] = useState(true);
  const [routingExpanded, setRoutingExpanded] = useState(true);
  const [providerToggleId, setProviderToggleId] = useState<string | null>(null);
  const [routingSavingKey, setRoutingSavingKey] = useState<string | null>(null);
  const [sessionTitleFormatOpen, setSessionTitleFormatOpen] = useState(false);
  const [providerTests, setProviderTests] = useState<Record<string, {
    open: boolean;
    status: 'idle' | 'testing' | 'pass' | 'fail';
    output: string;
  }>>({});
  const providerTestUnsubscribeRef = useRef<Record<string, (() => void) | null>>({});
  // Code Agent settings persisted in ~/.atmos/agent/terminal_code_agent.json
  const [agentCustomSettings, setAgentCustomSettings] = useState<Record<string, { cmd?: string; flags?: string; enabled?: boolean }>>({});
  const [savedAgentCustomSettings, setSavedAgentCustomSettings] = useState<Record<string, { cmd?: string; flags?: string; enabled?: boolean }>>({});
  const [agentSettingsLoading, setAgentSettingsLoading] = useState(false);
  const [savingBuiltInAgentIds, setSavingBuiltInAgentIds] = useState<Record<string, boolean>>({});
  const [syncingBuiltInEnabledIds, setSyncingBuiltInEnabledIds] = useState<Record<string, boolean>>({});
  const [builtInAgentsExpanded, setBuiltInAgentsExpanded] = useState(false);
  const [customAgentsExpanded, setCustomAgentsExpanded] = useState(false);
  const [builtInAgentOpen, setBuiltInAgentOpen] = useState<Record<string, boolean>>({});
  const [customAgentOpen, setCustomAgentOpen] = useState<Record<string, boolean>>({});
  const [customAgents, setCustomAgents] = useState<CodeAgentCustomEntry[]>([]);
  const [savedCustomAgents, setSavedCustomAgents] = useState<CodeAgentCustomEntry[]>([]);
  const [savingCustomAgentIds, setSavingCustomAgentIds] = useState<Record<string, boolean>>({});
  const [syncingCustomEnabledIds, setSyncingCustomEnabledIds] = useState<Record<string, boolean>>({});
  const [removingCustomAgentIds, setRemovingCustomAgentIds] = useState<Record<string, boolean>>({});
  const [idleSessionTimeoutMins, setIdleSessionTimeoutMins] = useState<number>(30);
  const [savedIdleSessionTimeoutMins, setSavedIdleSessionTimeoutMins] = useState<number>(30);
  const [savingIdleTimeout, setSavingIdleTimeout] = useState(false);
  const {
    fileLinkOpenMode,
    fileLinkOpenApp,
    loadSettings: loadTerminalLinkSettings,
    setFileLinkOpenMode,
    setFileLinkOpenApp,
  } = useTerminalLinkSettings();

  useEffect(() => {
    if (!isTauriRuntime()) return;
    import('@tauri-apps/api/app').then(({ getVersion }) =>
      getVersion().then(setAppVersion)
    ).catch(() => {});
  }, []);

  useEffect(() => {
    void loadTerminalLinkSettings();
  }, [loadTerminalLinkSettings]);

  // Load agent custom settings when modal opens
  const loadAgentSettings = React.useCallback(async () => {
    setAgentSettingsLoading(true);
    try {
      const customData = await codeAgentCustomApi.get();
      const allAgents = dedupeCodeAgentEntries(
        Array.isArray(customData?.agents) ? customData.agents : [],
      );
      const builtInEntries = allAgents.filter((agent) => isBuiltInAgentId(agent.id));
      const customEntries = allAgents.filter((agent) => !isBuiltInAgentId(agent.id));
      const builtInOverrides = buildBuiltInOverrides(builtInEntries);

      setAgentCustomSettings(builtInOverrides);
      setSavedAgentCustomSettings(builtInOverrides);
      setCustomAgents(customEntries);
      setSavedCustomAgents(customEntries);
      setBuiltInAgentsExpanded(false);
      setCustomAgentsExpanded(false);
      setBuiltInAgentOpen({});
      setCustomAgentOpen({});

      const behaviourData = await agentBehaviourSettingsApi.get();
      const timeout = behaviourData?.idle_session_timeout_mins ?? 30;
      setIdleSessionTimeoutMins(timeout);
      setSavedIdleSessionTimeoutMins(timeout);
    } catch {
      // ignore
    } finally {
      setAgentSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void loadAgentSettings();
  }, [isOpen, loadAgentSettings]);

  const {
    settings: notifySettings,
    isLoading: isNotifyLoading,
    isSaving: isNotifySaving,
    loadSettings: loadNotifySettings,
    updateField: updateNotifyField,
    addPushServer,
    removePushServer,
    updatePushServer,
    testPushServer,
  } = useNotificationSettings();

  useEffect(() => {
    if (!isOpen) return;
    void loadNotifySettings();
  }, [isOpen, loadNotifySettings]);

  useEffect(() => {
    if (!isOpen || !activeSectionOverride) return;
    void setActiveSection(activeSectionOverride);
  }, [activeSectionOverride, isOpen, setActiveSection]);

  const persistCodeAgents = React.useCallback(async (agents: CodeAgentCustomEntry[]) => {
    const nextAgents = dedupeCodeAgentEntries(agents);
    await codeAgentCustomApi.update(nextAgents);
    return nextAgents;
  }, []);

  const handleAgentSettingChange = React.useCallback((agentId: string, field: 'cmd' | 'flags' | 'enabled', value: string | boolean) => {
    setAgentCustomSettings((prev) => ({
      ...prev,
      [agentId]: { ...prev[agentId], [field]: value },
    }));
  }, []);

  const handleSaveBuiltInAgent = React.useCallback(async (agentId: string) => {
    const nextBuiltInSettings = {
      ...savedAgentCustomSettings,
      [agentId]: agentCustomSettings[agentId] ?? {},
    };

    if (
      (nextBuiltInSettings[agentId]?.cmd ?? AGENT_OPTIONS.find((agent) => agent.id === agentId)?.cmd) ===
        AGENT_OPTIONS.find((agent) => agent.id === agentId)?.cmd &&
      (nextBuiltInSettings[agentId]?.flags ?? (AGENT_OPTIONS.find((agent) => agent.id === agentId)?.params || '')) ===
        (AGENT_OPTIONS.find((agent) => agent.id === agentId)?.params || '')
    ) {
      delete nextBuiltInSettings[agentId];
    }

    setSavingBuiltInAgentIds((prev) => ({ ...prev, [agentId]: true }));
    try {
      const nextBuiltInEntries = buildBuiltInEntries(nextBuiltInSettings);
      await persistCodeAgents([
        ...savedCustomAgents,
        ...nextBuiltInEntries,
      ]);
      setSavedAgentCustomSettings(nextBuiltInSettings);
    } catch (error) {
      toastManager.add({
        title: 'Failed to save built-in agent',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      });
    } finally {
      setSavingBuiltInAgentIds((prev) => {
        const next = { ...prev };
        delete next[agentId];
        return next;
      });
    }
  }, [agentCustomSettings, persistCodeAgents, savedAgentCustomSettings, savedCustomAgents]);

  const handleBuiltInEnabledChange = React.useCallback(async (agentId: string, enabled: boolean) => {
    const previousEnabled = savedAgentCustomSettings[agentId]?.enabled ?? true;
    setAgentCustomSettings((prev) => ({
      ...prev,
      [agentId]: { ...prev[agentId], enabled },
    }));
    setSyncingBuiltInEnabledIds((prev) => ({ ...prev, [agentId]: true }));

    const nextSavedBuiltInSettings = {
      ...savedAgentCustomSettings,
      [agentId]: { ...savedAgentCustomSettings[agentId], enabled },
    };

    if (
      (nextSavedBuiltInSettings[agentId]?.cmd ?? AGENT_OPTIONS.find((agent) => agent.id === agentId)?.cmd) ===
        AGENT_OPTIONS.find((agent) => agent.id === agentId)?.cmd &&
      (nextSavedBuiltInSettings[agentId]?.flags ?? (AGENT_OPTIONS.find((agent) => agent.id === agentId)?.params || '')) ===
        (AGENT_OPTIONS.find((agent) => agent.id === agentId)?.params || '') &&
      (nextSavedBuiltInSettings[agentId]?.enabled ?? true) === true
    ) {
      delete nextSavedBuiltInSettings[agentId];
    }

    try {
      await persistCodeAgents([
        ...savedCustomAgents,
        ...buildBuiltInEntries(nextSavedBuiltInSettings),
      ]);
      setSavedAgentCustomSettings(nextSavedBuiltInSettings);
    } catch (error) {
      setAgentCustomSettings((prev) => ({
        ...prev,
        [agentId]: { ...prev[agentId], enabled: previousEnabled },
      }));
      toastManager.add({
        title: 'Failed to update agent visibility',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      });
    } finally {
      setSyncingBuiltInEnabledIds((prev) => {
        const next = { ...prev };
        delete next[agentId];
        return next;
      });
    }
  }, [persistCodeAgents, savedAgentCustomSettings, savedCustomAgents]);

  const handleAddCustomAgent = React.useCallback(() => {
    const id = `custom_${Date.now()}`;
    setCustomAgents((prev) => {
      return [...prev, { id, label: '', cmd: '', flags: '', enabled: true }];
    });
    setCustomAgentsExpanded(true);
    setCustomAgentOpen((prev) => ({ ...prev, [id]: true }));
  }, []);

  const handleRemoveCustomAgent = React.useCallback((id: string) => {
    const wasSaved = savedCustomAgents.some((agent) => agent.id === id);
    setCustomAgents((prev) => prev.filter((agent) => agent.id !== id));
    setCustomAgentOpen((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    if (!wasSaved) return;

    setRemovingCustomAgentIds((prev) => ({ ...prev, [id]: true }));
    const nextSavedCustomAgents = savedCustomAgents.filter((agent) => agent.id !== id);
    void persistCodeAgents([
      ...buildBuiltInEntries(savedAgentCustomSettings),
      ...nextSavedCustomAgents,
    ]).then(() => {
      setSavedCustomAgents(nextSavedCustomAgents);
    }).catch((error) => {
      toastManager.add({
        title: 'Failed to remove custom agent',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      });
      void loadAgentSettings();
    }).finally(() => {
      setRemovingCustomAgentIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });
  }, [loadAgentSettings, persistCodeAgents, savedAgentCustomSettings, savedCustomAgents]);

  const handleCustomAgentChange = React.useCallback((id: string, field: keyof CodeAgentCustomEntry, value: string | boolean) => {
    setCustomAgents((prev) => {
      return prev.map((agent) => (agent.id === id ? { ...agent, [field]: value } : agent));
    });
  }, []);

  const handleSaveCustomAgent = React.useCallback(async (id: string) => {
    const currentAgent = customAgents.find((agent) => agent.id === id);
    if (!currentAgent) return;

    if (!currentAgent.label.trim() || !currentAgent.cmd.trim()) {
      toastManager.add({
        title: 'Custom agent is incomplete',
        description: 'Name and command are required before saving.',
        type: 'error',
      });
      return;
    }

    setSavingCustomAgentIds((prev) => ({ ...prev, [id]: true }));
    try {
      const normalizedAgent: CodeAgentCustomEntry = {
        ...currentAgent,
        label: currentAgent.label.trim(),
        cmd: currentAgent.cmd.trim(),
        flags: currentAgent.flags.trim(),
        enabled: currentAgent.enabled !== false,
      };
      const nextSavedCustomAgents = dedupeCodeAgentEntries([
        ...savedCustomAgents.filter((agent) => agent.id !== id),
        normalizedAgent,
      ]).filter((agent) => !isBuiltInAgentId(agent.id));

      await persistCodeAgents([
        ...buildBuiltInEntries(savedAgentCustomSettings),
        ...nextSavedCustomAgents,
      ]);

      setCustomAgents((prev) => prev.map((agent) => (
        agent.id === id ? normalizedAgent : agent
      )));
      setSavedCustomAgents(nextSavedCustomAgents);
    } catch (error) {
      toastManager.add({
        title: 'Failed to save custom agent',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      });
    } finally {
      setSavingCustomAgentIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }, [customAgents, persistCodeAgents, savedAgentCustomSettings, savedCustomAgents]);

  const handleCustomAgentEnabledChange = React.useCallback(async (id: string, enabled: boolean) => {
    const savedAgent = savedCustomAgents.find((agent) => agent.id === id);
    setCustomAgents((prev) => prev.map((agent) => (
      agent.id === id ? { ...agent, enabled } : agent
    )));

    if (!savedAgent) return;

    setSyncingCustomEnabledIds((prev) => ({ ...prev, [id]: true }));
    const nextSavedCustomAgents = savedCustomAgents.map((agent) => (
      agent.id === id ? { ...agent, enabled } : agent
    ));

    try {
      await persistCodeAgents([
        ...buildBuiltInEntries(savedAgentCustomSettings),
        ...nextSavedCustomAgents,
      ]);
      setSavedCustomAgents(nextSavedCustomAgents);
    } catch (error) {
      setCustomAgents((prev) => prev.map((agent) => (
        agent.id === id ? { ...agent, enabled: savedAgent.enabled !== false } : agent
      )));
      toastManager.add({
        title: 'Failed to update agent visibility',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      });
    } finally {
      setSyncingCustomEnabledIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }, [persistCodeAgents, savedAgentCustomSettings, savedCustomAgents]);

  const loadLlmConfig = React.useCallback(async () => {
    setIsLlmConfigLoading(true);
    try {
      const config = await llmProvidersApi.get();
      setLlmConfig(config);
    } catch (error) {
      toastManager.add({
        title: 'Failed to load LLM settings',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      });
    } finally {
      setIsLlmConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void loadLlmConfig();
  }, [isOpen, loadLlmConfig]);

  useEffect(() => {
    const testUnsubscribeRef = providerTestUnsubscribeRef;
    return () => {
      const unsubscribers = Object.values(testUnsubscribeRef.current);
      unsubscribers.forEach((unsubscribe) => {
        unsubscribe?.();
      });
    };
  }, []);

  const handleInstallUpdate = async (toastId?: string) => {
    if (installInFlightRef.current) {
      return;
    }
    installInFlightRef.current = true;

    if (toastId) {
      toastManager.update(toastId, {
        title: 'Preparing install…',
        description: 'Starting the updater.',
        type: 'loading',
        timeout: 0,
      });
    }

    await downloadAndInstallUpdate((nextStatus) => {
      setStatus(nextStatus);

      if (!toastId) {
        return;
      }

      if (nextStatus.stage === 'downloading') {
        toastManager.update(toastId, {
          title: 'Downloading update…',
          description: nextStatus.total
            ? `${Math.round((nextStatus.downloaded / nextStatus.total) * 100)}% downloaded`
            : 'Downloading the latest version…',
          type: 'loading',
          timeout: 0,
        });
        return;
      }

      if (nextStatus.stage === 'installing') {
        toastManager.update(toastId, {
          title: 'Installing update…',
          description: 'Atmos will restart when installation finishes.',
          type: 'loading',
          timeout: 0,
        });
        return;
      }

      if (nextStatus.stage === 'upToDate') {
        installInFlightRef.current = false;
        toastManager.update(toastId, {
          title: 'Already up to date',
          description: 'No installable update is available.',
          type: 'info',
          timeout: 4000,
        });
        return;
      }

      if (nextStatus.stage === 'done') {
        installInFlightRef.current = false;
        toastManager.update(toastId, {
          title: 'Restarting Atmos…',
          description: 'The update has been installed.',
          type: 'success',
          timeout: 2500,
        });
        return;
      }

      if (nextStatus.stage === 'error') {
        installInFlightRef.current = false;
        toastManager.update(toastId, {
          title: 'Update install failed',
          description: nextStatus.message,
          type: 'error',
          timeout: 6000,
        });
      }
    });
  };

  const handleCheckForUpdate = async () => {
    let latestStage = 'idle';
    let latestErrorMessage: string | undefined;
    const toastId = toastManager.add({
      title: 'Checking for updates…',
      description: 'Querying the desktop updater.',
      type: 'loading',
      timeout: 0,
    });

    const info = await checkForUpdate((nextStatus) => {
      latestStage = nextStatus.stage;
      latestErrorMessage = nextStatus.stage === 'error' ? nextStatus.message : undefined;
      setStatus(nextStatus);
    });

    if (latestStage === 'error') {
      toastManager.update(toastId, {
        title: 'Update check failed',
        description: latestErrorMessage ?? 'Unable to check for updates.',
        type: 'error',
        timeout: 6000,
      });
      return;
    }

    if (latestStage === 'available' && info) {
      toastManager.update(toastId, {
        title: `Version ${info.version} is available`,
        description: (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              A newer desktop version is ready to install.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <a
                  href={getUpdateReleaseNotesUrl(info)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-1.5 size-3.5" />
                  What&apos;s New
                </a>
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  void handleInstallUpdate(toastId);
                }}
              >
                <Download className="mr-1.5 size-3.5" />
                Install
              </Button>
            </div>
          </div>
        ),
        type: 'info',
        timeout: 0,
      });
      return;
    }

    toastManager.update(toastId, {
      title: 'Already up to date',
      description: 'You are already on the latest available version.',
      type: 'success',
      timeout: 4000,
    });
  };

  const handleCheckCliVersion = async () => {
    setIsCheckingCliVersion(true);
    const toastId = toastManager.add({
      title: 'Checking Atmos CLI…',
      description: 'Querying the installed CLI and latest GitHub release.',
      type: 'loading',
      timeout: 0,
    });

    try {
      const result = await systemApi.checkCliVersion();

      if (!result.installed) {
        toastManager.update(toastId, {
          title: 'Atmos CLI not installed',
          description: 'The local Atmos CLI was not found in ~/.atmos/bin.',
          type: 'error',
          timeout: 6000,
        });
        return;
      }

      if (result.update_available) {
        toastManager.update(toastId, {
          title: `Atmos CLI ${result.latest_version} is available`,
          description: (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Installed version: {result.current_version ?? 'unknown'}.
              </p>
              {result.release_url ? (
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={result.release_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-1.5 size-3.5" />
                    View Release
                  </a>
                </Button>
              ) : null}
            </div>
          ),
          type: 'info',
          timeout: 0,
        });
        return;
      }

      toastManager.update(toastId, {
        title: 'Atmos CLI is up to date',
        description: result.current_version
          ? `Installed version: ${result.current_version}.`
          : 'No newer CLI release was found.',
        type: 'success',
        timeout: 4000,
      });
    } catch (error) {
      toastManager.update(toastId, {
        title: 'CLI version check failed',
        description: error instanceof Error ? error.message : 'Unable to check Atmos CLI version.',
        type: 'error',
        timeout: 6000,
      });
    } finally {
      setIsCheckingCliVersion(false);
    }
  };

  const isChecking = status.stage === 'checking';
  const isDownloading = status.stage === 'downloading';
  const isInstalling = status.stage === 'installing';
  const resolvedActiveSection = activeSection ?? 'about';
  const activeSectionMeta = SETTINGS_SECTIONS.find((section) => section.id === resolvedActiveSection) ?? SETTINGS_SECTIONS[0];
  const activeTerminalLinkMode =
    TERMINAL_LINK_MODE_OPTIONS.find((option) => option.value === fileLinkOpenMode) ?? TERMINAL_LINK_MODE_OPTIONS[0];
  const activeQuickOpenApp = QUICK_OPEN_APP_MAP[fileLinkOpenApp];
  const providerEntries = React.useMemo(
    () =>
      Object.entries(llmConfig?.providers ?? {}).map(([id, provider]) => ({
        id,
        label: provider.displayName?.trim() || fallbackProviderLabel(id),
        enabled: provider.enabled,
        model: provider.model?.trim() || null,
        kind: provider.kind,
      })),
    [llmConfig],
  );
  const sessionTitleFormat = React.useMemo(
    () => normalizeSessionTitleFormat(llmConfig?.features?.session_title_format),
    [llmConfig],
  );

  const handleProviderEnabledChange = React.useCallback(async (providerId: string, enabled: boolean) => {
    if (!llmConfig?.providers?.[providerId]) return;

    const nextConfig: LlmProvidersFile = {
      ...llmConfig,
      providers: {
        ...llmConfig.providers,
        [providerId]: {
          ...llmConfig.providers[providerId],
          enabled,
        },
      },
    };

    setProviderToggleId(providerId);
    setLlmConfig(nextConfig);

    try {
      await llmProvidersApi.update(nextConfig);
    } catch (error) {
      setLlmConfig(llmConfig);
      toastManager.add({
        title: 'Failed to update provider',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      });
    } finally {
      setProviderToggleId(null);
    }
  }, [llmConfig]);

  const handleLlmConfigUpdate = React.useCallback(async (
    key: string,
    updater: (current: LlmProvidersFile) => LlmProvidersFile,
  ) => {
    if (!llmConfig) return;

    const previousConfig = llmConfig;
    const nextConfig = updater(previousConfig);

    setRoutingSavingKey(key);
    setLlmConfig(nextConfig);

    try {
      await llmProvidersApi.update(nextConfig);
    } catch (error) {
      setLlmConfig(previousConfig);
      toastManager.add({
        title: 'Failed to update routing',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      });
    } finally {
      setRoutingSavingKey(null);
    }
  }, [llmConfig]);

  const runProviderTest = React.useCallback(async (
    providerId: string,
    provider: NonNullable<LlmProvidersFile['providers'][string]>,
  ) => {
    providerTestUnsubscribeRef.current[providerId]?.();

    const streamId = crypto.randomUUID();
    let streamedOutput = '';

    setProviderTests((current) => ({
      ...current,
      [providerId]: {
        open: true,
        status: 'testing',
        output: '',
      },
    }));

    providerTestUnsubscribeRef.current[providerId] = useWebSocketStore
      .getState()
      .onEvent('llm_provider_test_chunk', (payload) => {
        if (
          typeof payload !== 'object' ||
          payload === null ||
          (payload as { stream_id?: unknown }).stream_id !== streamId
        ) {
          return;
        }

        const chunk = (payload as { chunk?: unknown }).chunk;
        if (typeof chunk !== 'string' || chunk.length === 0) return;

        streamedOutput += chunk;
        setProviderTests((current) => ({
          ...current,
          [providerId]: {
            open: true,
            status: 'testing',
            output: streamedOutput,
          },
        }));
      });

    try {
      const result = await llmProvidersApi.testProvider({
        stream_id: streamId,
        provider_id: providerId,
        provider,
      });
      setProviderTests((current) => ({
        ...current,
        [providerId]: {
          open: true,
          status: 'pass',
          output: streamedOutput || result.text || '',
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setProviderTests((current) => ({
        ...current,
        [providerId]: {
          open: true,
          status: 'fail',
          output: streamedOutput
            ? `${streamedOutput}\n\n[ERROR] ${message}`
            : `[ERROR] ${message}`,
        },
      }));
    } finally {
      providerTestUnsubscribeRef.current[providerId]?.();
      providerTestUnsubscribeRef.current[providerId] = null;
    }
  }, []);

  const sectionIconRefs = React.useRef<Record<string, React.RefObject<any>>>({});
  for (const section of SETTINGS_SECTIONS) {
    if (!sectionIconRefs.current[section.id]) {
      sectionIconRefs.current[section.id] = React.createRef();
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()} className="h-[min(90vh,820px)] w-[min(96vw,1360px)] max-w-[min(96vw,1360px)] overflow-hidden border-border bg-background p-0 sm:!max-w-[min(96vw,1360px)]">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Manage ATMOS settings, product information, and desktop updates.
        </DialogDescription>

        <div className="grid h-full min-h-0 grid-cols-[240px_minmax(0,1fr)]">
          <aside className="h-full min-h-0 border-r border-border bg-background text-sidebar-foreground">
            <MotionSidebarProvider className="h-full min-h-0">
              <MotionSidebar
                collapsible="none"
                className="h-full w-full border-0 bg-transparent text-sidebar-foreground"
                containerClassName="h-full"
              >
                <MotionSidebarHeader className="gap-0 border-b border-border px-5 py-5">
                  <p className="text-[12px] font-semibold text-sidebar-foreground/70">
                    Settings
                  </p>
                  <p className="mt-2 text-xs text-sidebar-foreground/70">
                    Setting atmos to personalize your experience.
                  </p>
                </MotionSidebarHeader>

                <MotionSidebarContent className="overflow-y-auto p-3">
                  <MotionSidebarMenu>
                    {SETTINGS_SECTIONS.map((section) => {
                      const isActive = resolvedActiveSection === section.id;
                      const iconRef = sectionIconRefs.current[section.id];

                      return (
                        <MotionSidebarMenuItem key={section.id}>
                          <MotionSidebarMenuButton
                            type="button"
                            isActive={isActive}
                            onClick={() => void setActiveSection(section.id)}
                            className="h-10 gap-3 rounded-lg px-3 text-left"
                            onMouseEnter={() => iconRef.current?.startAnimation?.()}
                            onMouseLeave={() => iconRef.current?.stopAnimation?.()}
                          >
                            {section.id === 'code-agent' && <BotIcon ref={iconRef} className="shrink-0" size={16} />}
                            {section.id === 'workspace' && <FolderKanbanIcon ref={iconRef} className="shrink-0" size={16} />}
                            {section.id === 'notify' && <BellIcon ref={iconRef} className="shrink-0" size={16} />}
                            {section.id === 'about' && <InfoCircleIcon ref={iconRef} className="shrink-0" size={16} />}
                            {section.id === 'terminal' && <TerminalIcon ref={iconRef} className="shrink-0" size={16} />}
                            {section.id === 'ai' && <BrainCircuitIcon ref={iconRef} className="shrink-0" size={16} />}
                            {section.id === 'remote-access' && <WorldIcon ref={iconRef} className="shrink-0" size={16} />}
                            <span className="min-w-0 truncate text-sm font-medium">{section.label}</span>
                          </MotionSidebarMenuButton>
                        </MotionSidebarMenuItem>
                      );
                    })}
                  </MotionSidebarMenu>
                </MotionSidebarContent>
              </MotionSidebar>
            </MotionSidebarProvider>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="px-8 py-4">
              <h2 className="text-[28px] font-semibold tracking-tight text-foreground">
                {activeSectionMeta.label}
              </h2>
              <p className="mt-1 max-w-md text-sm leading-5 text-muted-foreground">
                {activeSectionMeta.description}
              </p>
            </div>
            <div className="px-8">
              <div className="border-b border-border" />
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              <ScrollArea className="size-full">
                <div className="px-8 py-6">
                {resolvedActiveSection === 'about' ? (
                  <>
                    <div className="mb-10 mt-4">
                      <AtmosWordmark className="w-full" />
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-border">
                      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 border-b border-border px-6 py-5">
                        <div>
                          <p className="text-base font-medium text-foreground">Runtime</p>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            Current environment that is rendering this settings panel.
                          </p>
                        </div>
                        <div className="flex items-center text-sm font-medium text-foreground">
                          {isTauriRuntime() ? 'Desktop' : 'Web'}
                        </div>
                      </div>

                      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 border-b border-border px-6 py-5">
                        <div>
                          <p className="text-base font-medium text-foreground">Version</p>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            Current app version reported by the desktop runtime.
                          </p>
                        </div>
                        <div className="flex items-center text-sm font-medium text-foreground">
                          {appVersion || 'Unavailable'}
                        </div>
                      </div>

                      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 border-b border-border px-6 py-5">
                        <div>
                          <p className="text-base font-medium text-foreground">Atmos CLI</p>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            Check for the latest CLI updates.
                          </p>
                        </div>
                        <div className="flex items-center">
                          <Button
                            variant="outline"
                            onClick={handleCheckCliVersion}
                            disabled={isCheckingCliVersion}
                            className="cursor-pointer"
                          >
                            {isCheckingCliVersion ? (
                              <LoaderCircle className="mr-2 size-4 animate-spin" />
                            ) : (
                              <RotateCw className="mr-2 size-4" />
                            )}
                            Check for Updates
                          </Button>
                        </div>
                      </div>

                      {isTauriRuntime() && (
                        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 px-6 py-5">
                          <div>
                            <p className="text-base font-medium text-foreground">Check for updates</p>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                              Query the desktop updater for the latest available release.
                            </p>
                          </div>
                          <div className="flex items-center">
                            <Button
                              variant="outline"
                              onClick={handleCheckForUpdate}
                              disabled={isChecking || isDownloading || isInstalling}
                              className="cursor-pointer"
                            >
                              <RotateCw className="mr-2 size-4" />
                              Check for Updates
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : resolvedActiveSection === 'terminal' ? (
                  <div className="overflow-hidden rounded-2xl border border-border">
                    <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 border-b border-border px-6 py-5">
                      <div>
                        <p className="text-base font-medium text-foreground">File link open mode</p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          Choose how terminal file and directory links should open when clicked.
                        </p>
                      </div>
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
                            {TERMINAL_LINK_MODE_OPTIONS.map((option) => (
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
                    </div>
                  </div>
                ) : resolvedActiveSection === 'code-agent' ? (
                  <div className="space-y-4">
                    <Collapsible
                      open={builtInAgentsExpanded}
                      onOpenChange={setBuiltInAgentsExpanded}
                      className="overflow-hidden rounded-2xl border border-border"
                    >
                      <div className="flex items-start justify-between gap-4 px-6 py-5">
                        <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
                          <div className="flex items-start gap-3">
                            <span className="relative mt-0.5 size-5 shrink-0">
                              <Package className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
                              <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-base font-medium text-foreground">Built-in Agents</p>
                              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                Customize the startup command and parameters for each built-in code agent.
                              </p>
                            </div>
                          </div>
                        </CollapsibleTrigger>
                      </div>

                      <CollapsibleContent>
                        {agentSettingsLoading ? (
                          <div className="space-y-3 border-t border-border px-6 py-4">
                            <Skeleton className="h-14 w-full rounded-xl" />
                            <Skeleton className="h-14 w-full rounded-xl" />
                            <Skeleton className="h-14 w-full rounded-xl" />
                          </div>
                        ) : (
                          <div className="border-t border-border px-4">
                            {AGENT_OPTIONS.map((agent) => {
                              const custom = agentCustomSettings[agent.id];
                              const isOpen = builtInAgentOpen[agent.id] ?? false;
                              const savedAgent = savedAgentCustomSettings[agent.id];
                              const isDirty =
                                (savedAgent?.cmd ?? agent.cmd) !== (custom?.cmd ?? agent.cmd) ||
                                (savedAgent?.flags ?? (agent.params || '')) !== (custom?.flags ?? (agent.params || ''));
                              const isSaving = !!savingBuiltInAgentIds[agent.id];
                              const isSyncingEnabled = !!syncingBuiltInEnabledIds[agent.id];
                              const enabled = custom?.enabled ?? true;
                              const summary = [custom?.cmd ?? agent.cmd, custom?.flags ?? (agent.params || '')]
                                .filter(Boolean)
                                .join(' ');

                              return (
                                <Collapsible
                                  key={agent.id}
                                  open={isOpen}
                                  onOpenChange={(open) => setBuiltInAgentOpen((prev) => ({ ...prev, [agent.id]: open }))}
                                  className="border-b border-border px-2 py-4 last:border-b-0"
                                >
                                  <div className="flex items-center gap-3">
                                    <CollapsibleTrigger className="group flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
                                      <span className="relative size-5 shrink-0">
                                        <span className="absolute inset-0 transition-opacity duration-150 group-hover:opacity-0">
                                          <AgentIcon
                                            registryId={agent.id}
                                            name={agent.label}
                                            size={20}
                                          />
                                        </span>
                                        <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-foreground">{agent.label}</p>
                                        <p className="mt-1 truncate text-xs text-muted-foreground">
                                          {summary || 'No parameters'}
                                        </p>
                                      </div>
                                    </CollapsibleTrigger>

                                    <div className="flex items-center gap-3">
                                      {(isDirty || isSaving) && (
                                        <SaveActionButton
                                          saving={isSaving}
                                          onClick={() => void handleSaveBuiltInAgent(agent.id)}
                                        />
                                      )}
                                      <Switch
                                        checked={enabled}
                                        disabled={isSyncingEnabled}
                                        onCheckedChange={(checked) => {
                                          void handleBuiltInEnabledChange(agent.id, !!checked);
                                        }}
                                      />
                                    </div>
                                  </div>

                                  <CollapsibleContent>
                                    <div className="grid grid-cols-2 gap-3 pt-4">
                                      <div>
                                        <label className="mb-1 block text-xs text-muted-foreground">Command</label>
                                        <Input
                                          value={custom?.cmd ?? agent.cmd}
                                          placeholder={agent.cmd}
                                          onChange={(e) => handleAgentSettingChange(agent.id, 'cmd', e.target.value)}
                                          className="h-9 text-sm font-mono"
                                        />
                                      </div>
                                      <div>
                                        <label className="mb-1 block text-xs text-muted-foreground">Parameters</label>
                                        <Input
                                          value={custom?.flags ?? (agent.params || '')}
                                          placeholder={agent.params || 'No default parameters'}
                                          onChange={(e) => handleAgentSettingChange(agent.id, 'flags', e.target.value)}
                                          className="h-9 text-sm font-mono"
                                        />
                                      </div>
                                    </div>
                                  </CollapsibleContent>
                                </Collapsible>
                              );
                            })}
                          </div>
                        )}
                      </CollapsibleContent>
                    </Collapsible>

                    <Collapsible
                      open={customAgentsExpanded}
                      onOpenChange={setCustomAgentsExpanded}
                      className="overflow-hidden rounded-2xl border border-border"
                    >
                      <div className="flex items-start justify-between gap-4 px-6 py-5">
                        <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
                          <div className="flex items-start gap-3">
                            <span className="relative mt-0.5 size-5 shrink-0">
                              <UserCog className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
                              <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-base font-medium text-foreground">Custom Agents</p>
                              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                Add your own agents with custom commands and parameters.
                              </p>
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <Button variant="outline" onClick={handleAddCustomAgent}>
                          <Plus className="mr-2 size-4" />
                          Add Agent
                        </Button>
                      </div>

                      <CollapsibleContent>
                        {customAgents.length === 0 ? (
                          <div className="border-t border-border px-6 py-5 text-sm text-muted-foreground">
                            No custom agents configured yet. Click &quot;Add Agent&quot; to create one.
                          </div>
                        ) : (
                          <div className="border-t border-border px-4">
                            {customAgents.map((agent) => {
                              const isOpen = customAgentOpen[agent.id] ?? false;
                              const savedAgent = savedCustomAgents.find((item) => item.id === agent.id);
                              const isDirty =
                                !savedAgent ||
                                savedAgent.label !== agent.label ||
                                savedAgent.cmd !== agent.cmd ||
                                savedAgent.flags !== agent.flags;
                              const isSaving = !!savingCustomAgentIds[agent.id];
                              const isSyncingEnabled = !!syncingCustomEnabledIds[agent.id];
                              const isRemoving = !!removingCustomAgentIds[agent.id];
                              const enabled = agent.enabled !== false;
                              const summary = [agent.cmd, agent.flags].filter(Boolean).join(' ');

                              return (
                                <Collapsible
                                  key={agent.id}
                                  open={isOpen}
                                  onOpenChange={(open) => setCustomAgentOpen((prev) => ({ ...prev, [agent.id]: open }))}
                                  className="border-b border-border px-2 py-4 last:border-b-0"
                                >
                                  <div className="flex items-center gap-3">
                                    <CollapsibleTrigger className="group flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
                                      <span className="relative size-5 shrink-0">
                                        <Bot className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
                                        <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-foreground">
                                          {agent.label || 'New Agent'}
                                        </p>
                                        <p className="mt-1 truncate text-xs text-muted-foreground">
                                          {summary || 'No parameters'}
                                        </p>
                                      </div>
                                    </CollapsibleTrigger>

                                    <div className="flex items-center gap-3">
                                      {(isDirty || isSaving) && (
                                        <SaveActionButton
                                          saving={isSaving}
                                          onClick={() => void handleSaveCustomAgent(agent.id)}
                                        />
                                      )}
                                      <Switch
                                        checked={enabled}
                                        disabled={isSyncingEnabled}
                                        onCheckedChange={(checked) => {
                                          void handleCustomAgentEnabledChange(agent.id, !!checked);
                                        }}
                                      />
                                    </div>
                                    <button
                                      className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                      onClick={() => handleRemoveCustomAgent(agent.id)}
                                      title="Remove agent"
                                      disabled={isRemoving}
                                    >
                                      {isRemoving ? (
                                        <LoaderCircle className="size-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="size-4" />
                                      )}
                                    </button>
                                  </div>

                                  <CollapsibleContent>
                                    <div className="space-y-3 pt-4">
                                      <div>
                                        <label className="mb-1 block text-xs text-muted-foreground">Name</label>
                                        <Input
                                          value={agent.label}
                                          placeholder="Agent name"
                                          onChange={(e) => handleCustomAgentChange(agent.id, 'label', e.target.value)}
                                          className="h-9 text-sm font-medium"
                                        />
                                      </div>
                                      <div className="grid grid-cols-2 gap-3">
                                        <div>
                                          <label className="mb-1 block text-xs text-muted-foreground">Command</label>
                                          <Input
                                            value={agent.cmd}
                                            placeholder="e.g. my-agent"
                                            onChange={(e) => handleCustomAgentChange(agent.id, 'cmd', e.target.value)}
                                            className="h-9 text-sm font-mono"
                                          />
                                        </div>
                                        <div>
                                          <label className="mb-1 block text-xs text-muted-foreground">Parameters</label>
                                          <Input
                                            value={agent.flags}
                                            placeholder="e.g. --yolo"
                                            onChange={(e) => handleCustomAgentChange(agent.id, 'flags', e.target.value)}
                                            className="h-9 text-sm font-mono"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </CollapsibleContent>
                                </Collapsible>
                              );
                            })}
                          </div>
                        )}
                      </CollapsibleContent>
                    </Collapsible>

                    <AgentHookStatusCard />

                    {/* Behaviour: idle session cleanup */}
                    <div className="overflow-hidden rounded-2xl border border-border">
                      <div className="flex items-start justify-between gap-4 px-6 py-5">
                        <div className="min-w-0">
                          <p className="text-base font-medium text-foreground">Behaviour</p>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            Configure how idle agent sessions are managed in memory.
                          </p>
                        </div>
                      </div>
                      <div className="border-t border-border px-6 py-5">
                        <div className="flex items-center justify-between gap-6">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">Idle session cleanup</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Idle agent sessions older than this duration are automatically removed every 5 minutes.
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Input
                              type="number"
                              min={1}
                              max={1440}
                              value={idleSessionTimeoutMins}
                              onChange={(e) => setIdleSessionTimeoutMins(Math.max(1, Number(e.target.value)))}
                              className="h-8 w-20 text-center text-sm"
                            />
                            <span className="text-sm text-muted-foreground whitespace-nowrap">min</span>
                            {idleSessionTimeoutMins !== savedIdleSessionTimeoutMins && (
                              <Button
                                size="sm"
                                disabled={savingIdleTimeout}
                                onClick={async () => {
                                  setSavingIdleTimeout(true);
                                  try {
                                    await agentBehaviourSettingsApi.update({ idle_session_timeout_mins: idleSessionTimeoutMins });
                                    setSavedIdleSessionTimeoutMins(idleSessionTimeoutMins);
                                  } catch { /* ignore */ } finally {
                                    setSavingIdleTimeout(false);
                                  }
                                }}
                              >
                                {savingIdleTimeout ? <LoaderCircle className="size-3.5 animate-spin" /> : "Save"}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : resolvedActiveSection === 'workspace' ? (
                  <WorkspaceSettingsSection />
                ) : resolvedActiveSection === 'ai' ? (
                  <div className="space-y-4">
                    <Collapsible
                      open={providersExpanded}
                      onOpenChange={setProvidersExpanded}
                      className="overflow-hidden rounded-2xl border border-border"
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 px-6 py-5">
                        <CollapsibleTrigger className="group flex min-w-0 cursor-pointer items-start gap-3 pt-0.5 text-left">
                          <span className="relative mt-0.5 size-5 shrink-0">
                            <Building2 className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
                            <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-base font-medium text-foreground">Providers</p>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                              Manage API keys, endpoints, and default models for lightweight background tasks.
                            </p>
                          </div>
                        </CollapsibleTrigger>
                        <div className="flex items-center justify-end gap-3">
                          {isLlmConfigLoading ? (
                            <Skeleton className="h-10 w-28 rounded-xl" />
                          ) : (
                            <Button
                              variant="outline"
                              onClick={() => setProviderDialogState({ open: true, providerId: null })}
                            >
                              Add Provider
                            </Button>
                          )}
                        </div>
                      </div>

                      <CollapsibleContent>
                        <div className="border-t border-border px-6 py-3">
                          {isLlmConfigLoading ? (
                            <div className="space-y-3 py-2">
                              <Skeleton className="h-16 w-full rounded-xl" />
                              <Skeleton className="h-16 w-full rounded-xl" />
                            </div>
                          ) : providerEntries.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                              No providers configured yet.
                            </div>
                          ) : (
                            <div className="divide-y divide-border">
                              {providerEntries.map((provider) => (
                                <div key={provider.id} className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 py-4">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2.5">
                                      <p className="truncate text-sm font-medium text-foreground">
                                        {provider.label}
                                      </p>
                                      <Popover
                                        open={providerTests[provider.id]?.open ?? false}
                                        onOpenChange={(open) =>
                                          setProviderTests((current) => ({
                                            ...current,
                                            [provider.id]: {
                                              open,
                                              status: current[provider.id]?.status ?? 'idle',
                                              output: current[provider.id]?.output ?? '',
                                            },
                                          }))
                                        }
                                      >
                                        <PopoverTrigger asChild>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className={cn(
                                              'h-7 px-2 text-[11px]',
                                              providerTests[provider.id]?.status === 'pass' &&
                                                'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300',
                                              providerTests[provider.id]?.status === 'fail' &&
                                                'border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/15',
                                              providerTests[provider.id]?.status === 'testing' &&
                                                'border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300',
                                            )}
                                            onClick={() => {
                                              if (!llmConfig?.providers?.[provider.id]) return;
                                              void runProviderTest(provider.id, llmConfig.providers[provider.id]);
                                            }}
                                          >
                                            {providerTests[provider.id]?.status === 'testing'
                                              ? 'TESTING...'
                                              : providerTests[provider.id]?.status === 'pass'
                                                ? 'PASS'
                                                : providerTests[provider.id]?.status === 'fail'
                                                  ? 'FAIL'
                                                  : 'TEST'}
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent align="start" className="w-[420px] p-4">
                                          <div className="space-y-2">
                                            <div className="flex items-center justify-between gap-3">
                                              <p className="text-sm font-medium text-foreground">
                                                Provider Test
                                              </p>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 px-2 text-[11px]"
                                                onClick={() => {
                                                  if (!llmConfig?.providers?.[provider.id]) return;
                                                  void runProviderTest(provider.id, llmConfig.providers[provider.id]);
                                                }}
                                              >
                                                RETEST
                                              </Button>
                                            </div>
                                            <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/20 p-3 text-xs whitespace-pre-wrap text-foreground">
                                              {providerTests[provider.id]?.output ||
                                                (providerTests[provider.id]?.status === 'testing'
                                                  ? 'Streaming response...'
                                                  : 'Click TEST to start.')}
                                            </pre>
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    </div>
                                    <p className="mt-1 truncate text-xs text-muted-foreground">
                                      {provider.model || provider.kind}
                                    </p>
                                  </div>
                                  <div className="flex items-center justify-end gap-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground">Enabled</span>
                                      <Switch
                                        checked={provider.enabled}
                                        disabled={providerToggleId === provider.id}
                                        onCheckedChange={(checked) => {
                                          void handleProviderEnabledChange(provider.id, !!checked);
                                        }}
                                      />
                                    </div>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        setProviderDialogState({ open: true, providerId: provider.id })
                                      }
                                    >
                                      Edit
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    <Collapsible
                      open={routingExpanded}
                      onOpenChange={setRoutingExpanded}
                      className="overflow-hidden rounded-2xl border border-border"
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 px-6 py-5">
                        <CollapsibleTrigger className="group flex min-w-0 cursor-pointer items-start gap-3 pt-0.5 text-left">
                          <span className="relative mt-0.5 size-5 shrink-0">
                            <Route className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
                            <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-base font-medium text-foreground">Routing</p>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                              Choose which provider handles tasks.
                            </p>
                          </div>
                        </CollapsibleTrigger>
                        <div />
                      </div>

                      <CollapsibleContent>
                        <div className="border-t border-border px-6 py-3">
                          {isLlmConfigLoading ? (
                            <div className="space-y-3 py-2">
                              <Skeleton className="h-16 w-full rounded-xl" />
                              <Skeleton className="h-16 w-full rounded-xl" />
                              <Skeleton className="h-16 w-full rounded-xl" />
                            </div>
                          ) : (
                            <div className="divide-y divide-border">
                              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 py-4">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground">Session title generator</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {sessionTitleFormat.include_agent_name ||
                                    sessionTitleFormat.include_project_name ||
                                    sessionTitleFormat.include_intent_emoji
                                      ? 'Custom title format enabled'
                                      : 'Default title format'}
                                  </p>
                                </div>
                                <div className="flex items-center justify-end gap-3">
                                  <Select
                                    value={llmConfig?.features?.session_title ?? '__none__'}
                                    onValueChange={(value) => {
                                      void handleLlmConfigUpdate('session_title', (current) => ({
                                        ...current,
                                        features: {
                                          ...current.features,
                                          session_title: value === '__none__' ? null : value,
                                        },
                                      }));
                                    }}
                                    disabled={routingSavingKey === 'session_title'}
                                  >
                                    <SelectTrigger className="w-[180px]">
                                      <SelectValue placeholder="Disabled" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">Disabled</SelectItem>
                                      {providerEntries.map((provider) => (
                                        <SelectItem key={provider.id} value={provider.id}>
                                          {provider.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Popover open={sessionTitleFormatOpen} onOpenChange={setSessionTitleFormatOpen}>
                                    <PopoverTrigger asChild>
                                      <Button variant="outline" size="sm">
                                        <SlidersHorizontal className="size-4" />
                                        Format
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent align="end" className="w-80 space-y-4 p-4">
                                      <p className="text-sm font-medium text-foreground">Session title format</p>
                                      <div className="rounded-2xl border border-border bg-muted/20 p-4">
                                        <p className="text-xs font-semibold text-muted-foreground">
                                          Final format
                                        </p>
                                        <p className="mt-2 font-mono text-sm text-foreground">
                                          {sessionTitleFormatPreview(sessionTitleFormat)}
                                        </p>
                                      </div>
                                      <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                                        <div>
                                          <p className="text-sm text-foreground">Intent emoji</p>
                                        </div>
                                        <Switch
                                          checked={!!sessionTitleFormat.include_intent_emoji}
                                          onCheckedChange={(checked) => {
                                            void handleLlmConfigUpdate('session_title_format', (current) => ({
                                              ...current,
                                              features: {
                                                ...current.features,
                                                session_title_format: {
                                                  ...normalizeSessionTitleFormat(current.features.session_title_format),
                                                  include_intent_emoji: !!checked,
                                                },
                                              },
                                            }));
                                          }}
                                          disabled={routingSavingKey === 'session_title_format'}
                                        />
                                      </label>
                                      <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                                        <div>
                                          <p className="text-sm text-foreground">Agent name</p>
                                        </div>
                                        <Switch
                                          checked={!!sessionTitleFormat.include_agent_name}
                                          onCheckedChange={(checked) => {
                                            void handleLlmConfigUpdate('session_title_format', (current) => ({
                                              ...current,
                                              features: {
                                                ...current.features,
                                                session_title_format: {
                                                  ...normalizeSessionTitleFormat(current.features.session_title_format),
                                                  include_agent_name: !!checked,
                                                },
                                              },
                                            }));
                                          }}
                                          disabled={routingSavingKey === 'session_title_format'}
                                        />
                                      </label>
                                      <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                                        <div>
                                          <p className="text-sm text-foreground">Project name</p>
                                        </div>
                                        <Switch
                                          checked={!!sessionTitleFormat.include_project_name}
                                          onCheckedChange={(checked) => {
                                            void handleLlmConfigUpdate('session_title_format', (current) => ({
                                              ...current,
                                              features: {
                                                ...current.features,
                                                session_title_format: {
                                                  ...normalizeSessionTitleFormat(current.features.session_title_format),
                                                  include_project_name: !!checked,
                                                },
                                              },
                                            }));
                                          }}
                                          disabled={routingSavingKey === 'session_title_format'}
                                        />
                                      </label>
                                    </PopoverContent>
                                  </Popover>
                                </div>
                              </div>

                              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 py-4">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground">Git commit generator</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {llmConfig?.features?.git_commit_language?.trim() || 'Prompt default language'}
                                  </p>
                                </div>
                                <div className="flex items-center justify-end gap-3">
                                  <Select
                                    value={llmConfig?.features?.git_commit ?? '__none__'}
                                    onValueChange={(value) => {
                                      void handleLlmConfigUpdate('git_commit', (current) => ({
                                        ...current,
                                        features: {
                                          ...current.features,
                                          git_commit: value === '__none__' ? null : value,
                                        },
                                      }));
                                    }}
                                    disabled={routingSavingKey === 'git_commit'}
                                  >
                                    <SelectTrigger className="w-[180px]">
                                      <SelectValue placeholder="Disabled" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">Disabled</SelectItem>
                                      {providerEntries.map((provider) => (
                                        <SelectItem key={provider.id} value={provider.id}>
                                          {provider.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="outline" size="sm">
                                        <Languages className="size-4" />
                                        Language
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-64">
                                      <DropdownMenuItem
                                        onClick={() => {
                                          void handleLlmConfigUpdate('git_commit_language', (current) => ({
                                            ...current,
                                            features: {
                                              ...current.features,
                                              git_commit_language: null,
                                            },
                                          }));
                                        }}
                                      >
                                        Prompt default
                                      </DropdownMenuItem>
                                      {FEATURE_LANGUAGE_OPTIONS.map((option) => (
                                        <DropdownMenuItem
                                          key={option.value}
                                          onClick={() => {
                                            void handleLlmConfigUpdate('git_commit_language', (current) => ({
                                              ...current,
                                              features: {
                                                ...current.features,
                                                git_commit_language: option.label,
                                              },
                                            }));
                                          }}
                                        >
                                          {option.label}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>

                              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 py-4">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground">Workspace issue TODO extraction</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {llmConfig?.features?.workspace_issue_todo_language?.trim() || 'Prompt default language'}
                                  </p>
                                </div>
                                <div className="flex items-center justify-end gap-3">
                                  <Select
                                    value={llmConfig?.features?.workspace_issue_todo ?? '__none__'}
                                    onValueChange={(value) => {
                                      void handleLlmConfigUpdate('workspace_issue_todo', (current) => ({
                                        ...current,
                                        features: {
                                          ...current.features,
                                          workspace_issue_todo: value === '__none__' ? null : value,
                                        },
                                      }));
                                    }}
                                    disabled={routingSavingKey === 'workspace_issue_todo'}
                                  >
                                    <SelectTrigger className="w-[180px]">
                                      <SelectValue placeholder="Disabled" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">Disabled</SelectItem>
                                      {providerEntries.map((provider) => (
                                        <SelectItem key={provider.id} value={provider.id}>
                                          {provider.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="outline" size="sm">
                                        <Languages className="size-4" />
                                        Language
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-64">
                                      <DropdownMenuItem
                                        onClick={() => {
                                          void handleLlmConfigUpdate('workspace_issue_todo_language', (current) => ({
                                            ...current,
                                            features: {
                                              ...current.features,
                                              workspace_issue_todo_language: null,
                                            },
                                          }));
                                        }}
                                      >
                                        Prompt default
                                      </DropdownMenuItem>
                                      {FEATURE_LANGUAGE_OPTIONS.map((option) => (
                                        <DropdownMenuItem
                                          key={option.value}
                                          onClick={() => {
                                            void handleLlmConfigUpdate('workspace_issue_todo_language', (current) => ({
                                              ...current,
                                              features: {
                                                ...current.features,
                                                workspace_issue_todo_language: option.label,
                                              },
                                            }));
                                          }}
                                        >
                                          {option.label}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                ) : resolvedActiveSection === 'notify' ? (
                  <NotifySettingsSection
                    settings={notifySettings}
                    isLoading={isNotifyLoading}
                    isSaving={isNotifySaving}
                    onToggleBrowser={async (checked) => {
                      if (checked) {
                        const granted = await requestBrowserNotificationPermission();
                        if (!granted) {
                          toastManager.add({
                            title: 'Browser notification permission denied',
                            description: 'Please allow notifications in your browser settings.',
                            type: 'error',
                          });
                          return;
                        }
                      }
                      void updateNotifyField('browser_notification', checked);
                    }}
                    onToggleDesktop={(checked) => void updateNotifyField('desktop_notification', checked)}
                    onTestBrowser={() => sendBrowserNotification(TEST_NOTIFICATION_PAYLOAD)}
                    onTestDesktop={() => showDesktopNotification(TEST_NOTIFICATION_PAYLOAD)}
                    onTogglePermissionRequest={(checked) => void updateNotifyField('notify_on_permission_request', checked)}
                    onToggleTaskComplete={(checked) => void updateNotifyField('notify_on_task_complete', checked)}
                    onAddPushServer={addPushServer}
                    onRemovePushServer={removePushServer}
                    onUpdatePushServer={updatePushServer}
                    onTestPushServer={testPushServer}
                  />
                ) : resolvedActiveSection === 'remote-access' ? (
                  <RemoteAccessSection />
                ) : null}
                </div>
              </ScrollArea>
            </div>
          </section>
        </div>

        <LlmProviderEditorDialog
          open={providerDialogState.open}
          providerId={providerDialogState.providerId}
          onOpenChange={(open) =>
            setProviderDialogState((current) => ({ ...current, open }))
          }
          onSaved={() => {
            void loadLlmConfig();
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
