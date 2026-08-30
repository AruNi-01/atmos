"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  ChevronRight,
  Folder,
  MessagesSquare,
  Search,
} from "lucide-react";
import {
  agentConfigFlyoutOffsetTop,
  agentConfigFlyoutSide,
  cn,
} from "@workspace/ui";
import {
  MorphPopover,
  MorphPopoverContent,
  MorphPopoverTrigger,
} from "@workspace/ui/components/motion/popover-morph";
import type { Project } from "@/shared/types/domain";
import {
  filterProjectWorkspaceFlyout,
  filterWorkingDirectoryMenu,
  isThreadWorkingDirectory,
  resolveWorkingDirectoryLabel,
  THREAD_WORKING_DIRECTORY,
  type AgentChatWorkingDirectory,
} from "@/features/agent/lib/agent-chat-working-directory";

export function AgentChatWorkingDirectoryPicker({
  projects,
  selection,
  onSelect,
  className,
}: {
  projects: Project[];
  selection: AgentChatWorkingDirectory;
  onSelect: (next: AgentChatWorkingDirectory) => void;
  className?: string;
}) {
  const t = useTranslations("Agent.components.composer.workingDirectory");
  const threadSelected = isThreadWorkingDirectory(selection);
  const label = resolveWorkingDirectoryLabel(selection, projects, t("thread"));
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [flyoutProjectId, setFlyoutProjectId] = useState<string | null>(null);
  const [flyoutSide, setFlyoutSide] = useState<"right" | "left">("right");
  const [flyoutOffsetTop, setFlyoutOffsetTop] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const hideFlyoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const threadLabel = t("thread");
  const filtered = useMemo(
    () => filterWorkingDirectoryMenu(projects, search, threadLabel),
    [projects, search, threadLabel],
  );
  const flyoutProject = filtered.projects.find((item) => item.project.id === flyoutProjectId) ?? null;
  const flyoutItems = useMemo(
    () =>
      flyoutProject
        ? filterProjectWorkspaceFlyout(
            flyoutProject.project.name,
            flyoutProject.workspaces,
            workspaceSearch,
          )
        : { showProject: false, workspaces: [] },
    [flyoutProject, workspaceSearch],
  );

  const cancelHideFlyout = useCallback(() => {
    if (hideFlyoutTimer.current == null) return;
    window.clearTimeout(hideFlyoutTimer.current);
    hideFlyoutTimer.current = null;
  }, []);

  const scheduleHideFlyout = useCallback(() => {
    cancelHideFlyout();
    hideFlyoutTimer.current = window.setTimeout(() => {
      hideFlyoutTimer.current = null;
      setFlyoutProjectId(null);
    }, 120);
  }, [cancelHideFlyout]);

  const openFlyout = (projectId: string) => {
    cancelHideFlyout();
    if (projectId !== flyoutProjectId) setWorkspaceSearch("");
    setFlyoutProjectId(projectId);
  };

  const choose = (next: AgentChatWorkingDirectory) => {
    onSelect(next);
    setOpen(false);
    setSearch("");
    setWorkspaceSearch("");
    setFlyoutProjectId(null);
  };

  useLayoutEffect(() => () => cancelHideFlyout(), [cancelHideFlyout]);

  useLayoutEffect(() => {
    if (!flyoutProject || !menuRef.current) {
      setFlyoutSide("right");
      setFlyoutOffsetTop(0);
      return;
    }
    const update = () => {
      const menu = menuRef.current;
      const panel = flyoutRef.current;
      if (!menu || !panel) return;
      const rect = menu.getBoundingClientRect();
      setFlyoutSide(
        agentConfigFlyoutSide({
          menuRight: rect.right,
          viewportWidth: window.innerWidth,
        }),
      );
      setFlyoutOffsetTop(
        agentConfigFlyoutOffsetTop({
          menuTop: rect.top,
          flyoutHeight: panel.offsetHeight,
          viewportHeight: window.innerHeight,
        }),
      );
    };
    update();
    const panel = flyoutRef.current;
    if (!panel || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [flyoutProject]);

  return (
    <MorphPopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        cancelHideFlyout();
        setFlyoutProjectId(null);
        if (!next) {
          setSearch("");
          setWorkspaceSearch("");
        }
      }}
    >
      <MorphPopoverTrigger>
        <button
          type="button"
          className={cn(
            "inline-flex h-8 max-w-[11rem] min-w-0 items-center gap-1.5 border-0 bg-transparent px-2 py-0 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2",
            open && "bg-muted text-foreground",
            className,
          )}
          aria-label={t("aria")}
          title={label}
        >
          {threadSelected ? (
            <MessagesSquare className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Folder className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 truncate">{label}</span>
        </button>
      </MorphPopoverTrigger>
      <MorphPopoverContent
        side="top"
        align="start"
        sideOffset={8}
        radius={16}
        clip={false}
        className="overflow-visible border-0 bg-transparent p-0"
      >
        <div
          ref={menuRef}
          className="relative w-[16.5rem]"
          onPointerLeave={scheduleHideFlyout}
        >
          <div className="flex w-full flex-col rounded-2xl border border-border bg-popover py-1.5 shadow-[0_10px_18px_rgba(0,0,0,0.14)]">
            <div className="px-1.5 pt-0.5 pb-1" onPointerEnter={scheduleHideFlyout}>
              <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-2.5 py-1.5">
                <Search className="size-3.5 shrink-0 text-muted-foreground/70" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("searchPlaceholder")}
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Enter") event.preventDefault();
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                />
              </div>
            </div>

            <div className="min-h-0 max-h-[min(16rem,calc(100dvh-8rem))] overflow-y-auto">
              {filtered.showThread ? (
                <div className="px-1">
                  <button
                    type="button"
                    onPointerEnter={scheduleHideFlyout}
                    onClick={() => choose(THREAD_WORKING_DIRECTORY)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors",
                      threadSelected
                        ? "bg-muted text-foreground"
                        : "text-foreground hover:bg-muted/70",
                    )}
                  >
                    <MessagesSquare className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{t("thread")}</span>
                      <span className="mt-0.5 block truncate text-xs leading-4 text-muted-foreground">
                        {t("threadDescription")}
                      </span>
                    </span>
                    {threadSelected ? (
                      <Check className="mt-0.5 size-3.5 shrink-0 text-foreground" />
                    ) : (
                      <span className="size-3.5 shrink-0" />
                    )}
                  </button>
                </div>
              ) : null}

              {filtered.projects.length > 0 ? (
                <>
                  <div className="px-3.5 pt-1.5 pb-1 text-[10px] font-medium text-muted-foreground">
                    {t("projects")}
                  </div>
                  {filtered.projects.map(({ project }) => {
                    const active = flyoutProjectId === project.id;
                    const selectedHere = selection.projectId === project.id;
                    return (
                      <div key={project.id} className="px-1">
                        <button
                          type="button"
                          onPointerEnter={() => openFlyout(project.id)}
                          onFocus={() => openFlyout(project.id)}
                          onClick={() => openFlyout(project.id)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm outline-none",
                            active || selectedHere
                              ? "bg-muted text-foreground"
                              : "text-foreground hover:bg-muted/60",
                          )}
                        >
                          <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate font-medium">{project.name}</span>
                          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70" />
                        </button>
                      </div>
                    );
                  })}
                </>
              ) : !filtered.showThread ? (
                <div className="px-2.5 py-3 text-center text-xs text-muted-foreground">
                  {t("noResults")}
                </div>
              ) : null}
            </div>
          </div>

          {flyoutProject ? (
            <div
              className={cn(
                "absolute z-10",
                flyoutSide === "right" ? "left-full pl-1.5" : "right-full pr-1.5",
              )}
              style={{ top: flyoutOffsetTop }}
              onPointerEnter={cancelHideFlyout}
            >
              <div
                ref={flyoutRef}
                className="flex max-h-[min(20rem,calc(100dvh-1rem))] w-[16.5rem] flex-col rounded-2xl border border-border bg-popover shadow-[0_10px_18px_rgba(0,0,0,0.14)]"
              >
                <div className="px-1.5 pt-1.5 pb-1">
                  <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-2.5 py-1.5">
                    <Search className="size-3.5 shrink-0 text-muted-foreground/70" />
                    <input
                      value={workspaceSearch}
                      onChange={(event) => setWorkspaceSearch(event.target.value)}
                      placeholder={t("searchWorkspaces")}
                      className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter") event.preventDefault();
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                    />
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-1.5 pt-0">
                  {flyoutItems.showProject ? (
                    <DirectoryOption
                      selected={!selection.workspaceId && selection.projectId === flyoutProject.project.id}
                      label={flyoutProject.project.name}
                      onSelect={() =>
                        choose({
                          workspaceId: null,
                          projectId: flyoutProject.project.id,
                          cwd: flyoutProject.project.mainFilePath,
                        })
                      }
                    />
                  ) : null}
                  {flyoutItems.workspaces.map((workspace) => (
                    <DirectoryOption
                      key={workspace.id}
                      selected={selection.workspaceId === workspace.id}
                      label={workspace.displayName || workspace.name}
                      onSelect={() =>
                        choose({
                          workspaceId: workspace.id,
                          projectId: flyoutProject.project.id,
                          cwd: workspace.localPath,
                        })
                      }
                    />
                  ))}
                  {!flyoutItems.showProject && flyoutItems.workspaces.length === 0 ? (
                    <div className="px-2.5 py-3 text-center text-xs text-muted-foreground">
                      {t("noResults")}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </MorphPopoverContent>
    </MorphPopover>
  );
}

function DirectoryOption({
  selected,
  label,
  onSelect,
}: {
  selected: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors",
        selected ? "bg-muted text-foreground" : "text-foreground hover:bg-muted/70",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected ? (
        <Check className="size-3.5 shrink-0 text-foreground" />
      ) : (
        <span className="size-3.5 shrink-0" />
      )}
    </button>
  );
}
