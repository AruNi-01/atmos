"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryState } from "nuqs";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Input,
  ScrollArea,
} from "@workspace/ui";
import { formatRelativeTime } from "@atmos/shared";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Check,
  FolderKanban,
  Globe,
  LayoutGrid,
  Layers,
  List,
  MoreHorizontal,
  Pencil,
  PencilRuler,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  createPtDesignDoc,
  deletePtDesign,
  listPtDesignDocs,
  renamePtDesign,
  setPtDesignPinned,
  type PtDesignFilterScope,
} from "@atmos/pt-design/catalog";
import { MorphingIconToggle, MORPH_SWAP_TRANSITION } from "@/shared/components/morphing-swap";
import { PageFilterButton } from "@/shared/components/PageFilterButton";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { ptDesignParams } from "@/shared/lib/nuqs/searchParams";
import {
  designVisibleInHost,
  displayPtDesignName,
  filterResolvedPtDesigns,
  filterResolvedPtDesignsForHost,
  groupResolvedPtDesigns,
  ptDesignOpenHref,
  resolvePtDesignList,
  searchResolvedPtDesigns,
  type PtDesignHostContext,
  type ResolvedPtDesign,
} from "./lib/pt-design-overview";
import { usePtDesignPreviewSrc } from "./lib/use-pt-design-preview-src";
import {
  readPtDesignOverviewView,
  writePtDesignOverviewView,
  type PtDesignOverviewView,
} from "./lib/pt-design-overview-view";

const SCOPE_FILTERS: Array<{
  id: PtDesignFilterScope;
  icon: typeof Globe;
}> = [
  { id: "all", icon: Layers },
  { id: "global", icon: Globe },
  { id: "project", icon: FolderKanban },
  { id: "workspace", icon: Layers },
];

const GLOBAL_HOST: PtDesignHostContext = { kind: "global" };

type DesignItemLabels = {
  pin: string;
  unpin: string;
  rename: string;
  delete: string;
  more: string;
  global: string;
  project: string;
  workspace: string;
};

export function PtDesignOverview({
  host = GLOBAL_HOST,
}: {
  host?: PtDesignHostContext;
}) {
  const t = useTranslations("ptDesign.overview");
  const locale = useLocale();
  const router = useAppRouter();
  const projects = useProjects();
  const [scope, setScope] = useQueryState("ptScope", ptDesignParams.ptScope);
  const [, setDesign] = useQueryState("design", ptDesignParams.design);
  const [query, setQuery] = React.useState("");
  const [tick, setTick] = React.useState(0);
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<ResolvedPtDesign | null>(null);
  const [view, setView] = React.useState<PtDesignOverviewView>("board");

  const refresh = React.useCallback(() => setTick((value) => value + 1), []);

  React.useEffect(() => {
    setView(readPtDesignOverviewView());
  }, []);

  React.useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key.startsWith("pt-design/v2/")) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  const hostKey =
    host.kind === "project"
      ? `project:${host.projectId}`
      : host.kind === "workspace"
        ? `workspace:${host.workspaceId}`
        : "global";
  const listed = React.useMemo(() => {
    void tick;
    void hostKey;
    return filterResolvedPtDesignsForHost(resolvePtDesignList(listPtDesignDocs(), projects), host);
  }, [host, hostKey, projects, tick]);
  const scoped = host.kind === "global" ? filterResolvedPtDesigns(listed, scope) : listed;
  const visible = searchResolvedPtDesigns(scoped, query, t("untitled"));
  const grouped = groupResolvedPtDesigns(visible);
  const hasAny = grouped.pinned.length + grouped.project.length + grouped.workspace.length + grouped.global.length > 0;

  const openItem = React.useCallback(
    (item: ResolvedPtDesign) => {
      if (!designVisibleInHost(item, host)) return;
      const href = ptDesignOpenHref(item, host);
      if (!href) return;
      if (host.kind !== "global") {
        void setDesign(item.id);
        return;
      }
      if (href.startsWith("/pt-design?")) {
        void setDesign(item.id);
        return;
      }
      router.push(href);
    },
    [host, router, setDesign],
  );

  const handleNew = React.useCallback(() => {
    const created = createPtDesignDoc(
      host.kind === "project"
        ? { scope: "project", openMode: "center-tab", projectId: host.projectId }
        : host.kind === "workspace"
          ? { scope: "workspace", openMode: "center-tab", workspaceId: host.workspaceId }
          : { scope: "global", openMode: "canvas" },
    );
    if (!created) return;
    refresh();
    void setDesign(created.id);
  }, [host, refresh, setDesign]);

  const handleViewChange = React.useCallback((next: PtDesignOverviewView) => {
    setView(next);
    writePtDesignOverviewView(next);
  }, []);

  const labels = React.useMemo<DesignItemLabels>(
    () => ({
      pin: t("pin"),
      unpin: t("unpin"),
      rename: t("rename"),
      delete: t("delete"),
      more: t("more"),
      global: t("global"),
      project: t("project"),
      workspace: t("workspace"),
    }),
    [t],
  );

  const onRename = React.useCallback((id: string, name: string) => {
    renamePtDesign(id, name);
    setRenamingId(null);
    refresh();
  }, [refresh]);

  const onPin = React.useCallback((item: ResolvedPtDesign) => {
    setPtDesignPinned(item.id, !item.pinned);
    refresh();
  }, [refresh]);

  const collectionProps = {
    view,
    untitled: t("untitled"),
    renamingId,
    locale,
    onOpen: openItem,
    onRenameStart: setRenamingId,
    onRename,
    onPin,
    onDelete: setDeleting,
    labels,
  };

  const section = (title: string, items: ResolvedPtDesign[]) =>
    items.length === 0 ? null : (
      <section>
        <h2 className="mb-3 text-xs font-medium text-muted-foreground">{title}</h2>
        <DesignCollection items={items} {...collectionProps} />
      </section>
    );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="pt-design-overview">
      <div className="sticky top-0 z-10 bg-background/50 px-8 py-6 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          <div className="flex min-w-0 items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20">
                <PencilRuler className="size-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold tracking-tight text-foreground text-balance">
                  {t("title")}
                </h2>
              </div>
            </div>
            <Button
              className="h-11 sm:h-11 shrink-0 rounded-xl px-4"
              onClick={handleNew}
              data-testid="pt-design-new"
            >
              <Plus className="size-4" />
              {t("newDesign")}
            </Button>
          </div>
          <div className="flex h-11 min-w-0 items-center gap-2">
            <div className="group relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60 group-focus-within:text-primary" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchPlaceholder")}
                data-testid="pt-design-search"
                className="h-11 sm:h-11 rounded-xl border-border/50 bg-muted/20 pl-10 shadow-sm transition-all focus:bg-background focus-visible:ring-1 focus-visible:ring-primary/20"
              />
            </div>
            {host.kind === "global" ? (
              <OverviewFilterMenu
                scope={scope}
                onScopeChange={(next) => void setScope(next)}
                onClear={() => void setScope("all")}
              />
            ) : null}
            <MorphingIconToggle
              value={view}
              onChange={handleViewChange}
              data-testid="pt-design-view-toggle"
              options={[
                { value: "board", icon: LayoutGrid, label: t("viewBoard") },
                { value: "list", icon: List, label: t("viewList") },
              ]}
            />
          </div>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1" scrollFade>
        <div className="px-8 pb-8 pt-4">
          <div className="mx-auto w-full max-w-5xl space-y-8">
            {hasAny ? (
              <>
                {section(t("pinned"), grouped.pinned)}
                {section(t("project"), grouped.project)}
                {section(t("workspace"), grouped.workspace)}
                {section(t("global"), grouped.global)}
              </>
            ) : (
              <EmptyOverview
                filtered={listed.length > 0}
                onNew={handleNew}
                copy={{
                  empty: t("empty"),
                  emptyFilter: query.trim() ? t("emptySearch") : t("emptyFilter"),
                  newDesign: t("newDesign"),
                }}
              />
            )}
          </div>
        </div>
      </ScrollArea>

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmDeleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("confirmDeleteDescription", {
                name: deleting ? displayPtDesignName(deleting, t("untitled")) : "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleting) deletePtDesign(deleting.id);
                setDeleting(null);
                refresh();
              }}
            >
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OverviewFilterMenu({
  scope,
  onScopeChange,
  onClear,
}: {
  scope: PtDesignFilterScope;
  onScopeChange: (scope: PtDesignFilterScope) => void;
  onClear: () => void;
}) {
  const t = useTranslations("ptDesign.overview");
  const activeCount = scope === "all" ? 0 : 1;
  return (
    <PageFilterButton label={t("filter")} activeCount={activeCount}>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Layers className="size-4" />
          <span className="min-w-0 flex-1 truncate">{t("filterScope")}</span>
          {activeCount > 0 ? (
            <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">1</span>
          ) : null}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-56">
          {SCOPE_FILTERS.map((option) => (
            <DropdownMenuItem
              key={option.id}
              data-testid={`pt-design-filter-${option.id}`}
              onSelect={(event) => {
                event.preventDefault();
                onScopeChange(option.id);
              }}
              className="cursor-pointer"
            >
              <option.icon className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{t(option.id)}</span>
              {scope === option.id ? <Check className="size-4" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      {activeCount > 0 ? (
        <>
          <DropdownMenuSeparator className="mx-2" />
          <DropdownMenuItem onClick={onClear} className="text-xs font-medium text-muted-foreground">
            {t("clearFilters")}
          </DropdownMenuItem>
        </>
      ) : null}
    </PageFilterButton>
  );
}

function EmptyOverview({
  filtered,
  onNew,
  copy,
}: {
  filtered: boolean;
  onNew: () => void;
  copy: { empty: string; emptyFilter: string; newDesign: string };
}) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <p className="text-sm text-muted-foreground">{filtered ? copy.emptyFilter : copy.empty}</p>
      {filtered ? null : (
        <Button className="mt-4" size="sm" onClick={onNew}>
          <Plus className="size-4" />
          {copy.newDesign}
        </Button>
      )}
    </div>
  );
}

function DesignCollection({
  view,
  items,
  untitled,
  renamingId,
  locale,
  onOpen,
  onRenameStart,
  onRename,
  onPin,
  onDelete,
  labels,
}: {
  view: PtDesignOverviewView;
  items: ResolvedPtDesign[];
  untitled: string;
  renamingId: string | null;
  locale: string;
  onOpen: (item: ResolvedPtDesign) => void;
  onRenameStart: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onPin: (item: ResolvedPtDesign) => void;
  onDelete: (item: ResolvedPtDesign) => void;
  labels: DesignItemLabels;
}) {
  const reduceMotion = useReducedMotion();
  const prevViewRef = React.useRef(view);
  const viewChanged = prevViewRef.current !== view;
  React.useLayoutEffect(() => {
    prevViewRef.current = view;
  }, [view]);
  const transition = reduceMotion ? { duration: 0 } : MORPH_SWAP_TRANSITION;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={view}
        initial={viewChanged ? { opacity: 0, y: 8 } : false}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={transition}
      >
        {view === "board" ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <DesignCard
                key={item.id}
                item={item}
                untitled={untitled}
                renaming={renamingId === item.id}
                locale={locale}
                onOpen={onOpen}
                onRenameStart={onRenameStart}
                onRename={onRename}
                onPin={onPin}
                onDelete={onDelete}
                labels={labels}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5" data-testid="pt-design-list">
            {items.map((item) => (
              <DesignListRow
                key={item.id}
                item={item}
                untitled={untitled}
                renaming={renamingId === item.id}
                locale={locale}
                onOpen={onOpen}
                onRenameStart={onRenameStart}
                onRename={onRename}
                onPin={onPin}
                onDelete={onDelete}
                labels={labels}
              />
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function designOwnerLabel(item: ResolvedPtDesign, labels: DesignItemLabels): string {
  if (item.scope === "global") return labels.global;
  if (item.ownerName?.trim()) return item.ownerName;
  return item.scope === "project" ? labels.project : labels.workspace;
}

const PREVIEW_ACTION_CHIP =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-background/90 text-foreground shadow-sm ring-1 ring-border/70 backdrop-blur-sm hover:bg-muted focus-visible:bg-muted data-[state=open]:bg-muted";

function PinActionButton({
  pinned,
  labels,
  onPin,
}: {
  pinned: boolean;
  labels: DesignItemLabels;
  onPin: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={pinned ? labels.unpin : labels.pin}
      data-testid="pt-design-card-pin"
      onClick={(event) => {
        event.stopPropagation();
        onPin();
      }}
      className={PREVIEW_ACTION_CHIP}
    >
      {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
    </button>
  );
}

function DesignItemMenu({
  labels,
  onRenameStart,
  onDelete,
  triggerClassName,
}: {
  labels: DesignItemLabels;
  onRenameStart: () => void;
  onDelete: () => void;
  triggerClassName?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={labels.more}
          data-testid="pt-design-card-menu"
          onClick={(event) => event.stopPropagation()}
          className={triggerClassName ?? PREVIEW_ACTION_CHIP}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem className="cursor-pointer" onSelect={() => onRenameStart()}>
          <Pencil className="size-4" />
          {labels.rename}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onSelect={() => onDelete()}
        >
          <Trash2 className="size-4" />
          {labels.delete}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DesignPreview({ preview }: { preview?: string }) {
  const src = usePtDesignPreviewSrc(preview);
  if (!src) {
    return <div className="size-full bg-muted/15" data-testid="pt-design-preview-placeholder" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      className="size-full object-contain"
    />
  );
}

const DesignCard = React.memo(function DesignCard({
  item,
  untitled,
  renaming,
  locale,
  onOpen,
  onRenameStart,
  onRename,
  onPin,
  onDelete,
  labels,
}: {
  item: ResolvedPtDesign;
  untitled: string;
  renaming: boolean;
  locale: string;
  onOpen: (item: ResolvedPtDesign) => void;
  onRenameStart: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onPin: (item: ResolvedPtDesign) => void;
  onDelete: (item: ResolvedPtDesign) => void;
  labels: DesignItemLabels;
}) {
  const name = displayPtDesignName(item, untitled);
  const owner = designOwnerLabel(item, labels);
  const modified = formatRelativeTime(new Date(item.updatedAt).toISOString(), locale);

  return (
    <article
      className="group relative overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm"
      data-testid="pt-design-card"
      data-design-id={item.id}
    >
      <div className="relative">
        <button type="button" onClick={() => onOpen(item)} className="block w-full cursor-pointer text-left">
          <div className="aspect-[16/10] bg-[#fffef7] dark:bg-[#09090b]">
            <DesignPreview preview={item.preview} />
          </div>
        </button>
        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 has-[[data-state=open]]:opacity-100">
          <PinActionButton pinned={item.pinned} labels={labels} onPin={() => onPin(item)} />
          <DesignItemMenu
            labels={labels}
            onRenameStart={() => onRenameStart(item.id)}
            onDelete={() => onDelete(item)}
          />
        </div>
      </div>
      <div className="flex items-start justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <Input
              autoFocus
              defaultValue={item.name || name}
              data-testid="pt-design-rename-input"
              className="h-7 text-sm"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Enter") onRename(item.id, event.currentTarget.value);
                if (event.key === "Escape") onRename(item.id, item.name);
              }}
              onBlur={(event) => onRename(item.id, event.currentTarget.value)}
            />
          ) : (
            <button type="button" onClick={() => onOpen(item)} className="block w-full truncate text-left text-sm font-medium">
              {name}
            </button>
          )}
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{owner}</div>
        </div>
        <time
          dateTime={new Date(item.updatedAt).toISOString()}
          className="shrink-0 pt-0.5 text-xs text-muted-foreground"
        >
          {modified}
        </time>
      </div>
    </article>
  );
});

const DesignListRow = React.memo(function DesignListRow({
  item,
  untitled,
  renaming,
  locale,
  onOpen,
  onRenameStart,
  onRename,
  onPin,
  onDelete,
  labels,
}: {
  item: ResolvedPtDesign;
  untitled: string;
  renaming: boolean;
  locale: string;
  onOpen: (item: ResolvedPtDesign) => void;
  onRenameStart: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onPin: (item: ResolvedPtDesign) => void;
  onDelete: (item: ResolvedPtDesign) => void;
  labels: DesignItemLabels;
}) {
  const name = displayPtDesignName(item, untitled);
  const owner = designOwnerLabel(item, labels);
  const modified = formatRelativeTime(new Date(item.updatedAt).toISOString(), locale);

  return (
    <article
      className="group flex items-center gap-3 rounded-xl border border-border bg-card px-2 py-1.5"
      data-testid="pt-design-row"
      data-design-id={item.id}
    >
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="h-10 w-16 shrink-0 overflow-hidden rounded-md bg-background"
      >
        <DesignPreview preview={item.preview} />
      </button>
      {renaming ? (
        <Input
          autoFocus
          defaultValue={item.name || name}
          data-testid="pt-design-rename-input"
          className="h-7 min-w-0 flex-1 text-sm"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter") onRename(item.id, event.currentTarget.value);
            if (event.key === "Escape") onRename(item.id, item.name);
          }}
          onBlur={(event) => onRename(item.id, event.currentTarget.value)}
        />
      ) : (
        <button
          type="button"
          onClick={() => onOpen(item)}
          className="min-w-0 flex-1 truncate text-left text-sm font-medium"
        >
          {name}
        </button>
      )}
      <span className="hidden max-w-[10rem] shrink-0 truncate text-xs text-muted-foreground sm:block">
        {owner}
      </span>
      <time
        dateTime={new Date(item.updatedAt).toISOString()}
        className="w-24 shrink-0 text-right text-xs text-muted-foreground"
      >
        {modified}
      </time>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 has-[[data-state=open]]:opacity-100">
        <PinActionButton pinned={item.pinned} labels={labels} onPin={() => onPin(item)} />
        <DesignItemMenu
          labels={labels}
          onRenameStart={() => onRenameStart(item.id)}
          onDelete={() => onDelete(item)}
        />
      </div>
    </article>
  );
});

