"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  ChevronsUpDown,
  Folder,
  FolderGit2,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import type { Editor, TLShapeId } from "tldraw";
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
  toastManager,
} from "@workspace/ui";

import {
  useProjects,
  useProjectsLoading,
} from "@/features/project/hooks/use-project-bootstrap-query";
import {
  findFrameContainingPageRect,
  type CanvasPageRect,
} from "@/features/canvas/lib/canvas-empty-brush";
import { CANVAS_WIDGET_GROUPS } from "@/features/canvas/lib/canvas-widget-registry";
import {
  ADDABLE_CANVAS_ITEM_TYPES,
  CANVAS_TERMINAL_ADD_ITEM_TYPE,
  type AddableCanvasItemType,
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

function rectToViewportStyle(
  editor: Editor,
  rect: CanvasPageRect,
): { left: number; top: number; width: number; height: number } | null {
  try {
    const topLeft = editor.pageToViewport({ x: rect.x, y: rect.y });
    const bottomRight = editor.pageToViewport({
      x: rect.x + rect.w,
      y: rect.y + rect.h,
    });
    return {
      left: Math.min(topLeft.x, bottomRight.x),
      top: Math.min(topLeft.y, bottomRight.y),
      width: Math.abs(bottomRight.x - topLeft.x),
      height: Math.abs(bottomRight.y - topLeft.y),
    };
  } catch {
    return null;
  }
}

/**
 * Compact add-widget UI for an empty marquee region (ghost outline + centered panel).
 */
export function CanvasEmptyBrushAddWidgetPopover({
  editor,
  region,
  open,
  onOpenChange,
}: {
  editor: Editor;
  region: CanvasPageRect;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("canvas.addWidgetDialog");
  const tEmpty = useTranslations("canvas.emptyBrushAddWidget");
  const projects = useProjects();
  const isLoadingProjects = useProjectsLoading();
  const setFocusPulseShapeIds = useCanvasRuntimeStore((state) => state.setFocusPulseShapeIds);
  const addWidget = useAddAtmosWidget(editor);
  const addTerminal = useAddCanvasTerminal(editor);

  const [selectedContextValue, setSelectedContextValue] = React.useState<string | null>(null);
  const [selectedItemType, setSelectedItemType] = React.useState<AddableCanvasItemType | null>(
    null,
  );
  const [contextPickerOpen, setContextPickerOpen] = React.useState(false);
  const [contextQuery, setContextQuery] = React.useState("");
  const [componentQuery, setComponentQuery] = React.useState("");
  const [isAdding, setIsAdding] = React.useState(false);
  const [viewportRect, setViewportRect] = React.useState(() =>
    rectToViewportStyle(editor, region),
  );
  const componentSearchRef = React.useRef<HTMLInputElement | null>(null);
  const contextSearchRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    setSelectedContextValue(null);
    setSelectedItemType(null);
    setContextPickerOpen(false);
    setContextQuery("");
    setComponentQuery("");
    setIsAdding(false);
  }, [region.x, region.y, region.w, region.h]);

  React.useEffect(() => {
    if (!open) {
      setContextPickerOpen(false);
      return;
    }
    const frame = requestAnimationFrame(() => {
      componentSearchRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, region.x, region.y]);

  React.useEffect(() => {
    if (!contextPickerOpen) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      contextSearchRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [contextPickerOpen]);

  React.useEffect(() => {
    const sync = () => {
      setViewportRect(rectToViewportStyle(editor, region));
    };
    sync();
    const cleanup = editor.store.listen(sync, { scope: "session" });
    return cleanup;
  }, [editor, region]);

  const contextOptions = React.useMemo(
    () => buildCanvasAddContextOptions(projects),
    [projects],
  );
  const selectedContext = contextOptions.find((option) => option.value === selectedContextValue);
  const frameId = React.useMemo(
    () => findFrameContainingPageRect(editor, region),
    [editor, region],
  );

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

  const filteredContextOptions = React.useMemo(() => {
    const query = normalizeQuery(contextQuery);
    if (!query) {
      return contextOptions;
    }
    return contextOptions.filter((option) => option.searchText.includes(query));
  }, [contextOptions, contextQuery]);

  const filteredItemTypes = React.useMemo(() => {
    const query = normalizeQuery(componentQuery);
    if (!query) {
      return ADDABLE_CANVAS_ITEM_TYPES;
    }
    return ADDABLE_CANVAS_ITEM_TYPES.filter((type) => {
      const label = getEntryLabel(type);
      const description = getEntryDescription(type);
      return buildSearchText([label, description, type]).includes(query);
    });
  }, [componentQuery, getEntryDescription, getEntryLabel]);

  const groupedItemTypes = React.useMemo(() => {
    return CANVAS_WIDGET_GROUPS.map((group) => ({
      group,
      itemTypes: filteredItemTypes.filter(
        (type) => getCanvasAddItemEntry(type).group === group.id,
      ),
    })).filter((entry) => entry.itemTypes.length > 0);
  }, [filteredItemTypes]);

  const selectedEntry = selectedItemType ? getCanvasAddItemEntry(selectedItemType) : null;
  const needsContext = Boolean(selectedEntry?.requiresContext);
  const canAdd = Boolean(
    editor && selectedItemType && (!needsContext || selectedContext) && !isAdding,
  );

  const handleAdd = async () => {
    if (!selectedItemType || !canAdd || isAdding) {
      return;
    }

    setIsAdding(true);
    const size = { w: region.w, h: region.h };
    const position = { x: region.x, y: region.y };
    let createdShapeId: TLShapeId | null = null;

    try {
      createdShapeId = isCanvasWidgetAddItemType(selectedItemType)
        ? addWidget({
            widgetType: selectedItemType,
            context: selectedContext?.context ?? null,
            frameId,
            position,
            size,
            select: false,
          })
        : await addTerminal({
            context: selectedContext?.context ?? null,
            frameId,
            position,
            size,
            select: false,
          });

      if (!createdShapeId) {
        throw new Error(t("toast.couldNotAddNamed", { itemName: getEntryLabel(selectedItemType) }));
      }

      focusCanvasShapes(editor, [createdShapeId], {
        getFocusPulseShapeIds: () => useCanvasRuntimeStore.getState().focusPulseShapeIds,
        setFocusPulseShapeIds,
      });
      onOpenChange(false);
    } catch (error) {
      if (createdShapeId) {
        editor.deleteShapes([createdShapeId]);
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

  // Keep ghost positioning when the viewport rect is available; panel itself is
  // always centered so large marquees do not squeeze the UI off-screen.
  const showGhost = open && viewportRect;

  const selectContext = (value: string | null) => {
    setSelectedContextValue(value);
    setContextPickerOpen(false);
    setContextQuery("");
    // Match main Add Widget: without context, context-bound widgets are unselectable.
    if (value == null && selectedItemType && getCanvasAddItemEntry(selectedItemType).requiresContext) {
      setSelectedItemType(null);
    }
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-[var(--tl-layer-panels,300)]">
      {showGhost && viewportRect ? (
        <div
          className={cn(
            "pointer-events-none absolute rounded-md border border-dashed border-primary/55 bg-primary/5",
            "animate-in fade-in-0 zoom-in-95 duration-150",
          )}
          style={{
            left: viewportRect.left,
            top: viewportRect.top,
            width: viewportRect.width,
            height: viewportRect.height,
          }}
        />
      ) : null}

      {/* Fixed center of the canvas viewport — independent of marquee size. */}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center p-4 transition-[opacity,transform] duration-200 ease-out",
          open
            ? "pointer-events-none opacity-100 scale-100"
            : "pointer-events-none opacity-0 scale-95",
        )}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={tEmpty("title")}
          className={cn(
            "pointer-events-auto flex w-[min(32rem,calc(100vw-1.5rem))] max-h-[min(40rem,calc(100vh-1.5rem))] flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md outline-none",
          )}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{tEmpty("title")}</span>
              </div>
              <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                {tEmpty("sizeHint", {
                  width: Math.round(region.w),
                  height: Math.round(region.h),
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("actions.cancel")}
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 [scrollbar-gutter:stable]">
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-muted-foreground">
                  {t("sections.projectWorkspace")}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {selectedContext ? tEmpty("contextSelected") : tEmpty("contextOptional")}
                </span>
              </div>

              <Popover open={contextPickerOpen} onOpenChange={setContextPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2.5 rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-left",
                      "hover:border-foreground/30 hover:bg-accent/60 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
                    )}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/50">
                      {selectedContext?.kind === "workspace" ? (
                        <FolderGit2 className="size-3.5 text-muted-foreground" />
                      ) : (
                        <Folder className="size-3.5 text-muted-foreground" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {selectedContext
                          ? selectedContext.label
                          : isLoadingProjects
                            ? t("contextPicker.loadingContexts")
                            : tEmpty("contextButtonPlaceholder")}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {selectedContext
                          ? selectedContext.detail
                          : tEmpty("contextButtonHint")}
                      </span>
                    </span>
                    <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  side="bottom"
                  sideOffset={6}
                  className="z-[1001] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] overflow-hidden p-0"
                  onOpenAutoFocus={(event) => event.preventDefault()}
                >
                  <div className="border-b border-border/70 p-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        ref={contextSearchRef}
                        value={contextQuery}
                        onChange={(event) => setContextQuery(event.target.value)}
                        placeholder={t("contextPicker.searchPlaceholder")}
                        className="h-9 border-border/80 bg-muted/30 pl-8 pr-8 text-sm"
                      />
                      {contextQuery ? (
                        <button
                          type="button"
                          aria-label={t("contextPicker.clearSearchAria")}
                          onClick={() => {
                            setContextQuery("");
                            contextSearchRef.current?.focus();
                          }}
                          className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <X className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="max-h-[min(40vh,280px)] space-y-1 overflow-y-auto p-1.5">
                    <button
                      type="button"
                      onClick={() => selectContext(null)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm",
                        "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
                        selectedContextValue == null && "bg-accent text-accent-foreground",
                      )}
                    >
                      <span className="truncate">{tEmpty("contextNone")}</span>
                      {selectedContextValue == null ? (
                        <Check className="size-3.5 shrink-0 text-success" />
                      ) : null}
                    </button>

                    {isLoadingProjects ? (
                      <div className="flex items-center gap-2 px-2.5 py-3 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" />
                        {t("contextPicker.loadingProjectsAndWorkspaces")}
                      </div>
                    ) : filteredContextOptions.length > 0 ? (
                      filteredContextOptions.map((option) => {
                        const active = option.value === selectedContextValue;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => selectContext(option.value)}
                            className={cn(
                              "flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left",
                              "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
                              active && "bg-accent text-accent-foreground",
                            )}
                          >
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background/80">
                              {option.kind === "workspace" ? (
                                <FolderGit2 className="size-3.5 text-muted-foreground" />
                              ) : (
                                <Folder className="size-3.5 text-muted-foreground" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate text-sm font-medium">{option.label}</span>
                                <span className="shrink-0 rounded border border-border/70 bg-muted/50 px-1 py-px text-[10px] font-medium text-muted-foreground">
                                  {option.kind === "project"
                                    ? t("contextPicker.projectKind")
                                    : t("contextPicker.workspaceKind")}
                                </span>
                              </span>
                              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                                {option.detail}
                              </span>
                            </span>
                            {active ? (
                              <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                            ) : null}
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-2.5 py-4 text-center text-xs text-muted-foreground">
                        {t("contextPicker.emptyTitle")}
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-muted-foreground">
                  {t("sections.component")}
                </div>
                {selectedItemType ? (
                  <span className="truncate text-[11px] text-muted-foreground">
                    {getEntryLabel(selectedItemType)}
                  </span>
                ) : !selectedContext ? (
                  <span className="text-[11px] text-muted-foreground">
                    {t("globalWidgetsAvailable")}
                  </span>
                ) : null}
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={componentSearchRef}
                  value={componentQuery}
                  onChange={(event) => setComponentQuery(event.target.value)}
                  placeholder={tEmpty("componentSearchPlaceholder")}
                  className="h-9 border-border/80 bg-muted/30 pl-8 pr-8 text-sm"
                />
                {componentQuery ? (
                  <button
                    type="button"
                    aria-label={tEmpty("clearComponentSearchAria")}
                    onClick={() => {
                      setComponentQuery("");
                      componentSearchRef.current?.focus();
                    }}
                    className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>

              <div className="space-y-3 rounded-md border border-dashed border-border/80 p-2.5">
                {groupedItemTypes.length > 0 ? (
                  groupedItemTypes.map(({ group, itemTypes }) => (
                    <div key={group.id} className="space-y-1.5">
                      <div className="px-0.5 text-[11px] font-medium text-muted-foreground">
                        {group.label}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {itemTypes.map((type) => {
                          const entry = getCanvasAddItemEntry(type);
                          const Icon = entry.icon;
                          const active = selectedItemType === type;
                          const disabled = entry.requiresContext && !selectedContext;
                          const label = getEntryLabel(type);
                          const description = getEntryDescription(type);

                          return (
                            <button
                              key={type}
                              type="button"
                              aria-pressed={active}
                              disabled={disabled}
                              title={disabled ? `${label} — ${tEmpty("contextRequired")}` : label}
                              onClick={() =>
                                setSelectedItemType((prev) => (prev === type ? null : type))
                              }
                              className={cn(
                                "flex min-h-[4.25rem] items-start gap-2.5 rounded-md bg-muted/35 p-2.5 text-left",
                                "enabled:hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
                                "disabled:cursor-not-allowed disabled:bg-muted/20 disabled:opacity-45",
                                active && "bg-accent",
                              )}
                            >
                              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                              <span className="min-w-0 flex-1">
                                <span className="flex min-w-0 items-center justify-between gap-2 text-sm font-medium text-foreground">
                                  <span className="min-w-0 truncate">{label}</span>
                                  {active ? (
                                    <Check className="size-3.5 shrink-0 text-success" />
                                  ) : null}
                                </span>
                                <span className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                                  {description}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-md px-2 py-6 text-center">
                    <div className="text-sm font-medium text-foreground">
                      {tEmpty("componentEmptyTitle")}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {tEmpty("componentEmptyDescription")}
                    </div>
                  </div>
                )}
              </div>

              {needsContext && !selectedContext ? (
                <p className="text-[11px] text-muted-foreground">{tEmpty("contextRequired")}</p>
              ) : null}
            </section>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/70 px-4 py-2.5">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t("actions.cancel")}
            </Button>
            <Button size="sm" className="gap-1.5" disabled={!canAdd} onClick={handleAdd}>
              {isLoadingProjects || isAdding ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              {selectedItemType === CANVAS_TERMINAL_ADD_ITEM_TYPE
                ? t("actions.addTerminal")
                : t("actions.addWidget")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
