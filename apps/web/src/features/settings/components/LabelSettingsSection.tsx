'use client';

import React from 'react';
import { useTheme } from 'next-themes';
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
import { LabelEditorContent } from '@/app-shell/sidebar/workspace-metadata-controls';

type ProjectStoreState = ReturnType<typeof useProjectStore.getState>;
type ProjectStoreWorkspaceLabel = ProjectStoreState['workspaceLabels'][number];

function parseColorToRgb(colorStr: string): { r: number; g: number; b: number; a: number } {
  const hex = colorStr.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  return { r, g, b, a: 1 };
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString();
}

export function LabelSettingsSection() {
  const {
    workspaceLabels,
    updateWorkspaceLabel,
    createWorkspaceLabel,
    deleteWorkspaceLabel,
    fetchWorkspaceLabels,
    restoreWorkspaceLabel,
  } = useProjectStore(
    useShallow((state: ProjectStoreState) => ({
      workspaceLabels: state.workspaceLabels,
      updateWorkspaceLabel: state.updateWorkspaceLabel,
      createWorkspaceLabel: state.createWorkspaceLabel,
      deleteWorkspaceLabel: state.deleteWorkspaceLabel,
      fetchWorkspaceLabels: state.fetchWorkspaceLabels,
      restoreWorkspaceLabel: state.restoreWorkspaceLabel,
    })),
  );
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [selectedLabels, setSelectedLabels] = React.useState<Set<string>>(new Set());
  const [editingLabel, setEditingLabel] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editColor, setEditColor] = React.useState<{ r: number; g: number; b: number; a: number }>({
    r: 148,
    g: 163,
    b: 184,
    a: 1,
  });
  const [sortField, setSortField] = React.useState<'name' | 'createdAt' | null>(null);
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');
  const [filterQuery, setFilterQuery] = React.useState('');
  const [selectedSources, setSelectedSources] = React.useState<Set<string>>(new Set());
  const [isCreatingNew, setIsCreatingNew] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deleteConfirmLabelId, setDeleteConfirmLabelId] = React.useState<string | null>(null);
  const [deleteConfirmIsBatch, setDeleteConfirmIsBatch] = React.useState(false);
  const [labelFilter, setLabelFilter] = React.useState<'active' | 'deleted'>('active');

  React.useEffect(() => {
    fetchWorkspaceLabels(labelFilter === 'deleted');
  }, [labelFilter, fetchWorkspaceLabels]);

  const filteredAndSortedLabels = React.useMemo(() => {
    let labels = [...workspaceLabels];

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
  }, [workspaceLabels, filterQuery, selectedSources, sortField, sortDirection]);

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
      setEditColor(parseColorToRgb(color));
    }, 250);
  };

  const handleSave = async () => {
    const trimmedName = editName.trim();
    if (!trimmedName) return;

    if (
      isCreatingNew &&
      workspaceLabels.some((label) => label.name.toLowerCase() === trimmedName.toLowerCase())
    ) {
      toastManager.add({ title: 'A label with this name already exists', type: 'error' });
      return;
    }

    if (
      !isCreatingNew &&
      editingLabel &&
      workspaceLabels.some(
        (label) => label.id !== editingLabel && label.name.toLowerCase() === trimmedName.toLowerCase(),
      )
    ) {
      toastManager.add({ title: 'A label with this name already exists', type: 'error' });
      return;
    }

    try {
      const rgb = editColor;
      const hexColor = `#${((1 << 24) + (rgb.r << 16) + (rgb.g << 8) + rgb.b).toString(16).slice(1)}`;
      if (isCreatingNew) {
        await createWorkspaceLabel({ name: trimmedName, color: hexColor });
        setIsCreatingNew(false);
        toastManager.add({ title: 'Label created', type: 'success' });
      } else if (editingLabel) {
        await updateWorkspaceLabel(editingLabel, { name: trimmedName, color: hexColor });
        setEditingLabel(null);
        toastManager.add({ title: 'Label updated', type: 'success' });
      }
    } catch {
      toastManager.add({ title: isCreatingNew ? 'Failed to create label' : 'Failed to update label', type: 'error' });
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
            placeholder="Filter by name..."
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
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="deleted">Deleted</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto">
          {labelFilter === 'active' && (
            <Popover
              open={isCreatingNew}
              onOpenChange={(open) => { if (!open) handleCancel(); }}
            >
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => {
                    setIsCreatingNew(true);
                    setEditName('');
                    setEditColor({ r: 148, g: 163, b: 184, a: 1 });
                  }}
                >
                  <Plus className="size-3.5" />
                  New
                </Button>
              </PopoverTrigger>
              {isCreatingNew && (
                <LabelEditorContent
                  isDark={isDark}
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
                    aria-label="Select all labels"
                  />
                </TableHead>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-1">
                    Name
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
                        Source
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
                        <span>Manual</span>
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
                        <span>GitHub Issue</span>
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
                        <span>GitHub PR</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableHead>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('createdAt')}
                >
                  <div className="flex items-center gap-1">
                    Created
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
                <TableHead className="w-8">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedLabels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    {filterQuery.trim() ? 'No matching labels found' : 'No labels created yet'}
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
                        aria-label={`Select ${label.name}`}
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
                        {label.source === 'manual' ? 'Manual' : label.source === 'gitHub_issue' ? 'GitHub Issue' : 'GitHub PR'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{formatDate(label.createdAt)}</span>
                    </TableCell>
                    <TableCell>
                      <Popover
                        open={editingLabel === label.id}
                        onOpenChange={(open) => { if (!open) handleCancel(); }}
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
                                      Edit
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
                                      Delete
                                    </DropdownMenuItem>
                                  </>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={async () => {
                                      try {
                                        await restoreWorkspaceLabel(label.id);
                                        toastManager.add({ title: 'Label restored', type: 'success' });
                                        await fetchWorkspaceLabels(true);
                                      } catch {
                                        toastManager.add({ title: 'Failed to restore label', type: 'error' });
                                      }
                                    }}
                                    className="cursor-pointer"
                                  >
                                    <RotateCcw className="mr-2 size-4" />
                                    Restore
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </PopoverTrigger>
                        {editingLabel === label.id && (
                          <LabelEditorContent
                            isDark={isDark}
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
            {selectedLabels.size} of {filteredAndSortedLabels.length} row{filteredAndSortedLabels.length !== 1 ? 's' : ''} selected
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1">
                <MoreHorizontal className="size-3.5" />
                Actions
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
                Delete All
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {deleteConfirmIsBatch ? 'Labels' : 'Label'}?</DialogTitle>
            <DialogDescription>
              {deleteConfirmIsBatch
                ? `Are you sure you want to delete ${selectedLabels.size} selected label${selectedLabels.size !== 1 ? 's' : ''}? This action cannot be undone.`
                : 'Are you sure you want to delete this label? This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  if (deleteConfirmIsBatch) {
                    const idsToDelete = Array.from(selectedLabels);
                    await Promise.all(idsToDelete.map((id) => deleteWorkspaceLabel(id)));
                    setSelectedLabels(new Set());
                    toastManager.add({ title: `${idsToDelete.length} label${idsToDelete.length !== 1 ? 's' : ''} deleted`, type: 'success' });
                  } else if (deleteConfirmLabelId) {
                    await deleteWorkspaceLabel(deleteConfirmLabelId);
                    setSelectedLabels((prev) => {
                      const next = new Set(prev);
                      next.delete(deleteConfirmLabelId);
                      return next;
                    });
                    toastManager.add({ title: 'Label deleted', type: 'success' });
                  }
                } catch {
                  toastManager.add({ title: deleteConfirmIsBatch ? 'Failed to delete labels' : 'Failed to delete label', type: 'error' });
                }
                setDeleteConfirmOpen(false);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
