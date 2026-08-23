"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Editor, TLShapeId } from "tldraw";
import {
  Check,
  ChevronsUpDown,
  Folder,
  FolderGit2,
  Frame,
  GitBranch,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  Button,
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
  cn,
  toastManager,
} from "@workspace/ui";

import {
  useProjects,
  useProjectsLoading,
} from "@/features/project/hooks/use-project-bootstrap-query";
import type { Project } from "@/shared/types/domain";
import { listCanvasFrameTargets, type CanvasFrameTarget } from "@/features/canvas/lib/canvas-widget-frame";
import { findCanvasWidgetPlacements } from "@/features/canvas/lib/canvas-widget-placement";
import {
  CANVAS_WIDGET_GROUPS,
} from "@/features/canvas/lib/canvas-widget-registry";
import {
  ADDABLE_CANVAS_ITEM_TYPES,
  CANVAS_TERMINAL_ADD_ITEM_TYPE,
  type AddableCanvasItemType,
  type CanvasAddContextOption,
  buildCanvasAddContextOptions,
  buildSearchText,
  getCanvasAddItemEntry,
  isCanvasWidgetAddItemType,
  normalizeQuery,
} from "@/features/canvas/lib/canvas-add-widget-catalog";
import { useAddCanvasTerminal } from "@/features/canvas/hooks/use-add-canvas-terminal";
import { useAddAtmosWidget } from "@/features/canvas/hooks/use-add-atmos-widget";
import { focusCanvasShapes } from "@/features/canvas/lib/canvas-shape-focus";
import { useCanvasRuntimeStore } from "@/features/canvas/store/canvas-runtime-store";

const NO_FRAME_VALUE = "__no_frame__";
const ALL_PROJECTS_FILTER = "__all_projects__";

function getAddButtonLabel(
  t: ReturnType<typeof useTranslations>,
  selectedItemTypes: AddableCanvasItemType[],
) {
  if (selectedItemTypes.length > 1) {
    return t("actions.addItems", { count: selectedItemTypes.length });
  }
  return selectedItemTypes[0] === CANVAS_TERMINAL_ADD_ITEM_TYPE
    ? t("actions.addTerminal")
    : t("actions.addWidget");
}

type ContextOption = CanvasAddContextOption;

type ProjectFilterOption = {
  id: string;
  name: string;
  contextCount: number;
};

function buildProjectFilterOptions(projects: Project[]): ProjectFilterOption[] {
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    contextCount: project.workspaces.length + 1,
  }));
}

function filterContextOptions(
  options: ContextOption[],
  projectFilterId: string,
  query: string,
): ContextOption[] {
  const normalizedQuery = normalizeQuery(query);

  return options.filter((option) => {
    if (projectFilterId !== ALL_PROJECTS_FILTER && option.projectId !== projectFilterId) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return option.searchText.includes(normalizedQuery);
  });
}

function groupContextOptionsByProject(options: ContextOption[]) {
  const groups = new Map<string, { projectId: string; projectName: string; options: ContextOption[] }>();

  for (const option of options) {
    const group = groups.get(option.projectId);
    if (group) {
      group.options.push(option);
      continue;
    }

    groups.set(option.projectId, {
      projectId: option.projectId,
      projectName: option.projectName,
      options: [option],
    });
  }

  return Array.from(groups.values());
}

function ProjectFilterButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex max-w-52 shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs",
        active
          ? "border-foreground/25 bg-foreground text-background"
          : "border-border/70 bg-muted/35 text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <span className="truncate">{label}</span>
      <span
        className={cn(
          "rounded px-1 text-[10px] tabular-nums",
          active ? "bg-background/20 text-background" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function CanvasContextPicker({
  isLoadingProjects,
  options,
  projects,
  selectedValue,
  onValueChange,
}: {
  isLoadingProjects: boolean;
  options: ContextOption[];
  projects: Project[];
  selectedValue: string;
  onValueChange: (value: string) => void;
}) {
  const t = useTranslations("canvas.addWidgetDialog");
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [projectFilterId, setProjectFilterId] = React.useState(ALL_PROJECTS_FILTER);
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);

  const projectFilters = React.useMemo(() => buildProjectFilterOptions(projects), [projects]);
  const selectedOption = options.find((option) => option.value === selectedValue);
  const filteredOptions = React.useMemo(
    () => filterContextOptions(options, projectFilterId, query),
    [options, projectFilterId, query],
  );
  const groupedOptions = React.useMemo(
    () => groupContextOptionsByProject(filteredOptions),
    [filteredOptions],
  );

  React.useEffect(() => {
    if (projectFilterId === ALL_PROJECTS_FILTER) {
      return;
    }

    if (!projectFilters.some((project) => project.id === projectFilterId)) {
      setProjectFilterId(ALL_PROJECTS_FILTER);
    }
  }, [projectFilterId, projectFilters]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [open]);

  const handleSelect = (option: ContextOption) => {
    onValueChange(option.value);
    setProjectFilterId(option.projectId);
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex min-h-12 w-full items-center gap-3 rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-left",
            "hover:border-foreground/30 hover:bg-accent/60 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
          )}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/50">
            {selectedOption?.kind === "workspace" ? (
              <FolderGit2 className="size-4 text-muted-foreground" />
            ) : (
              <Folder className="size-4 text-muted-foreground" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">
              {selectedOption
                ? selectedOption.label
                : isLoadingProjects
                  ? t("contextPicker.loadingContexts")
                  : t("contextPicker.selectProjectOrWorkspace")}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {selectedOption
                ? selectedOption.detail
                : t("contextPicker.searchHint")}
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={8}
        className="z-[1001] max-w-[calc(100vw-2rem)] overflow-hidden p-0"
        style={{ width: "var(--radix-popover-trigger-width)" }}
      >
        <div className="border-b border-border/70 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("contextPicker.searchPlaceholder")}
              className="h-9 border-border/80 bg-muted/30 pl-8 pr-8 text-sm"
            />
            {query ? (
              <button
                type="button"
                aria-label={t("contextPicker.clearSearchAria")}
                onClick={() => {
                  setQuery("");
                  searchInputRef.current?.focus();
                }}
                className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
            <ProjectFilterButton
              active={projectFilterId === ALL_PROJECTS_FILTER}
              count={options.length}
              label={t("contextPicker.projectFilterAll")}
              onClick={() => setProjectFilterId(ALL_PROJECTS_FILTER)}
            />
            {projectFilters.map((project) => (
              <ProjectFilterButton
                key={project.id}
                active={projectFilterId === project.id}
                count={project.contextCount}
                label={project.name}
                onClick={() => setProjectFilterId(project.id)}
              />
            ))}
          </div>
        </div>

        <ScrollArea className="h-[min(44vh,360px)]" scrollFade scrollbarGutter>
          <div className="p-2">
            {isLoadingProjects ? (
              <div className="flex items-center gap-2 rounded-md px-2.5 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t("contextPicker.loadingProjectsAndWorkspaces")}
              </div>
            ) : groupedOptions.length > 0 ? (
              groupedOptions.map((group) => (
                <div key={group.projectId} className="[&:not(:first-child)]:mt-2">
                  <div className="sticky top-0 z-10 flex items-center justify-between bg-popover/95 px-2 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
                    <span className="truncate">{group.projectName}</span>
                    <span className="ml-2 shrink-0 tabular-nums">{group.options.length}</span>
                  </div>
                  <div className="space-y-1">
                    {group.options.map((option) => {
                      const active = option.value === selectedValue;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleSelect(option)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left",
                            "hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none",
                            active && "bg-accent text-accent-foreground",
                          )}
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background/80">
                            {option.kind === "workspace" ? (
                              <FolderGit2 className="size-4 text-muted-foreground" />
                            ) : (
                              <Folder className="size-4 text-muted-foreground" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-sm font-medium text-foreground">
                                {option.label}
                              </span>
                              <span className="shrink-0 rounded border border-border/70 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                {option.kind === "project" ? t("contextPicker.projectKind") : t("contextPicker.workspaceKind")}
                              </span>
                            </span>
                            <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                              {option.branch ? (
                                <span className="inline-flex min-w-0 items-center gap-1">
                                  <GitBranch className="size-3 shrink-0" />
                                  <span className="truncate">{option.branch}</span>
                                </span>
                              ) : option.workspaceCount != null ? (
                                <span>{t("contextPicker.workspaceCount", { count: option.workspaceCount })}</span>
                              ) : null}
                              <span className="min-w-0 truncate">{option.path}</span>
                            </span>
                          </span>
                          {active ? <Check className="size-4 shrink-0 text-success" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-md px-2.5 py-8 text-center">
                <div className="text-sm font-medium text-foreground">{t("contextPicker.emptyTitle")}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t("contextPicker.emptyDescription")}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export function CanvasAddAtmosWidgetPopover({
  editor,
  open,
  onOpenChange,
  triggerClassName,
}: {
  editor: Editor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerClassName?: string;
}) {
  const t = useTranslations("canvas.addWidgetDialog");
  const projects = useProjects();
  const isLoadingProjects = useProjectsLoading();
  const setFocusPulseShapeIds = useCanvasRuntimeStore((state) => state.setFocusPulseShapeIds);
  const addWidget = useAddAtmosWidget(editor);
  const addTerminal = useAddCanvasTerminal(editor);
  const [selectedContextValue, setSelectedContextValue] = React.useState("");
  const [selectedItemTypes, setSelectedItemTypes] = React.useState<AddableCanvasItemType[]>([]);
  const [selectedFrameValue, setSelectedFrameValue] = React.useState(NO_FRAME_VALUE);
  const [frameTargets, setFrameTargets] = React.useState<CanvasFrameTarget[]>([]);
  const [isAdding, setIsAdding] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    if (editor) {
      setFrameTargets(listCanvasFrameTargets(editor));
    }
  }, [editor, isLoadingProjects, open, projects.length]);

  React.useEffect(() => {
    if (open) return;
    setSelectedContextValue("");
    setSelectedItemTypes([]);
    setSelectedFrameValue(NO_FRAME_VALUE);
    setIsAdding(false);
  }, [open]);

  const contextOptions = React.useMemo(() => buildCanvasAddContextOptions(projects), [projects]);
  const selectedContext = contextOptions.find((option) => option.value === selectedContextValue);
  const selectedFrameId =
    selectedFrameValue === NO_FRAME_VALUE ? null : (selectedFrameValue as TLShapeId);
  const getEntryLabel = React.useCallback(
    (type: AddableCanvasItemType) =>
      type === CANVAS_TERMINAL_ADD_ITEM_TYPE ? t("terminal.label") : getCanvasAddItemEntry(type).label,
    [t],
  );
  const getEntryDescription = React.useCallback(
    (type: AddableCanvasItemType) =>
      type === CANVAS_TERMINAL_ADD_ITEM_TYPE
        ? t("terminal.description")
        : getCanvasAddItemEntry(type).description,
    [t],
  );
  const selectedItemsCanBeAdded = selectedItemTypes.every((type) => {
    const entry = getCanvasAddItemEntry(type);
    return !entry.requiresContext || Boolean(selectedContext);
  });
  const canAdd = Boolean(editor && selectedItemTypes.length > 0 && selectedItemsCanBeAdded && !isAdding);

  const toggleItemType = (type: AddableCanvasItemType) => {
    setSelectedItemTypes((prev) =>
      prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type],
    );
  };

  const handleAdd = async () => {
    if (!editor || selectedItemTypes.length === 0 || !selectedItemsCanBeAdded || isAdding) {
      return;
    }

    setIsAdding(true);
    const placements = findCanvasWidgetPlacements(
      editor,
      selectedItemTypes.map((itemType) => getCanvasAddItemEntry(itemType).defaultSize),
      { frameId: selectedFrameId },
    );

    const createdShapeIds: TLShapeId[] = [];
    try {
      for (const [index, itemType] of selectedItemTypes.entries()) {
        const entry = getCanvasAddItemEntry(itemType);
        const position = placements[index];
        const shapeId = isCanvasWidgetAddItemType(itemType)
          ? addWidget({
              widgetType: itemType,
              context: selectedContext?.context ?? null,
              frameId: selectedFrameId,
              position,
              select: false,
            })
          : await addTerminal({
              context: selectedContext?.context ?? null,
              frameId: selectedFrameId,
              position,
              select: false,
            });

        if (shapeId) {
          createdShapeIds.push(shapeId);
        } else {
          throw new Error(t("toast.couldNotAddNamed", { itemName: getEntryLabel(itemType) }));
        }
      }

      if (createdShapeIds.length > 0) {
        focusCanvasShapes(editor, createdShapeIds, {
          getFocusPulseShapeIds: () => useCanvasRuntimeStore.getState().focusPulseShapeIds,
          setFocusPulseShapeIds,
        });
        onOpenChange(false);
      }
    } catch (error) {
      if (createdShapeIds.length > 0) {
        editor.deleteShapes(createdShapeIds);
      }
      toastManager.add({
        title: t("toast.title"),
        description: error instanceof Error ? error.message : t("toast.addFailed"),
        type: "error",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && !editor) {
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={!editor}
          className={cn(
            "h-8 gap-1 rounded-md border-0 bg-transparent px-2 text-muted-foreground shadow-none",
            "hover:bg-foreground/10 hover:text-foreground data-[state=open]:bg-foreground/10 data-[state=open]:text-foreground",
            triggerClassName,
          )}
          title={t("trigger.title")}
          aria-label={t("trigger.aria")}
        >
          <Plus className="size-3.5" />
          <span className="text-xs font-medium">{t("trigger.label")}</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        className="z-[1000] flex h-[min(54rem,var(--radix-popover-content-available-height))] max-h-[calc(100vh-1rem)] w-[min(42rem,calc(100vw-2rem))] flex-col overflow-hidden p-0"
      >
        <div className="shrink-0 border-b border-border/70 px-5 py-4">
          <div className="text-base font-semibold leading-none text-foreground">{t("title")}</div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
          <div className="grid gap-5 p-5">
            <section className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                {t("sections.projectWorkspace")}
              </div>
              <CanvasContextPicker
                isLoadingProjects={isLoadingProjects}
                options={contextOptions}
                projects={projects}
                selectedValue={selectedContextValue}
                onValueChange={setSelectedContextValue}
              />
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-muted-foreground">{t("sections.component")}</div>
                {selectedItemTypes.length > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {t("selectedCount", { count: selectedItemTypes.length })}
                  </span>
                ) : !selectedContext ? (
                  <span className="text-xs text-muted-foreground">{t("globalWidgetsAvailable")}</span>
                ) : null}
              </div>
              <div className="space-y-4 rounded-md border border-dashed border-border/80 p-3">
                {CANVAS_WIDGET_GROUPS.map((group) => {
                  const itemTypes = ADDABLE_CANVAS_ITEM_TYPES.filter(
                    (type) => getCanvasAddItemEntry(type).group === group.id,
                  );

                  if (itemTypes.length === 0) {
                    return null;
                  }

                  return (
                    <div key={group.id} className="space-y-2">
                      <div className="text-[11px] font-medium text-muted-foreground">
                        {group.label}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {itemTypes.map((type) => {
                          const entry = getCanvasAddItemEntry(type);
                          const Icon = entry.icon;
                          const active = selectedItemTypes.includes(type);
                          const disabled = entry.requiresContext && !selectedContext;
                          return (
                            <button
                              key={type}
                              type="button"
                              aria-pressed={active}
                              disabled={disabled}
                              onClick={() => toggleItemType(type)}
                              className={cn(
                                "flex min-h-20 items-start gap-3 rounded-md bg-muted/35 p-3 text-left",
                                "enabled:hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
                                "disabled:cursor-not-allowed disabled:bg-muted/20 disabled:opacity-45",
                                active && "bg-accent",
                              )}
                            >
                              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                              <span className="min-w-0 flex-1">
                                <span className="flex min-w-0 items-center justify-between gap-3 text-sm font-medium text-foreground">
                                  <span className="min-w-0 truncate">{getEntryLabel(type)}</span>
                                  {active ? <Check className="size-3.5 shrink-0 text-success" /> : null}
                                </span>
                                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                                  {getEntryDescription(type)}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">{t("sections.frame")}</div>
              <Select value={selectedFrameValue} onValueChange={setSelectedFrameValue}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder={t("frame.noFrame")} />
                </SelectTrigger>
                <SelectContent className="z-[1001]">
                  <SelectItem value={NO_FRAME_VALUE}>{t("frame.noFrame")}</SelectItem>
                  {frameTargets.map((frame) => (
                    <SelectItem key={frame.id} value={frame.id}>
                      <span className="flex items-center gap-2">
                        <Frame className="size-3.5 text-muted-foreground" />
                        {frame.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border/70 px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={handleAdd} disabled={!canAdd} className="gap-2">
            {isLoadingProjects || isAdding ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {getAddButtonLabel(t, selectedItemTypes)}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
