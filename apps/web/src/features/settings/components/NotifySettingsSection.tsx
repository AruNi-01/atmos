'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Skeleton,
  Switch,
  toastManager,
} from '@workspace/ui';
import { Plus, Trash2 } from 'lucide-react';
import { isDesktopRuntime } from '@/shared/lib/desktop-runtime';
import {
  type NotificationSettingsFieldUpdater,
  type NotificationSettings,
  type PushServerConfig,
  type PushServerType,
  useNotificationSettingsStore,
} from '@/features/settings/store/notification-settings-store';
import { SaveActionButton } from '@/features/settings/components/settings/SaveActionButton';
import {
  SettingsGroupCard,
  SettingsGroupRow,
  SettingsPageStack,
} from '@/features/settings/components/settings/SettingsGroupCard';
import { SettingsToggleRow } from '@/features/settings/components/settings/SettingsToggleRow';

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
  const t = useTranslations('settings.notifySection');
  const [pushServersExpanded, setPushServersExpanded] = React.useState(false);
  const [testingServerId, setTestingServerId] = React.useState<string | null>(null);
  const [testingLocalChannel, setTestingLocalChannel] = React.useState<'browser' | 'desktop' | null>(null);
  const [pushServerLocalById, setPushServerLocalById] = React.useState<Record<string, PushServerConfig>>({});
  const updateNotificationField =
    useNotificationSettingsStore((state) => state.updateField) as NotificationSettingsFieldUpdater;

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
  const pushServerTypeOptions: { value: PushServerType; label: string; description: string }[] = [
    { value: 'ntfy', label: 'ntfy', description: t('pushServers.types.ntfy') },
    { value: 'bark', label: 'Bark', description: t('pushServers.types.bark') },
    { value: 'gotify', label: 'Gotify', description: t('pushServers.types.gotify') },
    {
      value: 'custom_webhook',
      label: t('pushServers.types.customWebhookLabel'),
      description: t('pushServers.types.customWebhookDescription'),
    },
  ];

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
      toastManager.add({ title: t('toasts.testSent'), type: 'success' });
    } else {
      toastManager.add({
        title: t('toasts.testFailed'),
        description: result.error ?? t('toasts.unknownError'),
        type: 'error',
      });
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
      toastManager.add({ title: t('toasts.testSent'), type: 'success' });
      return;
    }

    toastManager.add({
      title: t('toasts.testFailed'),
      description:
        channel === 'browser'
          ? t('toasts.browserPermissionRequired')
          : t('toasts.desktopTestFailed'),
      type: 'error',
    });
  };

  if (isLoading) {
    return (
      <SettingsPageStack>
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </SettingsPageStack>
    );
  }

  return (
    <SettingsPageStack>
      <SettingsGroupCard
        title={t('channels.title')}
        description={t('channels.description')}
      >
        <SettingsToggleRow
          title={t('channels.browser.title')}
          description={t('channels.browser.description')}
          checked={settings.browser_notification}
          disabled={isSaving}
          onCheckedChange={onToggleBrowser}
          trailing={
            settings.browser_notification ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => void handleTestLocalChannel('browser')}
                disabled={testingLocalChannel === 'browser'}
              >
                {testingLocalChannel === 'browser' ? t('actions.testing') : t('actions.test')}
              </Button>
            ) : null
          }
        />

        {isDesktopRuntime() ? (
          <SettingsToggleRow
            title={t('channels.desktop.title')}
            description={t('channels.desktop.description')}
            checked={settings.desktop_notification}
            disabled={isSaving}
            onCheckedChange={onToggleDesktop}
            trailing={
              settings.desktop_notification ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => void handleTestLocalChannel('desktop')}
                  disabled={testingLocalChannel === 'desktop'}
                >
                  {testingLocalChannel === 'desktop' ? t('actions.testing') : t('actions.test')}
                </Button>
              ) : null
            }
          />
        ) : null}

        <SettingsToggleRow
          title={t('channels.inAppToast.title')}
          description={t('channels.inAppToast.description')}
          checked={settings.app_toast_notification}
          disabled={isSaving}
          onCheckedChange={(checked) => void updateNotificationField('app_toast_notification', checked)}
        />

        <SettingsToggleRow
          title={t('channels.whenFocused.title')}
          description={t('channels.whenFocused.description')}
          checked={settings.system_notification_when_focused}
          disabled={
            isSaving ||
            (!settings.browser_notification && !settings.desktop_notification)
          }
          onCheckedChange={(checked) =>
            void updateNotificationField('system_notification_when_focused', checked)
          }
        />
      </SettingsGroupCard>

      <SettingsGroupCard
        title={t('events.title')}
        description={t('events.description')}
      >
        <SettingsToggleRow
          title={t('events.permissionRequested.title')}
          description={t('events.permissionRequested.description')}
          checked={settings.notify_on_permission_request}
          disabled={isSaving}
          onCheckedChange={onTogglePermissionRequest}
        />
        <SettingsToggleRow
          title={t('events.taskComplete.title')}
          description={t('events.taskComplete.description')}
          checked={settings.notify_on_task_complete}
          disabled={isSaving}
          onCheckedChange={onToggleTaskComplete}
        />
        <SettingsToggleRow
          title={t('events.automationOutcome.title')}
          description={t('events.automationOutcome.description')}
          checked={settings.notify_on_automation_outcome}
          disabled={isSaving}
          onCheckedChange={(checked) => void updateNotificationField('notify_on_automation_outcome', checked)}
        />
      </SettingsGroupCard>

      <SettingsGroupCard
        open={pushServersExpanded}
        onOpenChange={setPushServersExpanded}
        title={t('pushServers.title')}
        description={t('pushServers.description')}
        headerEnd={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="mr-2 size-4" />
                {t('pushServers.addServer')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              {pushServerTypeOptions.map((option) => (
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
        }
      >
        <SettingsToggleRow
          title={t('pushServers.automationOutcomes.title')}
          description={t('pushServers.automationOutcomes.description')}
          checked={settings.push_automation_outcomes}
          disabled={isSaving}
          onCheckedChange={(checked) => void updateNotificationField('push_automation_outcomes', checked)}
        />
        {settings.push_servers.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            {t('pushServers.empty')}
          </p>
        ) : (
          settings.push_servers.map((server) => {
            const typeLabel =
              pushServerTypeOptions.find((option) => option.value === server.type)?.label ??
              server.type;
            const isTesting = testingServerId === server.id;
            const display = displayPushServer(server);
            const pushDirty = isPushFieldsDirty(server);

            return (
              <SettingsGroupRow
                key={server.id}
                wide
                title={
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                      {typeLabel}
                    </span>
                    <span className="truncate">{display.url}</span>
                    {pushDirty ? (
                      <span className="shrink-0 text-[10px] font-medium text-amber-600 dark:text-amber-500">
                        {t('pushServers.unsaved')}
                      </span>
                    ) : null}
                  </span>
                }
                description={null}
                footer={
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">{t('pushServers.fields.url')}</label>
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
                        <label className="mb-1 block text-xs text-muted-foreground">{t('pushServers.fields.token')}</label>
                        <Input
                          value={display.token ?? ''}
                          placeholder={t('pushServers.placeholders.optionalAuthToken')}
                          onChange={(e) => setPushFields(server, { token: e.target.value || null })}
                          className="h-8 font-mono text-xs"
                          disabled={isSaving}
                        />
                      </div>
                    )}
                    {server.type === 'ntfy' && (
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">{t('pushServers.fields.topic')}</label>
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
                        <label className="mb-1 block text-xs text-muted-foreground">{t('pushServers.fields.deviceKey')}</label>
                        <Input
                          value={display.device_key ?? ''}
                          placeholder={t('pushServers.placeholders.deviceKey')}
                          onChange={(e) => setPushFields(server, { device_key: e.target.value || null })}
                          className="h-8 font-mono text-xs"
                          disabled={isSaving}
                        />
                      </div>
                    )}
                    {server.type === 'custom_webhook' && (
                      <>
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">{t('pushServers.fields.authToken')}</label>
                          <Input
                            value={display.token ?? ''}
                            placeholder={t('pushServers.placeholders.optionalBearerToken')}
                            onChange={(e) => setPushFields(server, { token: e.target.value || null })}
                            className="h-8 font-mono text-xs"
                            disabled={isSaving}
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="mb-1 block text-xs text-muted-foreground">
                            {t('pushServers.fields.bodyTemplate')}{' '}
                            ({t('pushServers.fields.bodyTemplateHint')}{' '}
                            {'{{title}}'}, {'{{body}}'}, {'{{tool}}'}, {'{{state}}'})
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
                }
              >
                <div className="flex shrink-0 items-center gap-2">
                  {pushDirty ? (
                    <SaveActionButton
                      saving={isSaving}
                      className="h-7 px-2 text-xs"
                      onClick={() => void savePushFields(server)}
                    />
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => void handleTestServer(server.id)}
                    disabled={isTesting || pushDirty}
                  >
                    {isTesting ? t('actions.testing') : t('actions.test')}
                  </Button>
                  <Switch
                    checked={server.enabled}
                    onCheckedChange={(checked) => void onUpdatePushServer(server.id, { enabled: !!checked })}
                  />
                  <button
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void onRemovePushServer(server.id)}
                    title={t('pushServers.removeServer')}
                    type="button"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </SettingsGroupRow>
            );
          })
        )}
      </SettingsGroupCard>
    </SettingsPageStack>
  );
}
