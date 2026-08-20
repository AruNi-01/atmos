'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@workspace/ui';
import { Plus, Trash2 } from 'lucide-react';
import type { GitIgnoreDirStrategy } from '@/api/ws-api';
import { useWorkspaceGitignoreDirsStore } from '@/features/workspace/store/workspace-gitignore-dirs-store';
import { useWorkspaceSettingsStore } from '@/features/settings/store/workspace-settings-store';
import {
  SettingsGroupCard,
  SettingsGroupRow,
  SettingsPageStack,
} from '@/features/settings/components/settings/SettingsGroupCard';
import { SettingsToggleRow } from '@/features/settings/components/settings/SettingsToggleRow';

function GitignoreDirsCard() {
  const t = useTranslations('settings.workspaceSection');
  const {
    enabled,
    entries,
    loaded,
    load,
    setEnabled,
    setStrategy,
    addCustom,
    removeCustom,
    updateCustomPath,
  } = useWorkspaceGitignoreDirsStore();

  const [expanded, setExpanded] = React.useState(false);
  const [newPath, setNewPath] = React.useState('');
  const [editingPaths, setEditingPaths] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    load();
  }, [load]);

  const handleAdd = React.useCallback(() => {
    if (!newPath.trim()) return;
    addCustom(newPath);
    setNewPath('');
  }, [newPath, addCustom]);

  const builtins = entries.filter((entry) => entry.builtin);
  const customs = entries.filter((entry) => !entry.builtin);
  const strategyOptions: ReadonlyArray<{ value: GitIgnoreDirStrategy; label: string }> = [
    { value: 'symlink', label: t('gitignore.strategy.symlink') },
    { value: 'copy', label: t('gitignore.strategy.copy') },
    { value: 'off', label: t('gitignore.strategy.off') },
  ];

  return (
    <SettingsGroupCard
      open={expanded}
      onOpenChange={setExpanded}
      title={t('gitignore.title')}
      description={
        <>
          {t('gitignore.descriptionPrefix')} <code className="font-mono text-[11px]">git worktree add</code>
          {t('gitignore.descriptionMiddle')} <code className="font-mono text-[11px]">.gitignore</code>
          {t('gitignore.descriptionSuffix')}
        </>
      }
      headerEnd={<Switch checked={enabled} onCheckedChange={setEnabled} />}
    >
          <div className="px-2 py-3">
            <p className="px-1 pb-2 text-xs font-medium text-muted-foreground">
              {t('gitignore.builtInDefaults')}
            </p>
            {!loaded ? (
              <div className="px-1 py-3 text-xs text-muted-foreground">{t('gitignore.loading')}</div>
            ) : (
              <div className="rounded-md border border-border">
                {builtins.map((entry, idx) => (
                  <div
                    key={entry.id}
                    className={`grid grid-cols-[minmax(0,1fr)_140px] items-center gap-4 px-3 py-2 ${
                      idx < builtins.length - 1 ? 'border-b border-border' : ''
                    }`}
                  >
                    <code className="truncate font-mono text-xs text-foreground">{entry.path}</code>
                    <Select
                      value={entry.strategy}
                      onValueChange={(value) => setStrategy(entry.id, value as GitIgnoreDirStrategy)}
                      disabled={!enabled}
                    >
                      <SelectTrigger className="h-8 w-full text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {strategyOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value} className="text-xs">
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-2 py-3 last:border-b-0">
            <p className="px-1 pb-2 text-xs font-medium text-muted-foreground">
              {t('gitignore.customDirectories')}{' '}
              <span className="font-normal normal-case not-italic text-muted-foreground/70">
                ({t('gitignore.customDirectoriesHintPrefix')} <code className="font-mono text-[10px]">..</code>
                {t('gitignore.customDirectoriesHintSuffix')})
              </span>
            </p>
            {customs.length > 0 && (
              <div className="mb-3 rounded-md border border-border">
                {customs.map((entry, idx) => (
                  <div
                    key={entry.id}
                    className={`grid grid-cols-[minmax(0,1fr)_140px_32px] items-center gap-4 px-3 py-2 ${
                      idx < customs.length - 1 ? 'border-b border-border' : ''
                    }`}
                  >
                    <Input
                      value={editingPaths[entry.id] ?? entry.path}
                      onChange={(event) =>
                        setEditingPaths((prev) => ({ ...prev, [entry.id]: event.target.value }))
                      }
                      onBlur={(event) => {
                        const next = event.target.value.trim();
                        if (next && next !== entry.path) {
                          updateCustomPath(entry.id, next);
                        }
                        setEditingPaths((prev) => {
                          if (!(entry.id in prev)) return prev;
                          const cleared = { ...prev };
                          delete cleared[entry.id];
                          return cleared;
                        });
                      }}
                      className="h-8 font-mono text-xs"
                      disabled={!enabled}
                    />
                    <Select
                      value={entry.strategy}
                      onValueChange={(value) => setStrategy(entry.id, value as GitIgnoreDirStrategy)}
                      disabled={!enabled}
                    >
                      <SelectTrigger className="h-8 w-full text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {strategyOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value} className="text-xs">
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeCustom(entry.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Input
                value={newPath}
                onChange={(event) => setNewPath(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleAdd();
                  }
                }}
                placeholder={t('gitignore.pathPlaceholder')}
                className="h-8 font-mono text-xs"
                disabled={!enabled}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleAdd}
                disabled={!enabled || !newPath.trim()}
                className="h-8 shrink-0"
              >
                <Plus className="size-3.5" />
                {t('gitignore.add')}
              </Button>
            </div>
            <p className="mt-2 px-1 text-xs text-warning">
              {t('gitignore.warning')}
            </p>
          </div>
    </SettingsGroupCard>
  );
}

export function WorkspaceSettingsSection() {
  const t = useTranslations('settings.workspaceSection');
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
  } = useWorkspaceSettingsStore();

  const [expanded, setExpanded] = React.useState(false);
  const [branchNamingExpanded, setBranchNamingExpanded] = React.useState(true);
  const [archiveExpanded, setArchiveExpanded] = React.useState(false);
  const [localPrefix, setLocalPrefix] = React.useState(branchPrefix);
  const pendingSaveRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  React.useEffect(() => {
    setLocalPrefix(branchPrefix);
  }, [branchPrefix]);

  const handlePrefixChange = React.useCallback((value: string) => {
    const sanitized = value
      .trim()
      .replace(/\/+/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/$/, '');

    setLocalPrefix(sanitized);

    if (pendingSaveRef.current) {
      clearTimeout(pendingSaveRef.current);
    }
    pendingSaveRef.current = setTimeout(() => {
      setBranchPrefix(sanitized);
    }, 500);
  }, [setBranchPrefix]);

  React.useEffect(() => {
    return () => {
      if (pendingSaveRef.current) {
        clearTimeout(pendingSaveRef.current);
      }
    };
  }, []);

  return (
    <SettingsPageStack>
      <SettingsGroupCard
        open={branchNamingExpanded}
        onOpenChange={setBranchNamingExpanded}
        title={t('branchNaming.title')}
        description={t('branchNaming.description')}
      >
        <SettingsGroupRow wide title={t('branchNaming.prefixTitle')} description={t('branchNaming.prefixDescription')}>
          <div className="flex items-center gap-0">
            <Input
              value={localPrefix}
              onChange={(event) => handlePrefixChange(event.target.value)}
              placeholder={t('branchNaming.prefixPlaceholder')}
              className="h-8 w-[200px] rounded-r-none border-r-0 focus-visible:ring-0"
            />
            <div className="flex h-8 items-center rounded-r-md border border-l-0 bg-muted px-2 text-sm text-muted-foreground">
              /
            </div>
          </div>
        </SettingsGroupRow>
      </SettingsGroupCard>

      <GitignoreDirsCard />

      <SettingsGroupCard
        open={expanded}
        onOpenChange={setExpanded}
        title={t('deletion.title')}
        description={t('deletion.description')}
      >
        <SettingsToggleRow
          title={t('deletion.closePrTitle')}
          description={t('deletion.closePrDescription')}
          checked={closePrOnDelete}
          onCheckedChange={setClosePrOnDelete}
        />
        <SettingsToggleRow
          title={t('deletion.closeIssueTitle')}
          description={t('deletion.closeIssueDescription')}
          checked={closeIssueOnDelete}
          onCheckedChange={setCloseIssueOnDelete}
        />
        <SettingsToggleRow
          title={t('deletion.deleteRemoteBranchTitle')}
          description={t('deletion.deleteRemoteBranchDescription')}
          checked={deleteRemoteBranch}
          onCheckedChange={setDeleteRemoteBranch}
        />
        <SettingsToggleRow
          title={t('deletion.confirmBeforeDeleteTitle')}
          description={t('deletion.confirmBeforeDeleteDescription')}
          checked={confirmBeforeDelete}
          onCheckedChange={setConfirmBeforeDelete}
        />
      </SettingsGroupCard>

      <SettingsGroupCard
        open={archiveExpanded}
        onOpenChange={setArchiveExpanded}
        title={t('archive.title')}
        description={t('archive.description')}
      >
        <SettingsToggleRow
          title={t('archive.confirmBeforeArchiveTitle')}
          description={t('archive.confirmBeforeArchiveDescription')}
          checked={confirmBeforeArchive}
          onCheckedChange={setConfirmBeforeArchive}
        />
        <SettingsToggleRow
          title={t('archive.killTmuxTitle')}
          description={t('archive.killTmuxDescription')}
          checked={killTmuxOnArchive}
          onCheckedChange={setKillTmuxOnArchive}
        />
        <SettingsToggleRow
          title={t('archive.closeAcpTitle')}
          description={t('archive.closeAcpDescription')}
          checked={closeAcpOnArchive}
          onCheckedChange={setCloseAcpOnArchive}
        />
      </SettingsGroupCard>
    </SettingsPageStack>
  );
}

