'use client';

import React from 'react';
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
  Skeleton,
  Switch,
  toastManager,
} from '@workspace/ui';
import { ChevronDown, Plus, Trash2, Webhook } from 'lucide-react';
import { isTauriRuntime } from '@/lib/desktop-runtime';
import {
  type NotificationSettings,
  type PushServerConfig,
  type PushServerType,
} from '@/hooks/use-notification-settings';
import { SaveActionButton } from '@/components/dialogs/settings/SaveActionButton';

const PUSH_SERVER_TYPE_OPTIONS: { value: PushServerType; label: string; description: string }[] = [
  { value: 'ntfy', label: 'ntfy', description: 'Self-hosted or ntfy.sh push notifications' },
  { value: 'bark', label: 'Bark', description: 'iOS push notifications via Bark' },
  { value: 'gotify', label: 'Gotify', description: 'Self-hosted push notification server' },
  { value: 'custom_webhook', label: 'Custom Webhook', description: 'Send to any HTTP endpoint' },
];

export function NotifySettingsSection({
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
  settings: NotificationSettings;
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
    const ids = new Set(settings.push_servers.map((server) => server.id));
    setPushServerLocalById((prev) => {
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
    setPushServerLocalById((prev) => ({
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
      setPushServerLocalById((prev) => {
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
    const index = settings.push_servers.findIndex((server) => server.id === serverId);
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
              {PUSH_SERVER_TYPE_OPTIONS.map((option) => (
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
                const typeLabel = PUSH_SERVER_TYPE_OPTIONS.find((option) => option.value === server.type)?.label ?? server.type;
                const isTesting = testingServerId === server.id;
                const display = displayPushServer(server);
                const pushDirty = isPushFieldsDirty(server);

                return (
                  <div key={server.id} className="space-y-3 border-b border-border px-2 py-4 last:border-b-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          {typeLabel}
                        </span>
                        <span className="truncate text-sm text-foreground">{display.url}</span>
                        {pushDirty && (
                          <span className="shrink-0 text-[10px] font-medium text-amber-600 dark:text-amber-500">
                            Unsaved
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
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
                          className="h-8 font-mono text-xs"
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
                            className="h-8 font-mono text-xs"
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
                            className="h-8 font-mono text-xs"
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
                            className="h-8 font-mono text-xs"
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
                              className="h-8 font-mono text-xs"
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
                              className="h-8 font-mono text-xs"
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
