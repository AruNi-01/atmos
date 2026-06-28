'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@workspace/ui';
import {
  Archive,
  ChevronDown,
  FolderSymlink,
  GitBranch,
  Plus,
  Trash2,
} from 'lucide-react';
import type { GitIgnoreDirStrategy } from '@/api/ws-api';
import { useWorkspaceGitignoreDirsStore } from '@/features/workspace/store/workspace-gitignore-dirs-store';
import { useWorkspaceSettingsStore } from '@/features/settings/store/workspace-settings-store';

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

  const [expanded, setExpanded] = React.useState(true);
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
    <Collapsible
      open={expanded}
      onOpenChange={setExpanded}
      className="overflow-hidden rounded-2xl border border-border"
    >
      <div className="flex items-start justify-between gap-4 px-6 py-5">
        <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
          <div className="flex items-start gap-3">
            <span className="relative mt-0.5 size-5 shrink-0">
              <FolderSymlink className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
              <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-medium text-foreground">{t('gitignore.title')}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t('gitignore.descriptionPrefix')} <code className="font-mono text-xs">git worktree add</code>
                {t('gitignore.descriptionMiddle')} <code className="font-mono text-xs">.gitignore</code>
                {t('gitignore.descriptionSuffix')}
              </p>
            </div>
          </div>
        </CollapsibleTrigger>
        <div className="shrink-0 pt-1">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>

      <CollapsibleContent>
        <div className="border-t border-border px-4">
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
        </div>
      </CollapsibleContent>
    </Collapsible>
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

  const [expanded, setExpanded] = React.useState(true);
  const [branchNamingExpanded, setBranchNamingExpanded] = React.useState(true);
  const [archiveExpanded, setArchiveExpanded] = React.useState(true);
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
                <p className="text-base font-medium text-foreground">{t('branchNaming.title')}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t('branchNaming.description')}
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
                  <p className="text-sm text-foreground">{t('branchNaming.prefixTitle')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('branchNaming.prefixDescription')}
                  </p>
                </div>
                <div className="flex items-center justify-end">
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
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <GitignoreDirsCard />

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
                <p className="text-base font-medium text-foreground">{t('deletion.title')}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t('deletion.description')}
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
                  <p className="text-sm text-foreground">{t('deletion.closePrTitle')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('deletion.closePrDescription')}
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
                  <p className="text-sm text-foreground">{t('deletion.closeIssueTitle')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('deletion.closeIssueDescription')}
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
                  <p className="text-sm text-foreground">{t('deletion.deleteRemoteBranchTitle')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('deletion.deleteRemoteBranchDescription')}
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
                  <p className="text-sm text-foreground">{t('deletion.confirmBeforeDeleteTitle')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('deletion.confirmBeforeDeleteDescription')}
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
                <p className="text-base font-medium text-foreground">{t('archive.title')}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t('archive.description')}
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
                  <p className="text-sm text-foreground">{t('archive.confirmBeforeArchiveTitle')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('archive.confirmBeforeArchiveDescription')}
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
                  <p className="text-sm text-foreground">{t('archive.killTmuxTitle')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('archive.killTmuxDescription')}
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
                  <p className="text-sm text-foreground">{t('archive.closeAcpTitle')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('archive.closeAcpDescription')}
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
