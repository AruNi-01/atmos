"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Layers, Trash2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "@workspace/ui";
import { useContextParams } from "@/shared/hooks/use-context-params";
import {
  DEFAULT_CENTER_SPACE_ID,
  MAX_CENTER_SPACES_PER_HOST,
  makeCenterSpaceKey,
  type CenterSpaceRecord,
} from "@/app-shell/center-space/center-space";
import {
  hostSpaceAttentionReasons,
  offActiveSpaceAttentionReason,
} from "@/app-shell/center-space/center-space-attention";
import {
  CENTER_SPACE_FAN_EXIT_MS,
  centerSpaceFanCssVars,
  centerSpaceFanPose,
  centerSpaceFanStageWidth,
} from "@/app-shell/center-space/center-space-fan";
import { useCenterSpaceStore } from "@/app-shell/center-space/center-space-store";
import { CenterSpacePreview } from "@/app-shell/center-space/CenterSpacePreview";
import {
  captureActiveCenterSpaceThumbnail,
  deleteCenterSpace,
  refreshActiveCenterSpacePreview,
  switchCenterSpace,
} from "@/app-shell/center-space/center-space-switch";
import { prefetchCenterSpaceSnapdom } from "@/app-shell/center-space/center-space-thumbnail";
import { useCenterStageLastTab } from "@/shared/stores/use-ui-pref-hooks";
import { useAgentAttentionStore } from "@/features/agent/store/agent-attention-store";
import { HEADER_CHIP_SURFACE_CLASS } from "@/app-shell/header-parts";
import "./center-space-fan.css";

const EMPTY_CENTER_SPACES: CenterSpaceRecord[] = [];

export function CenterSpaceSwitcher() {
  const t = useTranslations("header.centerSpace");
  const { effectiveContextId: hostId, currentView } = useContextParams();
  const hydrate = useCenterSpaceStore((s) => s.hydrate);
  const spaces = useCenterSpaceStore((s) =>
    hostId ? s.byHost[hostId]?.spaces ?? EMPTY_CENTER_SPACES : EMPTY_CENTER_SPACES,
  );
  const activeSpaceId = useCenterSpaceStore((s) =>
    hostId ? s.getActiveSpaceId(hostId) : DEFAULT_CENTER_SPACE_ID,
  );
  const paintId = hostId ? makeCenterSpaceKey(hostId, activeSpaceId) : null;
  const lastTab = useCenterStageLastTab(paintId);
  const surfaceKey = `${hostId ?? ""}:${activeSpaceId}:${lastTab ?? ""}`;
  const spaceAttentionReasons = useAgentAttentionStore(
    useShallow((s) => hostSpaceAttentionReasons(s.panes.values(), hostId ?? "")),
  );
  const otherSpaceAttention = offActiveSpaceAttentionReason(
    spaceAttentionReasons,
    activeSpaceId,
  );
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [spread, setSpread] = React.useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [fanOrigin, setFanOrigin] = React.useState<{ top: number; left: number } | null>(
    null,
  );
  const rootRef = React.useRef<HTMLDivElement>(null);
  const previewPromiseRef = React.useRef<Promise<void> | null>(null);
  const previewReadyRef = React.useRef(false);
  const previewCancelRef = React.useRef<(() => void) | null>(null);
  const allowIdleCaptureRef = React.useRef(false);
  const spreadAllowedRef = React.useRef(false);
  const openingRef = React.useRef(false);

  const readFanOrigin = React.useCallback(() => {
    const root = rootRef.current;
    if (!root) return null;
    const rect = root.getBoundingClientRect();
    return { top: rect.bottom, left: rect.left + rect.width / 2 };
  }, []);

  const ensurePreview = React.useCallback((force = false) => {
    previewCancelRef.current?.();
    previewCancelRef.current = null;
    if (!hostId) return Promise.resolve();
    if (!force && previewReadyRef.current) return Promise.resolve();
    if (previewPromiseRef.current) return previewPromiseRef.current;
    const pending = refreshActiveCenterSpacePreview(hostId)
      .then(() => {
        const store = useCenterSpaceStore.getState();
        const activeId = store.getActiveSpaceId(hostId);
        previewReadyRef.current = Boolean(
          store.list(hostId).find((space) => space.id === activeId)?.thumbnailDataUrl,
        );
      })
      .finally(() => {
        previewPromiseRef.current = null;
      });
    previewPromiseRef.current = pending;
    return pending;
  }, [hostId]);

  const schedulePreview = React.useCallback(() => {
    if (open || !hostId) return;
    if (previewReadyRef.current || previewPromiseRef.current) return;
    if (previewCancelRef.current) return;

    let raf = 0;
    let idle = 0;
    let timeout = 0;
    const cancel = () => {
      if (raf) cancelAnimationFrame(raf);
      if (idle && typeof cancelIdleCallback === "function") cancelIdleCallback(idle);
      if (timeout) window.clearTimeout(timeout);
      if (previewCancelRef.current === cancel) previewCancelRef.current = null;
    };
    previewCancelRef.current = cancel;

    // Hover highlight must paint first. Capture only after this frame, on idle.
    raf = requestAnimationFrame(() => {
      raf = 0;
      const run = () => {
        if (previewCancelRef.current === cancel) previewCancelRef.current = null;
        void ensurePreview();
      };
      if (typeof requestIdleCallback === "function") {
        idle = requestIdleCallback(run, { timeout: 200 });
      } else {
        timeout = window.setTimeout(run, 0);
      }
    });
  }, [ensurePreview, hostId, open]);

  const closeFan = React.useCallback((opts?: { immediate?: boolean }) => {
    spreadAllowedRef.current = false;
    setSpread(false);
    setOpen(false);
    setConfirmDeleteId(null);
    if (opts?.immediate) setMounted(false);
  }, []);

  const handlePointerEnter = React.useCallback(() => {
    if (open) return;
    schedulePreview();
  }, [open, schedulePreview]);

  const handlePointerLeave = React.useCallback(() => {
    if (open || openingRef.current) return;
    if (previewPromiseRef.current) return;
    previewCancelRef.current?.();
  }, [open]);

  const handleToggleOpen = React.useCallback(() => {
    if (open) {
      closeFan();
      return;
    }
    if (openingRef.current) return;
    openingRef.current = true;
    const origin = readFanOrigin();
    if (origin) setFanOrigin(origin);
    spreadAllowedRef.current = true;
    setMounted(true);
    setOpen(true);
    openingRef.current = false;
    // Snap after the fan paints. Walking the center tree on this click hitches.
    requestAnimationFrame(() => {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(() => {
          void ensurePreview(true);
        }, { timeout: 240 });
        return;
      }
      window.setTimeout(() => {
        void ensurePreview(true);
      }, 0);
    });
  }, [closeFan, ensurePreview, open, readFanOrigin]);

  React.useEffect(() => {
    hydrate();
  }, [hydrate]);

  React.useEffect(() => {
    previewReadyRef.current = false;
  }, [surfaceKey]);

  React.useEffect(() => {
    if (!hostId || open || spaces.length < 2) return;
    // Snapdom mutates live nodes while measuring. Running that during the
    // first workspace hydrate prunes tabs / blanks the center. Skip once.
    if (!allowIdleCaptureRef.current) {
      allowIdleCaptureRef.current = true;
      prefetchCenterSpaceSnapdom();
      return;
    }
    let idle = 0;
    let timeout = 0;
    const run = () => {
      void captureActiveCenterSpaceThumbnail(hostId);
    };
    if (typeof requestIdleCallback === "function") {
      idle = requestIdleCallback(run, { timeout: 800 });
    } else {
      timeout = window.setTimeout(run, 400);
    }
    return () => {
      if (idle && typeof cancelIdleCallback === "function") cancelIdleCallback(idle);
      if (timeout) window.clearTimeout(timeout);
    };
  }, [hostId, open, surfaceKey, spaces.length]);

  React.useEffect(() => {
    return () => {
      previewCancelRef.current?.();
    };
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const origin = readFanOrigin();
      if (origin) setFanOrigin(origin);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open, readFanOrigin]);

  React.useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), CENTER_SPACE_FAN_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  React.useEffect(() => {
    if (!open || !mounted) return;
    const frame = requestAnimationFrame(() => {
      if (spreadAllowedRef.current) setSpread(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, mounted]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        (target.closest("[data-center-space-switcher]") ||
          target.closest("[data-slot=\"popover-content\"]"))
      ) {
        return;
      }
      closeFan();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (confirmDeleteId) {
        setConfirmDeleteId(null);
        return;
      }
      closeFan();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeFan, confirmDeleteId, open]);

  if (
    !hostId ||
    (currentView !== "workspace" && currentView !== "project") ||
    spaces.length < 2
  ) {
    return null;
  }

  const active = spaces.find((space) => space.id === activeSpaceId) ?? spaces[0]!;
  const spaceLabel = (space: (typeof spaces)[number]) =>
    space.id === DEFAULT_CENTER_SPACE_ID ? t("defaultSpace") : space.name;

  return (
    <div
      ref={rootRef}
      data-center-space-switcher=""
      className="desktop-no-drag relative z-10 max-w-[180px] shrink-0"
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("buttonCountAria", { count: spaces.length })}
        title={spaceLabel(active)}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onFocus={handlePointerEnter}
        onClick={() => {
          void handleToggleOpen();
        }}
        className={cn(
          "flex h-8 w-full min-w-0 max-w-[220px] cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium",
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          "dark:hover:bg-accent dark:hover:text-accent-foreground",
          HEADER_CHIP_SURFACE_CLASS,
          open && "border-border bg-accent text-accent-foreground dark:bg-accent",
        )}
      >
        <span className="relative size-3.5 shrink-0">
          <Layers className="size-3.5" />
          <span
            aria-hidden="true"
            className={cn(
              "absolute -left-1 -top-1 flex h-2.5 min-w-2.5 items-center justify-center rounded-full px-px text-[8px] font-semibold tabular-nums leading-none",
              otherSpaceAttention === "permission_request"
                ? "bg-amber-500 text-white"
                : otherSpaceAttention === "task_complete"
                  ? "bg-emerald-500 text-white"
                  : "bg-primary text-primary-foreground",
            )}
          >
            {spaces.length}
          </span>
        </span>
        <span className="min-w-0 flex-1 truncate text-left">{spaceLabel(active)}</span>
      </button>
      {typeof document !== "undefined" && mounted && fanOrigin
        ? createPortal(
            <div
              data-center-space-switcher=""
              className="pointer-events-none"
              style={{
                position: "fixed",
                top: fanOrigin.top,
                left: fanOrigin.left,
                zIndex: 80,
                width: centerSpaceFanStageWidth(spaces.length),
              }}
            >
              <div
                data-fan-open={spread ? "true" : "false"}
                className="center-space-fan-stage relative h-[200px] w-full -translate-x-1/2 pt-2"
              >
                {spaces.map((space, index) => {
                  const pose = centerSpaceFanPose(index, spaces.length, spread);
                  const selected = space.id === activeSpaceId;
                  const attentionReason = spaceAttentionReasons[space.id] ?? null;
                  const canDelete =
                    space.id !== DEFAULT_CENTER_SPACE_ID && spaces.length > 1;
                  const confirming = confirmDeleteId === space.id;
                  return (
                    <div
                      key={space.id}
                      className="center-space-fan-card group/space"
                      data-center-space-fan-card=""
                      data-confirming={confirming ? "true" : undefined}
                      style={centerSpaceFanCssVars(pose) as React.CSSProperties}
                    >
                      <button
                        type="button"
                        onClick={(event) => {
                          if (!hostId) return;
                          if (space.id === activeSpaceId) {
                            closeFan();
                            return;
                          }
                          const fromCard =
                            event.currentTarget.closest<HTMLElement>(
                              "[data-center-space-fan-card]",
                            ) ?? event.currentTarget;
                          void switchCenterSpace(hostId, space.id, {
                            fromCard,
                            onPaint: () => closeFan({ immediate: true }),
                          });
                        }}
                        className={cn(
                          "relative flex w-full flex-col overflow-hidden rounded-xl border bg-background text-left shadow-[0_10px_24px_rgb(0_0_0/0.22)]",
                          attentionReason
                            ? cn(
                                "agent-attention-ring-card",
                                attentionReason === "permission_request"
                                  ? "agent-attention-ring-permission"
                                  : "agent-attention-ring-complete",
                              )
                            : selected
                              ? "border-primary/55"
                              : "border-border/70",
                        )}
                      >
                        <div className="relative h-[92px] w-full overflow-hidden bg-muted/40">
                          <CenterSpacePreview
                            hostId={hostId}
                            spaceId={space.id}
                            thumbnailDataUrl={space.thumbnailDataUrl}
                            live={open && selected}
                            emptyLabel={t("noPreview")}
                          />
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent px-2 pb-1.5 pt-6">
                            <div
                              className="truncate text-[12px] font-medium text-white"
                              title={spaceLabel(space)}
                            >
                              {spaceLabel(space)}
                            </div>
                          </div>
                        </div>
                      </button>
                      {canDelete ? (
                        <Popover
                          open={confirming}
                          onOpenChange={(next) => {
                            setConfirmDeleteId((current) => {
                              if (next) return space.id;
                              return current === space.id ? null : current;
                            });
                          }}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              aria-label={t("deleteSpace", { name: spaceLabel(space) })}
                              className={cn(
                                "absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-md",
                                "bg-background/90 text-muted-foreground opacity-0 shadow-sm",
                                "transition-opacity hover:bg-destructive hover:text-destructive-foreground",
                                "group-hover/space:opacity-100",
                                confirming &&
                                  "opacity-100 bg-destructive text-destructive-foreground",
                              )}
                              onClick={(event) => {
                                event.stopPropagation();
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            data-center-space-switcher=""
                            side="bottom"
                            align="end"
                            sideOffset={6}
                            className="z-[90] w-56 space-y-3 p-3"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <p className="text-sm text-foreground">
                              {t("deleteConfirmTitle", { name: spaceLabel(space) })}
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
                                  setConfirmDeleteId(null);
                                  void deleteCenterSpace(hostId, space.id);
                                }}
                              >
                                {t("deleteConfirmAction")}
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {spaces.length >= MAX_CENTER_SPACES_PER_HOST ? (
                <p className="relative left-1/2 w-[220px] -translate-x-1/2 pt-1 text-center text-[11px] text-muted-foreground">
                  {t("limitReached")}
                </p>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
