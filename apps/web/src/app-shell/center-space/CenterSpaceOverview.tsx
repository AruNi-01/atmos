"use client";

import React from "react";
import { flushSync } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { Pin, Plus, Trash2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { formatRelativeTime } from "@atmos/shared";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "@workspace/ui";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { CENTER_STAGE_GUTTER_CLASS } from "@/app-shell/sidebar-layout-constants";
import {
  DEFAULT_CENTER_SPACE_ID,
  isDefaultCenterSpaceId,
  MAX_CENTER_SPACES_PER_HOST,
  makeCenterSpaceKey,
  type CenterSpaceRecord,
} from "@/app-shell/center-space/center-space";
import { hostSpaceAttentionReasons } from "@/app-shell/center-space/center-space-attention";
import {
  CENTER_SPACE_OVERVIEW_EASE,
  CENTER_SPACE_OVERVIEW_MS,
  centerSpaceOverviewChromeTransition,
  centerSpaceOverviewTransform,
  clampCenterSpacePreviewAspect,
} from "@/app-shell/center-space/center-space-overview-motion";
import {
  createCenterSpaceOverviewPose,
  type CenterSpaceOverviewPose,
} from "@/app-shell/center-space/center-space-overview-pose";
import { useCenterSpaceOverviewStore } from "@/app-shell/center-space/center-space-overview-store";
import { useCenterSpaceStore } from "@/app-shell/center-space/center-space-store";
import {
  deleteCenterSpace,
  openNewCenterSpace,
  switchCenterSpace,
} from "@/app-shell/center-space/center-space-switch";
import { useAgentAttentionStore } from "@/features/agent/store/agent-attention-store";

const EMPTY_CENTER_SPACES: CenterSpaceRecord[] = [];

/** Icon controls stay borderless on hover so the card border does not shift. */
const CARD_ICON_BUTTON_CLASS =
  "inline-flex size-6 items-center justify-center rounded-md border-0 bg-transparent p-0 shadow-none outline-none ring-0 hover:border-0 hover:shadow-none hover:outline-none hover:ring-0 focus:outline-none focus-visible:outline-none";

function CenterSpaceNameEditor({
  name,
  ariaLabel,
  onCommit,
  onCancel,
}: {
  name: string;
  ariaLabel: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const skipCommitRef = React.useRef(false);
  const [draft, setDraft] = React.useState(name);

  React.useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  return (
    <input
      ref={inputRef}
      aria-label={ariaLabel}
      value={draft}
      maxLength={64}
      spellCheck={false}
      autoComplete="off"
      onChange={(event) => setDraft(event.target.value)}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onBlur={() => {
        if (skipCommitRef.current) return;
        onCommit(draft);
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          skipCommitRef.current = true;
          onCancel();
        }
      }}
      className="h-5 min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] font-medium text-foreground outline-none ring-0"
    />
  );
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function measureCardAspect(stage: HTMLElement): number {
  const card = stage.querySelector("[data-center-stage-card]");
  const el = card instanceof HTMLElement ? card : stage;
  return clampCenterSpacePreviewAspect(el.offsetWidth, el.offsetHeight);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function collectSlots(root: HTMLElement | null): Map<string, HTMLElement> {
  const slots = new Map<string, HTMLElement>();
  if (!root) return slots;
  for (const slot of root.querySelectorAll<HTMLElement>("[data-center-space-slot]")) {
    const paintId = slot.getAttribute("data-space-id");
    if (paintId) slots.set(paintId, slot);
  }
  return slots;
}

/** Solid stand-in for a space that does not exist yet. Not a screenshot. */
async function growCover(source: HTMLElement, stage: HTMLElement): Promise<HTMLElement | null> {
  const body = stage.parentElement;
  const card = stage.querySelector("[data-center-stage-card]");
  if (!body || !(card instanceof HTMLElement) || prefersReducedMotion()) return null;
  const from = source.getBoundingClientRect();
  const to = card.getBoundingClientRect();
  const bodyRect = body.getBoundingClientRect();
  if (from.width < 2 || from.height < 2 || to.width < 2 || to.height < 2) return null;
  const cover = document.createElement("div");
  cover.setAttribute("data-center-space-cover", "");
  cover.setAttribute("aria-hidden", "true");
  cover.style.position = "absolute";
  cover.style.zIndex = "45";
  cover.style.left = `${from.left - bodyRect.left}px`;
  cover.style.top = `${from.top - bodyRect.top}px`;
  cover.style.width = `${from.width}px`;
  cover.style.height = `${from.height}px`;
  cover.style.background = "var(--background)";
  cover.style.borderRadius = "14px";
  cover.style.transformOrigin = "0 0";
  cover.style.pointerEvents = "none";
  body.appendChild(cover);
  await nextFrame();
  const pose = centerSpaceOverviewTransform(
    { left: from.left, top: from.top, width: from.width, height: from.height },
    { left: to.left, top: to.top, width: to.width, height: to.height },
  );
  cover.style.transition = `transform ${CENTER_SPACE_OVERVIEW_MS}ms ${CENTER_SPACE_OVERVIEW_EASE}`;
  cover.style.transform = `translate3d(${pose.x}px, ${pose.y}px, 0) scale(${pose.scale})`;
  return cover;
}

function CenterSpaceOverview({
  posed,
  dimmed,
  aspect,
  onZoom,
  onCreate,
  onClose,
  onHandoff,
}: {
  posed: boolean;
  dimmed: boolean;
  aspect: number;
  onZoom: (spaceId: string) => void;
  onCreate: (source: HTMLElement) => void;
  onClose: () => void;
  onHandoff: () => void;
}) {
  const t = useTranslations("header.centerSpace");
  const locale = useLocale();
  const { effectiveContextId: hostId } = useContextParams();
  const spaces = useCenterSpaceStore((s) =>
    hostId ? s.byHost[hostId]?.spaces ?? EMPTY_CENTER_SPACES : EMPTY_CENTER_SPACES,
  );
  const activeSpaceId = useCenterSpaceStore((s) =>
    hostId ? s.getActiveSpaceId(hostId) : DEFAULT_CENTER_SPACE_ID,
  );
  const spaceAttentionReasons = useAgentAttentionStore(
    useShallow((s) => hostSpaceAttentionReasons(s.panes.values(), hostId ?? "")),
  );
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const spaceLabel = React.useCallback(
    (space: CenterSpaceRecord) =>
      space.id === DEFAULT_CENTER_SPACE_ID ? t("defaultSpace") : space.name,
    [t],
  );

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (useCenterSpaceOverviewStore.getState().busy) return;
      if (editingId) {
        setEditingId(null);
        return;
      }
      if (confirmDeleteId) {
        setConfirmDeleteId(null);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmDeleteId, editingId, onClose]);

  const atLimit = spaces.length >= MAX_CENTER_SPACES_PER_HOST;

  return (
    <div
      data-center-space-overview=""
      className="absolute inset-0 z-[45]"
      style={{
        opacity: posed && !dimmed ? 1 : 0,
        // Same clock as the pose, both directions. A short leave left the
        // card border fully lit, then gone, while the surface was still zooming.
        transition: centerSpaceOverviewChromeTransition(),
      }}
    >
      <div className={cn("flex h-full min-h-0 flex-col", CENTER_STAGE_GUTTER_CLASS)}>
        <div
          data-center-space-overview-frame=""
          role="dialog"
          aria-label={t("buttonLabel")}
          className="flex min-h-0 flex-1 flex-col rounded-xl border-2 border-dashed border-foreground/45 bg-transparent"
          onPointerDown={(event) => {
            if (useCenterSpaceOverviewStore.getState().busy) return;
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (
              target.closest(
                "[data-center-space-card], [data-center-space-add], [data-slot='popover-content']",
              )
            ) {
              return;
            }
            onClose();
          }}
        >
          <div
            data-center-space-overview-scroller=""
            className="flex min-h-0 flex-1 flex-wrap content-start items-start justify-center gap-x-6 gap-y-8 overflow-auto px-6 pt-8 pb-6"
          >
            {spaces.map((space) => {
              const selected = space.id === activeSpaceId;
              const attentionReason = spaceAttentionReasons[space.id] ?? null;
              const canDelete = !isDefaultCenterSpaceId(space.id) && spaces.length > 1;
              const canRename = !isDefaultCenterSpaceId(space.id);
              const confirming = confirmDeleteId === space.id;
              const editing = editingId === space.id;
              const pinned = space.pinned === true;
              const label = spaceLabel(space);
              const created = new Date(space.createdAt).toISOString();
              const paintId = hostId ? makeCenterSpaceKey(hostId, space.id) : space.id;
              return (
                <div
                  key={space.id}
                  data-center-space-card=""
                  data-confirming={confirming ? "true" : undefined}
                  className="group/space relative flex w-[clamp(188px,28%,300px)] min-w-0 flex-col gap-2"
                >
                  <button
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    aria-label={label}
                    onClick={() => {
                      if (!hostId || useCenterSpaceOverviewStore.getState().busy) return;
                      // The active card uses the same zoom as any other card.
                      // Closing through setOpen fades the panel host and the
                      // page flashes black before it grows.
                      onZoom(space.id);
                    }}
                    className={cn(
                      "relative w-full overflow-hidden rounded-xl border-2 bg-transparent text-left shadow-[0_12px_32px_rgb(0_0_0/0.28)]",
                      attentionReason
                        ? cn(
                            "agent-attention-ring-card",
                            attentionReason === "permission_request"
                              ? "agent-attention-ring-permission"
                              : "agent-attention-ring-complete",
                          )
                        : "border-transparent",
                    )}
                    style={{ aspectRatio: aspect }}
                  >
                    <span
                      data-center-space-slot=""
                      data-space-id={paintId}
                      className="block size-full"
                    />
                  </button>
                  <button
                    type="button"
                    data-center-space-pin=""
                    aria-label={pinned ? t("unpinSpace") : t("pinSpace")}
                    aria-pressed={pinned}
                    title={pinned ? t("unpinSpace") : t("pinSpace")}
                    className={cn(
                      CARD_ICON_BUTTON_CLASS,
                      "pointer-events-none absolute top-2 left-2 z-50 text-foreground/80 opacity-0 drop-shadow-[0_1px_1.5px_rgb(0_0_0/0.85)]",
                      "hover:bg-background/90 hover:text-foreground",
                      "focus-visible:bg-background/90",
                      "group-hover/space:pointer-events-auto group-hover/space:opacity-100",
                      "focus-visible:pointer-events-auto focus-visible:opacity-100",
                      pinned && "text-foreground",
                    )}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (!hostId || useCenterSpaceOverviewStore.getState().busy) return;
                      useCenterSpaceStore.getState().setSpacePinned(hostId, space.id, !pinned);
                    }}
                  >
                    <Pin className={cn("size-3.5", pinned && "fill-current")} />
                  </button>
                  {canDelete ? (
                    <Popover
                      open={confirming}
                      onOpenChange={(next) => {
                        if (next) setEditingId(null);
                        setConfirmDeleteId((current) => {
                          if (next) return space.id;
                          return current === space.id ? null : current;
                        });
                      }}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label={t("deleteSpace", { name: label })}
                          className={cn(
                            CARD_ICON_BUTTON_CLASS,
                            "pointer-events-none absolute top-2 right-2 z-50 text-foreground/80 opacity-0 drop-shadow-[0_1px_1.5px_rgb(0_0_0/0.85)]",
                            "hover:bg-destructive hover:text-destructive-foreground",
                            "group-hover/space:pointer-events-auto group-hover/space:opacity-100",
                            "focus-visible:pointer-events-auto focus-visible:opacity-100",
                            confirming &&
                              "pointer-events-auto bg-destructive text-destructive-foreground opacity-100",
                          )}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="bottom"
                        align="end"
                        sideOffset={6}
                        className="z-[80] w-56 space-y-3 p-3"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <p className="text-sm text-foreground">
                          {t("deleteConfirmTitle", { name: label })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("deleteConfirmDescription")}
                        </p>
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            {t("deleteConfirmCancel")}
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              if (!hostId) return;
                              const wasActive = space.id === activeSpaceId;
                              setConfirmDeleteId(null);
                              if (wasActive) onHandoff();
                              void deleteCenterSpace(hostId, space.id);
                            }}
                          >
                            {t("deleteConfirmAction")}
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : null}
                  <div className="relative z-10 flex items-center justify-between gap-3 px-0.5">
                    {editing ? (
                      <CenterSpaceNameEditor
                        name={space.name}
                        ariaLabel={t("renameSpace", { name: label })}
                        onCommit={(next) => {
                          setEditingId((current) => (current === space.id ? null : current));
                          if (hostId) {
                            useCenterSpaceStore.getState().renameSpace(hostId, space.id, next);
                          }
                        }}
                        onCancel={() => {
                          setEditingId((current) => (current === space.id ? null : current));
                        }}
                      />
                    ) : canRename ? (
                      <button
                        type="button"
                        title={label}
                        className="h-5 min-w-0 flex-1 cursor-text truncate border-0 bg-transparent p-0 text-left text-[13px] font-medium text-foreground outline-none ring-0 hover:border-0 hover:bg-transparent"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (useCenterSpaceOverviewStore.getState().busy) return;
                          setConfirmDeleteId(null);
                          setEditingId(space.id);
                        }}
                      >
                        {label}
                      </button>
                    ) : (
                      <span
                        className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground"
                        title={label}
                      >
                        {label}
                      </span>
                    )}
                    <time
                      dateTime={created}
                      title={new Date(space.createdAt).toLocaleString(locale)}
                      className="shrink-0 text-[12px] text-muted-foreground tabular-nums"
                    >
                      {formatRelativeTime(created, locale)}
                    </time>
                  </div>
                </div>
              );
            })}
            <div className="flex w-[clamp(188px,28%,300px)] min-w-0 flex-col gap-2">
              <button
                type="button"
                data-center-space-add=""
                aria-label={t("addSpace")}
                title={atLimit ? t("limitReached") : t("addSpace")}
                disabled={atLimit}
                onClick={(event) => {
                  if (!hostId || atLimit || useCenterSpaceOverviewStore.getState().busy) return;
                  onCreate(event.currentTarget);
                }}
                className={cn(
                  "flex w-full items-center justify-center rounded-xl border-2 border-dashed border-foreground/45 bg-transparent text-foreground/80",
                  atLimit
                    ? "cursor-not-allowed opacity-50"
                    : "hover:bg-foreground/5 hover:text-foreground",
                )}
                style={{ aspectRatio: aspect }}
              >
                <Plus className="size-7 stroke-[1.5]" />
              </button>
              <div className="px-0.5 text-[13px] font-medium text-muted-foreground">
                {atLimit ? t("limitReached") : t("addSpace")}
              </div>
            </div>
          </div>
          {atLimit ? (
            <p className="pb-3 text-center text-[11px] text-muted-foreground">{t("limitReached")}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Scales the live center into the active card, and each other mounted space
 * frame into its own card. The gallery never uses a screenshot.
 */
export function CenterSpaceOverviewLayer({ children }: { children: React.ReactNode }) {
  const { effectiveContextId: hostId } = useContextParams();
  const activeSpaceId = useCenterSpaceStore((s) =>
    hostId ? s.getActiveSpaceId(hostId) : DEFAULT_CENTER_SPACE_ID,
  );
  const spaceKey = useCenterSpaceStore((s) => {
    if (!hostId) return "";
    const spaces = s.byHost[hostId]?.spaces;
    if (!spaces) return "";
    let key = "";
    for (const space of spaces) key += `${space.id}\0`;
    return key;
  });
  const open = useCenterSpaceOverviewStore((s) => s.open);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const overviewRef = React.useRef<HTMLDivElement>(null);
  const poseRef = React.useRef<CenterSpaceOverviewPose | null>(null);
  if (!poseRef.current) poseRef.current = createCenterSpaceOverviewPose();
  const pose = poseRef.current;
  const handoffRef = React.useRef(false);
  const wasPosed = React.useRef(false);
  const skipReflow = React.useRef(false);
  const busyRef = React.useRef(false);
  /** StrictMode runs layout effects twice; the second pass must not cancel the flight. */
  const flightRef = React.useRef<"open" | "home" | null>(null);
  const slotsStaleRef = React.useRef(false);
  const spaceKeyRef = React.useRef(spaceKey);
  const [mounted, setMounted] = React.useState(false);
  const [posed, setPosed] = React.useState(false);
  const [dimmed, setDimmed] = React.useState(false);
  const [aspect, setAspect] = React.useState<number | null>(null);
  const activePaintId = hostId ? makeCenterSpaceKey(hostId, activeSpaceId) : "";

  const finishHandoff = React.useCallback(() => {
    handoffRef.current = true;
    flightRef.current = null;
    wasPosed.current = false;
    pose.clear();
    const stage = stageRef.current;
    if (stage) delete stage.dataset.overview;
    setPosed(false);
    setDimmed(false);
    setMounted(false);
    useCenterSpaceOverviewStore.getState().setOpen(false);
  }, [pose]);

  React.useEffect(() => {
    if (open) {
      handoffRef.current = false;
      setDimmed(false);
      setMounted(true);
      return;
    }
    if (handoffRef.current || prefersReducedMotion()) {
      handoffRef.current = false;
      pose.clear();
      const stage = stageRef.current;
      if (stage) delete stage.dataset.overview;
      setPosed(false);
      setMounted(false);
      return;
    }
    setPosed(false);
    const timer = window.setTimeout(() => {
      pose.clear();
      const stage = stageRef.current;
      if (stage) delete stage.dataset.overview;
      flightRef.current = null;
      setMounted(false);
    }, CENTER_SPACE_OVERVIEW_MS + 40);
    return () => window.clearTimeout(timer);
  }, [open, pose]);

  React.useLayoutEffect(() => {
    if (!mounted) {
      setAspect(null);
      return;
    }
    const stage = stageRef.current;
    if (!stage) return;
    const next = measureCardAspect(stage);
    setAspect((prev) => (prev != null && Math.abs(prev - next) < 0.02 ? prev : next));
  }, [mounted]);

  React.useEffect(() => {
    if (!mounted) return;
    const stage = stageRef.current;
    if (!stage) return;
    const target = stage.querySelector("[data-center-stage-card]") ?? stage;
    const observer = new ResizeObserver(() => {
      const next = measureCardAspect(stage);
      setAspect((prev) => (prev != null && Math.abs(prev - next) < 0.02 ? prev : next));
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [mounted]);

  React.useEffect(() => {
    if (!open || !mounted || aspect == null) return;
    const frame = requestAnimationFrame(() => setPosed(true));
    return () => cancelAnimationFrame(frame);
  }, [aspect, mounted, open]);

  React.useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (!mounted) {
      delete stage.dataset.overview;
      wasPosed.current = false;
      flightRef.current = null;
      pose.clear();
      return;
    }
    stage.dataset.overview = "open";
    if (handoffRef.current || busyRef.current) return;
    const reduce = prefersReducedMotion();
    if (posed) {
      if (flightRef.current === "open") return;
      const animate = !wasPosed.current && !reduce;
      wasPosed.current = true;
      if (animate) {
        flightRef.current = "open";
        skipReflow.current = true;
        pose.applySlots(stage, collectSlots(overviewRef.current), activePaintId, true);
        window.setTimeout(() => {
          if (flightRef.current === "open") flightRef.current = null;
          skipReflow.current = false;
          const live = stageRef.current;
          if (!live || !wasPosed.current || flightRef.current) return;
          if (useCenterSpaceOverviewStore.getState().busy) return;
          const reposition = slotsStaleRef.current;
          slotsStaleRef.current = false;
          pose.applySlots(
            live,
            collectSlots(overviewRef.current),
            activePaintId,
            false,
            !reposition,
          );
        }, CENTER_SPACE_OVERVIEW_MS);
        return;
      }
      pose.applySlots(stage, collectSlots(overviewRef.current), activePaintId, false);
      return;
    }
    if (flightRef.current === "home") return;
    const animateBack = wasPosed.current && !reduce;
    wasPosed.current = false;
    if (animateBack) flightRef.current = "home";
    pose.poseHome(stage, activePaintId, animateBack);
  }, [activePaintId, mounted, pose, posed]);

  React.useLayoutEffect(() => {
    const orderChanged = spaceKeyRef.current !== spaceKey;
    spaceKeyRef.current = spaceKey;
    if (skipReflow.current || flightRef.current) {
      if (orderChanged) slotsStaleRef.current = true;
      return;
    }
    if (!posed || !wasPosed.current) return;
    if (busyRef.current || useCenterSpaceOverviewStore.getState().busy) return;
    const stage = stageRef.current;
    if (!stage) return;
    slotsStaleRef.current = false;
    pose.applySlots(stage, collectSlots(overviewRef.current), activePaintId, false);
  }, [activePaintId, aspect, pose, posed, spaceKey]);

  React.useEffect(() => {
    if (!mounted) return;
    const root = overviewRef.current;
    const stage = stageRef.current;
    if (!root || !stage) return;
    const scroller = root.querySelector("[data-center-space-overview-scroller]");
    const onScroll = () => {
      if (skipReflow.current || flightRef.current || busyRef.current || !wasPosed.current) return;
      pose.applySlots(stage, collectSlots(overviewRef.current), activePaintId, false);
    };
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    const framesHost = stage.querySelector("[data-center-panel-host]") ?? stage;
    const onFrames = (records: MutationRecord[]) => {
      if (busyRef.current || !wasPosed.current) return;
      const added = records.some((record) =>
        Array.from(record.addedNodes).some((node) => {
          if (!(node instanceof HTMLElement)) return false;
          return (
            node.hasAttribute("data-workspace-frame") ||
            Boolean(node.querySelector("[data-workspace-frame]"))
          );
        }),
      );
      if (!added) return;
      pose.applySlots(
        stage,
        collectSlots(overviewRef.current),
        activePaintId,
        false,
        true,
      );
    };
    const observer = new MutationObserver(onFrames);
    observer.observe(framesHost, { childList: true, subtree: true });
    return () => {
      scroller?.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [activePaintId, mounted, pose, posed]);

  React.useEffect(() => {
    return () => {
      pose.clear();
      document.querySelectorAll("[data-center-space-cover]").forEach((node) => node.remove());
    };
  }, [pose]);

  const beginZoomHome = React.useCallback((spaceId: string) => {
    if (!hostId || busyRef.current) return false;
    const stage = stageRef.current;
    if (!stage) return false;
    busyRef.current = true;
    useCenterSpaceOverviewStore.getState().setBusy(true);
    setDimmed(true);
    const paintId = makeCenterSpaceKey(hostId, spaceId);
    // Swap into this space while it is still parked in the card, then scale
    // that same page home. Switching after the zoom replaces it with a cut.
    // Mark busy first so the paint-id layout effect does not re-snap slots
    // over the zoom.
    if (spaceId !== activeSpaceId) {
      flushSync(() => {
        void switchCenterSpace(hostId, spaceId, { animate: false });
      });
    }
    pose.applySlots(stage, collectSlots(overviewRef.current), paintId, false);
    const animated = !prefersReducedMotion() && pose.zoomHome(stage, paintId);
    void (async () => {
      try {
        if (animated) await wait(CENTER_SPACE_OVERVIEW_MS + 40);
      } finally {
        pose.clear();
        busyRef.current = false;
        useCenterSpaceOverviewStore.getState().setBusy(false);
        finishHandoff();
      }
    })();
    return true;
  }, [activeSpaceId, finishHandoff, hostId, pose]);

  const onZoom = React.useCallback((spaceId: string) => {
    beginZoomHome(spaceId);
  }, [beginZoomHome]);

  const onCreate = React.useCallback((source: HTMLElement) => {
    if (!hostId || busyRef.current) return;
    const stage = stageRef.current;
    if (!stage) return;
    busyRef.current = true;
    useCenterSpaceOverviewStore.getState().setBusy(true);
    setDimmed(true);
    void (async () => {
      let cover: HTMLElement | null = null;
      try {
        cover = await growCover(source, stage);
        if (cover) await wait(CENTER_SPACE_OVERVIEW_MS);
        flushSync(() => {
          void openNewCenterSpace(hostId, undefined, { animate: false });
        });
      } finally {
        cover?.remove();
        pose.clear();
        busyRef.current = false;
        useCenterSpaceOverviewStore.getState().setBusy(false);
        finishHandoff();
      }
    })();
  }, [finishHandoff, hostId, pose]);

  const onClose = React.useCallback(() => {
    // Escape and the scrim zoom the active page home. setOpen(false) runs
    // poseHome, which used to fade the host and flash the center black.
    if (beginZoomHome(activeSpaceId)) return;
    if (busyRef.current) return;
    useCenterSpaceOverviewStore.getState().setOpen(false);
  }, [activeSpaceId, beginZoomHome]);

  return (
    <>
      <div
        ref={stageRef}
        data-center-space-stage=""
        className={cn("h-full min-h-0", mounted && "pointer-events-none relative z-40")}
        inert={mounted || undefined}
      >
        {children}
      </div>
      {mounted && aspect != null ? (
        <div ref={overviewRef} className="contents">
          <CenterSpaceOverview
            posed={posed}
            dimmed={dimmed}
            aspect={aspect}
            onZoom={onZoom}
            onCreate={onCreate}
            onClose={onClose}
            onHandoff={finishHandoff}
          />
        </div>
      ) : null}
    </>
  );
}
