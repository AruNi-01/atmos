"use client";

import React from "react";
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
} from "@workspace/ui";

import { useProjectStore } from "@/features/project/store/use-project-store";
import type { Project, Workspace } from "@/shared/types/domain";
import { listCanvasFrameTargets, type CanvasFrameTarget } from "@/features/canvas/lib/canvas-widget-frame";
import type { CanvasContextRef } from "@/features/canvas/lib/canvas-widget-shape";
import {
  ADDABLE_CANVAS_WIDGET_TYPES,
  CANVAS_WIDGET_REGISTRY,
  type AddableCanvasWidgetType,
} from "@/features/canvas/lib/canvas-widget-registry";
import { useAddAtmosWidget } from "@/features/canvas/hooks/use-add-atmos-widget";

const NO_FRAME_VALUE = "__no_frame__";
const ALL_PROJECTS_FILTER = "__all_projects__";

type ContextOption = {
  value: string;
  kind: "project" | "workspace";
  label: string;
  detail: string;
  projectId: string;
  projectName: string;
  branch?: string;
  path: string;
  workspaceCount?: number;
  searchText: string;
  context: CanvasContextRef;
};

type ProjectFilterOption = {
  id: string;
  name: string;
  contextCount: number;
};

function buildProjectContext(project: Project): CanvasContextRef {
  return {
    contextScope: "project",
    projectId: project.id,
    workspaceId: null,
    projectName: project.name,
    workspaceName: null,
    localPath: project.mainFilePath,
    repoPath: project.mainFilePath,
  };
}

function buildWorkspaceContext(project: Project, workspace: Workspace): CanvasContextRef {
  return {
    contextScope: "workspace",
    projectId: project.id,
    workspaceId: workspace.id,
    projectName: project.name,
    workspaceName: workspace.displayName || workspace.name,
    localPath: workspace.localPath,
    repoPath: workspace.localPath,
  };
}

function buildContextOptions(projects: Project[]): ContextOption[] {
  return projects.flatMap((project) => {
    const projectOption: ContextOption = {
      value: `project:${project.id}`,
      kind: "project",
      label: project.name,
      detail: project.mainFilePath,
      projectId: project.id,
      projectName: project.name,
      path: project.mainFilePath,
      workspaceCount: project.workspaces.length,
      searchText: buildSearchText([project.name, project.mainFilePath, project.targetBranch ?? ""]),
      context: buildProjectContext(project),
    };
    const workspaceOptions = project.workspaces.map((workspace): ContextOption => ({
      value: `workspace:${workspace.id}`,
      kind: "workspace",
      label: workspace.displayName || workspace.name,
      detail: `${project.name} / ${workspace.branch}`,
      projectId: project.id,
      projectName: project.name,
      branch: workspace.branch,
      path: workspace.localPath,
      searchText: buildSearchText([
        workspace.displayName ?? "",
        workspace.name,
        workspace.branch,
        workspace.localPath,
        project.name,
        project.mainFilePath,
      ]),
      context: buildWorkspaceContext(project, workspace),
    }));
    return [projectOption, ...workspaceOptions];
  });
}

function buildProjectFilterOptions(projects: Project[]): ProjectFilterOption[] {
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    contextCount: project.workspaces.length + 1,
  }));
}

function buildSearchText(parts: string[]): string {
  return parts.join(" ").toLocaleLowerCase();
}

function normalizeQuery(query: string): string {
  return query.trim().toLocaleLowerCase();
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
        "inline-flex max-w-52 shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-foreground/25 bg-foreground text-background"
          : "border-border/70 bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
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
            "flex min-h-12 w-full items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-left transition-colors",
            "hover:border-foreground/30 hover:bg-accent/40 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
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
                  ? "Loading contexts..."
                  : "Select project or workspace"}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {selectedOption
                ? selectedOption.detail
                : "Search by project, workspace, branch, or path"}
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
              placeholder="Search projects, workspaces, branches, paths"
              className="h-9 border-border/80 bg-muted/30 pl-8 pr-8 text-sm"
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
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
              label="All"
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
                Loading projects and workspaces...
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
                            "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors",
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
                                {option.kind === "project" ? "Project" : "Workspace"}
                              </span>
                            </span>
                            <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                              {option.branch ? (
                                <span className="inline-flex min-w-0 items-center gap-1">
                                  <GitBranch className="size-3 shrink-0" />
                                  <span className="truncate">{option.branch}</span>
                                </span>
                              ) : option.workspaceCount != null ? (
                                <span>{option.workspaceCount} workspaces</span>
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
                <div className="text-sm font-medium text-foreground">No matching context</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Try another search term or clear the project filter.
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
  const projects = useProjectStore((state) => state.projects);
  const isLoadingProjects = useProjectStore((state) => state.isLoading);
  const fetchProjects = useProjectStore((state) => state.fetchProjects);
  const addWidget = useAddAtmosWidget(editor);
  const [selectedContextValue, setSelectedContextValue] = React.useState("");
  const [selectedWidgetTypes, setSelectedWidgetTypes] = React.useState<AddableCanvasWidgetType[]>([]);
  const [selectedFrameValue, setSelectedFrameValue] = React.useState(NO_FRAME_VALUE);
  const [frameTargets, setFrameTargets] = React.useState<CanvasFrameTarget[]>([]);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    if (projects.length === 0 && !isLoadingProjects) {
      void fetchProjects();
    }
    if (editor) {
      setFrameTargets(listCanvasFrameTargets(editor));
    }
  }, [editor, fetchProjects, isLoadingProjects, open, projects.length]);

  React.useEffect(() => {
    if (open) return;
    setSelectedContextValue("");
    setSelectedWidgetTypes([]);
    setSelectedFrameValue(NO_FRAME_VALUE);
  }, [open]);

  const contextOptions = React.useMemo(() => buildContextOptions(projects), [projects]);
  const selectedContext = contextOptions.find((option) => option.value === selectedContextValue);
  const selectedFrameId =
    selectedFrameValue === NO_FRAME_VALUE ? null : (selectedFrameValue as TLShapeId);
  const canAdd = Boolean(editor && selectedContext && selectedWidgetTypes.length > 0);

  const toggleWidgetType = (type: AddableCanvasWidgetType) => {
    setSelectedWidgetTypes((prev) =>
      prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type],
    );
  };

  const handleAdd = () => {
    if (!selectedContext || selectedWidgetTypes.length === 0) {
      return;
    }

    const createdShapeIds = selectedWidgetTypes
      .map((widgetType) =>
        addWidget({
          widgetType,
          context: selectedContext.context,
          frameId: selectedFrameId,
        }),
      )
      .filter(Boolean);

    if (createdShapeIds.length > 0) {
      onOpenChange(false);
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
          title="Add Widget"
          aria-label="Add Widget"
        >
          <Plus className="size-3.5" />
          <span className="text-xs font-medium">Widget</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        className="z-[1000] w-[min(42rem,calc(100vw-2rem))] overflow-hidden p-0"
      >
        <div className="border-b border-border/70 px-5 py-4">
          <div className="text-base font-semibold leading-none text-foreground">Add Atmos Widget</div>
          <div className="mt-1.5 text-sm text-muted-foreground">
            Choose a Project or Workspace first, then choose the Canvas widget to add.
          </div>
        </div>

        <div className="grid gap-5 p-5">
          <section className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">
              Project / Workspace
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
              <div className="text-xs font-medium text-muted-foreground">Component</div>
              {!selectedContext ? (
                <span className="text-xs text-muted-foreground">Select a context first</span>
              ) : selectedWidgetTypes.length > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {selectedWidgetTypes.length} selected
                </span>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ADDABLE_CANVAS_WIDGET_TYPES.map((type) => {
                const entry = CANVAS_WIDGET_REGISTRY[type];
                const Icon = entry.icon;
                const active = selectedWidgetTypes.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={active}
                    disabled={!selectedContext}
                    onClick={() => toggleWidgetType(type)}
                    className={cn(
                      "flex min-h-20 items-start gap-3 rounded-md border border-border bg-background p-3 text-left transition-colors",
                      "enabled:hover:border-foreground/30 enabled:hover:bg-accent/60",
                      "disabled:cursor-not-allowed disabled:opacity-45",
                      active && "border-foreground/40 bg-accent",
                    )}
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center justify-between gap-3 text-sm font-medium text-foreground">
                        <span className="min-w-0 truncate">{entry.label}</span>
                        {active ? <Check className="size-3.5 shrink-0 text-success" /> : null}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        {entry.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Frame</div>
            <Select value={selectedFrameValue} onValueChange={setSelectedFrameValue}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue placeholder="No frame" />
              </SelectTrigger>
              <SelectContent className="z-[1001]">
                <SelectItem value={NO_FRAME_VALUE}>No frame</SelectItem>
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

        <div className="flex justify-end gap-2 border-t border-border/70 px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!canAdd} className="gap-2">
            {isLoadingProjects ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {selectedWidgetTypes.length > 1
              ? `Add ${selectedWidgetTypes.length} Widgets`
              : "Add Widget"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
