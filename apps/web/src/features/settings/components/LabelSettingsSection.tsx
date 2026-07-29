'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useShallow } from 'zustand/shallow';
import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toastManager,
  isColorEyedropperActive,
} from '@workspace/ui';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ListFilter,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useProjectStore } from '@/features/project/store/use-project-store';
import {
  useWorkspaceLabels,
} from '@/features/project/hooks/use-project-bootstrap-query';
import { LabelEditorContent } from '@/app-shell/sidebar/workspace-metadata-controls';
import type { WorkspaceLabel } from '@/shared/types/domain';

type ProjectStoreWorkspaceLabel = WorkspaceLabel;

function formatDate(dateStr: string | undefined, locale: string) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString(locale);
}

export function LabelSettingsSection() {
  const t = useTranslations('settings.labelSection');
  const locale = useLocale();
  const workspaceLabels = useWorkspaceLabels();
  const {
    updateWorkspaceLabel,
    createWorkspaceLabel,
    deleteWorkspaceLabel,
    fetchWorkspaceLabels,
    restoreWorkspaceLabel,
  } = useProjectStore(
    useShallow((state) => ({
      updateWorkspaceLabel: state.updateWorkspaceLabel,
      createWorkspaceLabel: state.createWorkspaceLabel,
      deleteWorkspaceLabel: state.deleteWorkspaceLabel,
      fetchWorkspaceLabels: state.fetchWorkspaceLabels,
      restoreWorkspaceLabel: state.restoreWorkspaceLabel,
    })),
  );
  const [selectedLabels, setSelectedLabels] = React.useState<Set<string>>(new Set());
  const [editingLabel, setEditingLabel] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editColor, setEditColor] = React.useState('#94a3b8');
  const [sortField, setSortField] = React.useState<'name' | 'createdAt' | null>(null);
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');
  const [filterQuery, setFilterQuery] = React.useState('');
  const [selectedSources, setSelectedSources] = React.useState<Set<string>>(new Set());
  const [isCreatingNew, setIsCreatingNew] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deleteConfirmLabelId, setDeleteConfirmLabelId] = React.useState<string | null>(null);
  const [deleteConfirmIsBatch, setDeleteConfirmIsBatch] = React.useState(false);
  const [labelFilter, setLabelFilter] = React.useState<'active' | 'deleted'>('active');
  const [deletedLabels, setDeletedLabels] = React.useState<WorkspaceLabel[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const labels = await fetchWorkspaceLabels(labelFilter === 'deleted');
      if (cancelled) return;
      if (labelFilter === 'deleted') {
        setDeletedLabels(labels);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [labelFilter, fetchWorkspaceLabels]);

  const sourceLabels = labelFilter === 'deleted' ? deletedLabels : workspaceLabels;

  const filteredAndSortedLabels = React.useMemo(() => {
    let labels = [...sourceLabels];

    if (filterQuery.trim()) {
      const query = filterQuery.toLowerCase().trim();
      labels = labels.filter((label) => label.name.toLowerCase().includes(query));
    }

    if (selectedSources.size > 0) {
      labels = labels.filter((label) => selectedSources.has(label.source || 'manual'));
    }

    if (sortField) {
      labels.sort((a: ProjectStoreWorkspaceLabel, b: ProjectStoreWorkspaceLabel) => {
        let comparison = 0;
        if (sortField === 'name') {
          comparison = a.name.localeCompare(b.name);
        } else if (sortField === 'createdAt') {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          comparison = aTime - bTime;
        }
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return labels;
  }, [sourceLabels, filterQuery, selectedSources, sortField, sortDirection]);

  const handleSort = (field: 'name' | 'createdAt') => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const toggleSelectAll = () => {
    if (selectedLabels.size === filteredAndSortedLabels.length) {
      setSelectedLabels(new Set());
    } else {
      setSelectedLabels(new Set(filteredAndSortedLabels.map((label) => label.id)));
    }
  };

  const toggleSelect = (labelId: string) => {
    const next = new Set(selectedLabels);
    if (next.has(labelId)) {
      next.delete(labelId);
    } else {
      next.add(labelId);
    }
    setSelectedLabels(next);
  };

  const handleEdit = (labelId: string, name: string, color: string) => {
    setTimeout(() => {
      setEditingLabel(labelId);
      setEditName(name);
      setEditColor(color || '#94a3b8');
    }, 250);
  };

  const labelSourceLabel = React.useCallback(
    (source?: string | null) => {
      if (source === 'gitHub_issue') {
        return t('sources.githubIssue');
      }
      if (source === 'gitHub_pr') {
        return t('sources.githubPr');
      }
      return t('sources.manual');
    },
    [t],
  );

  const handleSave = async () => {
    const trimmedName = editName.trim();
    if (!trimmedName) return;

    if (
      isCreatingNew &&
      workspaceLabels.some((label) => label.name.toLowerCase() === trimmedName.toLowerCase())
    ) {
      toastManager.add({ title: t('toasts.duplicateName'), type: 'error' });
      return;
    }

    if (
      !isCreatingNew &&
      editingLabel &&
      workspaceLabels.some(
        (label) => label.id !== editingLabel && label.name.toLowerCase() === trimmedName.toLowerCase(),
      )
    ) {
      toastManager.add({ title: t('toasts.duplicateName'), type: 'error' });
      return;
    }

    try {
      const color = editColor;
      if (isCreatingNew) {
        await createWorkspaceLabel({ name: trimmedName, color });
        setIsCreatingNew(false);
        toastManager.add({ title: t('toasts.created'), type: 'success' });
      } else if (editingLabel) {
        await updateWorkspaceLabel(editingLabel, { name: trimmedName, color });
        setEditingLabel(null);
        toastManager.add({ title: t('toasts.updated'), type: 'success' });
      }
    } catch {
      toastManager.add({
        title: isCreatingNew
          ? t('toasts.createFailed')
          : t('toasts.updateFailed'),
        type: 'error',
      });
    }
  };

  const handleCancel = () => {
    setEditingLabel(null);
    setIsCreatingNew(false);
    setEditName('');
  };

  const isAllSelected = filteredAndSortedLabels.length > 0 && selectedLabels.size === filteredAndSortedLabels.length;

  return (
    <div className="space-y-2">
      <div className="mb-2 flex items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('filters.searchPlaceholder')}
            value={filterQuery}
            onChange={(event) => setFilterQuery(event.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={labelFilter} onValueChange={(value) => setLabelFilter(value as 'active' | 'deleted')}>
            <SelectTrigger className="h-8 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{t('filters.status.active')}</SelectItem>
              <SelectItem value="deleted">{t('filters.status.deleted')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto">
          {labelFilter === 'active' && (
            <Popover
              open={isCreatingNew}
              onOpenChange={(open) => {
                if (!open && isColorEyedropperActive()) return;
                if (!open) handleCancel();
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => {
                    setIsCreatingNew(true);
                    setEditName('');
                    setEditColor('#94a3b8');
                  }}
                >
                  <Plus className="size-3.5" />
                  {t('actions.new')}
                </Button>
              </PopoverTrigger>
              {isCreatingNew && (
                <LabelEditorContent
                  side="bottom"
                  surface={false}
                  newLabelName={editName}
                  newLabelColor={editColor}
                  editingLabel={null}
                  setNewLabelName={setEditName}
                  setNewLabelColor={setEditColor}
                  onSubmit={handleSave}
                  popoverContentProps={{ align: 'start' }}
                />
              )}
            </Popover>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <div className="max-h-[500px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label={t('table.selectAllAriaLabel')}
                  />
                </TableHead>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-1">
                    {t('table.columns.name')}
                    {sortField === 'name' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      )
                    ) : (
                      <ArrowUpDown className="size-3 text-muted-foreground/50" />
                    )}
                  </div>
                </TableHead>
                <TableHead>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="flex cursor-pointer select-none items-center gap-1 hover:text-foreground">
                        {t('table.columns.source')}
                        <ListFilter className={`size-3 ${selectedSources.size > 0 ? 'text-primary' : 'text-muted-foreground/50'}`} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-40">
                      <DropdownMenuItem
                        className="flex cursor-pointer items-center gap-2"
                        onClick={(event) => {
                          event.preventDefault();
                          setSelectedSources((prev) => {
                            const next = new Set(prev);
                            if (next.has('manual')) {
                              next.delete('manual');
                            } else {
                              next.add('manual');
                            }
                            return next;
                          });
                        }}
                      >
                        <Checkbox checked={selectedSources.has('manual')} />
                        <span>{t('filters.sources.manual')}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="flex cursor-pointer items-center gap-2"
                        onClick={(event) => {
                          event.preventDefault();
                          setSelectedSources((prev) => {
                            const next = new Set(prev);
                            if (next.has('gitHub_issue')) {
                              next.delete('gitHub_issue');
                            } else {
                              next.add('gitHub_issue');
                            }
                            return next;
                          });
                        }}
                      >
                        <Checkbox checked={selectedSources.has('gitHub_issue')} />
                        <span>{t('filters.sources.githubIssue')}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="flex cursor-pointer items-center gap-2"
                        onClick={(event) => {
                          event.preventDefault();
                          setSelectedSources((prev) => {
                            const next = new Set(prev);
                            if (next.has('gitHub_pr')) {
                              next.delete('gitHub_pr');
                            } else {
                              next.add('gitHub_pr');
                            }
                            return next;
                          });
                        }}
                      >
                        <Checkbox checked={selectedSources.has('gitHub_pr')} />
                        <span>{t('filters.sources.githubPr')}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableHead>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('createdAt')}
                >
                  <div className="flex items-center gap-1">
                    {t('table.columns.created')}
                    {sortField === 'createdAt' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      )
                    ) : (
                      <ArrowUpDown className="size-3 text-muted-foreground/50" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="w-8">{t('table.columns.action')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedLabels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    {filterQuery.trim()
                      ? t('empty.filtered')
                      : t('empty.default')}
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedLabels.map((label: ProjectStoreWorkspaceLabel) => (
                  <TableRow
                    key={label.id}
                    data-state={selectedLabels.has(label.id) ? 'selected' : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedLabels.has(label.id)}
                        onCheckedChange={() => toggleSelect(label.id)}
                        aria-label={t('table.selectRowAriaLabel', { name: label.name })}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="size-3 shrink-0 rounded-full"
                          style={{ backgroundColor: label.color }}
                        />
                        <span className="text-sm font-medium">{label.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs capitalize text-muted-foreground">
                        {labelSourceLabel(label.source)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{formatDate(label.createdAt, locale)}</span>
                    </TableCell>
                    <TableCell>
                      <Popover
                        open={editingLabel === label.id}
                        onOpenChange={(open) => {
                          if (!open && isColorEyedropperActive()) return;
                          if (!open) handleCancel();
                        }}
                      >
                        <PopoverTrigger asChild>
                          <div className="inline-block">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                >
                                  <MoreHorizontal className="size-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {labelFilter === 'active' ? (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => handleEdit(label.id, label.name, label.color)}
                                      className="cursor-pointer"
                                    >
                                      <SlidersHorizontal className="mr-2 size-4" />
                                      {t('actions.edit')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      variant="destructive"
                                      className="cursor-pointer"
                                      onClick={() => {
                                        setDeleteConfirmLabelId(label.id);
                                        setDeleteConfirmIsBatch(false);
                                        setDeleteConfirmOpen(true);
                                      }}
                                    >
                                      <Trash2 className="mr-2 size-4" />
                                      {t('actions.delete')}
                                    </DropdownMenuItem>
                                  </>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={async () => {
                                      try {
                                        await restoreWorkspaceLabel(label.id);
                                        toastManager.add({ title: t('toasts.restored'), type: 'success' });
                                        const labels = await fetchWorkspaceLabels(true);
                                        setDeletedLabels(labels);
                                      } catch {
                                        toastManager.add({ title: t('toasts.restoreFailed'), type: 'error' });
                                      }
                                    }}
                                    className="cursor-pointer"
                                  >
                                    <RotateCcw className="mr-2 size-4" />
                                    {t('actions.restore')}
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </PopoverTrigger>
                        {editingLabel === label.id && (
                          <LabelEditorContent
                            side="left"
                            surface={false}
                            newLabelName={editName}
                            newLabelColor={editColor}
                            editingLabel={{ id: label.id, name: label.name, color: label.color, source: label.source }}
                            setNewLabelName={setEditName}
                            setNewLabelColor={setEditColor}
                            onSubmit={handleSave}
                          />
                        )}
                      </Popover>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {selectedLabels.size > 0 && (
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-sm text-muted-foreground">
            {t('selection.summary', {
              selected: selectedLabels.size,
              total: filteredAndSortedLabels.length,
              rowLabel: filteredAndSortedLabels.length === 1
                ? t('selection.rowLabel.one')
                : t('selection.rowLabel.other'),
            })}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1">
                <MoreHorizontal className="size-3.5" />
                {t('actions.menu')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                variant="destructive"
                className="cursor-pointer"
                onClick={() => {
                  setDeleteConfirmLabelId(null);
                  setDeleteConfirmIsBatch(true);
                  setDeleteConfirmOpen(true);
                }}
              >
                <Trash2 className="mr-2 size-4" />
                {t('actions.deleteAll')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deleteConfirmIsBatch
                ? t('deleteConfirm.title.batch')
                : t('deleteConfirm.title.single')}
            </DialogTitle>
            <DialogDescription>
              {deleteConfirmIsBatch
                ? t('deleteConfirm.description.batch', {
                    count: selectedLabels.size,
                    labelWord: selectedLabels.size === 1
                      ? t('deleteConfirm.labelWord.one')
                      : t('deleteConfirm.labelWord.other'),
                  })
                : t('deleteConfirm.description.single')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t('actions.cancel')}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  if (deleteConfirmIsBatch) {
                    const idsToDelete = Array.from(selectedLabels);
                    await Promise.all(idsToDelete.map((id) => deleteWorkspaceLabel(id)));
                    setSelectedLabels(new Set());
                    toastManager.add({
                      title: t('toasts.batchDeleted', {
                        count: idsToDelete.length,
                        labelWord: idsToDelete.length === 1
                          ? t('toasts.labelWord.one')
                          : t('toasts.labelWord.other'),
                      }),
                      type: 'success',
                    });
                  } else if (deleteConfirmLabelId) {
                    await deleteWorkspaceLabel(deleteConfirmLabelId);
                    setSelectedLabels((prev) => {
                      const next = new Set(prev);
                      next.delete(deleteConfirmLabelId);
                      return next;
                    });
                    toastManager.add({ title: t('toasts.deleted'), type: 'success' });
                  }
                } catch {
                  toastManager.add({
                    title: deleteConfirmIsBatch
                      ? t('toasts.batchDeleteFailed')
                      : t('toasts.deleteFailed'),
                    type: 'error',
                  });
                }
                setDeleteConfirmOpen(false);
              }}
            >
              {t('actions.confirmDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
