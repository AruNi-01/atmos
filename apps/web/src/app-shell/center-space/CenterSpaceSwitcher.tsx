"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Layers, Trash2 } from "lucide-react";
import { cn } from "@workspace/ui";
import { useContextParams } from "@/shared/hooks/use-context-params";
import {
  DEFAULT_CENTER_SPACE_ID,
  MAX_CENTER_SPACES_PER_HOST,
  type CenterSpaceRecord,
} from "@/app-shell/center-space/center-space";
import { centerSpaceFanPose } from "@/app-shell/center-space/center-space-fan";
import { useCenterSpaceStore } from "@/app-shell/center-space/center-space-store";
import {
  captureActiveCenterSpaceThumbnail,
  deleteCenterSpace,
  switchCenterSpace,
} from "@/app-shell/center-space/center-space-switch";

const FAN_EASE = { type: "spring", stiffness: 320, damping: 26, mass: 0.7 } as const;
const EMPTY_CENTER_SPACES: CenterSpaceRecord[] = [];

export function CenterSpaceSwitcher() {
  const t = useTranslations("header.centerSpace");
  const reduceMotion = useReducedMotion();
  const { effectiveContextId: hostId, currentView } = useContextParams();
  const hydrate = useCenterSpaceStore((s) => s.hydrate);
  const spaces = useCenterSpaceStore((s) =>
    hostId ? s.byHost[hostId]?.spaces ?? EMPTY_CENTER_SPACES : EMPTY_CENTER_SPACES,
  );
  const activeSpaceId = useCenterSpaceStore((s) =>
    hostId ? s.getActiveSpaceId(hostId) : DEFAULT_CENTER_SPACE_ID,
  );
  const [open, setOpen] = React.useState(false);
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const capturingRef = React.useRef(false);

  const captureCurrentPreview = React.useCallback(() => {
    if (!hostId || capturingRef.current) return;
    capturingRef.current = true;
    void captureActiveCenterSpaceThumbnail(hostId).finally(() => {
      capturingRef.current = false;
    });
  }, [hostId]);

  const handleToggleOpen = React.useCallback(() => {
    if (open) {
      setOpen(false);
      return;
    }
    captureCurrentPreview();
    setOpen(true);
  }, [captureCurrentPreview, open]);
  const [fanOrigin, setFanOrigin] = React.useState<{ top: number; left: number } | null>(
    null,
  );

  React.useEffect(() => {
    hydrate();
  }, [hydrate]);

  React.useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      setFanOrigin({ top: rect.bottom, left: rect.left + rect.width / 2 });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      setHoveredIndex(null);
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-center-space-switcher]")
      ) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

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
        onClick={handleToggleOpen}
        className={cn(
          "flex h-8 w-full min-w-0 max-w-[220px] items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium",
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          open && "bg-accent text-accent-foreground",
        )}
      >
        <span className="relative size-3.5 shrink-0">
          <Layers className="size-3.5" />
          <span
            aria-hidden="true"
            className="absolute -left-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-semibold tabular-nums leading-none text-primary-foreground"
          >
            {spaces.length}
          </span>
        </span>
        <span className="min-w-0 flex-1 truncate text-left">{spaceLabel(active)}</span>
      </button>
      {typeof document !== "undefined" && fanOrigin
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <div
                  data-center-space-switcher=""
                  className="pointer-events-none"
                  style={{
                    position: "fixed",
                    top: fanOrigin.top,
                    left: fanOrigin.left,
                    zIndex: 80,
                    width: fanStageWidth(spaces.length),
                  }}
                >
            <div className="relative h-[188px] w-full -translate-x-1/2 pt-2">
              {spaces.map((space, index) => {
                const pose = centerSpaceFanPose(
                  index,
                  spaces.length,
                  true,
                  hoveredIndex,
                );
                const selected = space.id === activeSpaceId;
                const canDelete =
                  space.id !== DEFAULT_CENTER_SPACE_ID && spaces.length > 1;
                const transition = reduceMotion
                  ? { duration: 0 }
                  : { ...FAN_EASE, delay: index * 0.035 };
                return (
                  <motion.div
                    key={space.id}
                    initial={
                      reduceMotion
                        ? false
                        : centerSpaceFanPose(index, spaces.length, false, null)
                    }
                    animate={pose}
                    exit={
                      reduceMotion
                        ? undefined
                        : centerSpaceFanPose(index, spaces.length, false, null)
                    }
                    transition={transition}
                    style={{ zIndex: pose.z, marginLeft: -74 }}
                    className="group/space pointer-events-auto absolute left-1/2 top-0 w-[148px] origin-top"
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() =>
                      setHoveredIndex((current) => (current === index ? null : current))
                    }
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (!hostId) return;
                        if (space.id === activeSpaceId) {
                          captureCurrentPreview();
                          setOpen(false);
                          return;
                        }
                        void switchCenterSpace(hostId, space.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "relative flex w-full flex-col overflow-hidden rounded-xl border bg-background text-left shadow-[0_18px_40px_rgb(0_0_0/0.28)]",
                        selected ? "border-primary/55" : "border-border/70",
                      )}
                    >
                      <div className="relative aspect-[16/10] w-full bg-muted/40">
                        {space.thumbnailDataUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- captured JPEG thumbnail
                          <img
                            src={space.thumbnailDataUrl}
                            alt=""
                            className="size-full object-cover"
                          />
                        ) : (
                          <div className="flex size-full items-center justify-center text-[11px] text-muted-foreground">
                            {t("noPreview")}
                          </div>
                        )}
                      </div>
                      <div
                        className="truncate px-2 py-1.5 text-[12px] font-medium text-foreground"
                        title={spaceLabel(space)}
                      >
                        {spaceLabel(space)}
                      </div>
                    </button>
                    {canDelete ? (
                      <button
                        type="button"
                        aria-label={t("deleteSpace", { name: space.name })}
                        className={cn(
                          "absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-md",
                          "bg-background/90 text-muted-foreground opacity-0 shadow-sm",
                          "transition-opacity hover:bg-destructive hover:text-destructive-foreground",
                          "group-hover/space:opacity-100",
                        )}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (!hostId) return;
                          void deleteCenterSpace(hostId, space.id);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </motion.div>
                );
              })}
            </div>
            {spaces.length >= MAX_CENTER_SPACES_PER_HOST ? (
              <p className="relative left-1/2 w-[220px] -translate-x-1/2 pt-1 text-center text-[11px] text-muted-foreground">
                {t("limitReached")}
              </p>
            ) : null}
                </div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  );
}

function fanStageWidth(count: number): number {
  if (count <= 2) return 280;
  if (count === 3) return 340;
  return Math.min(420, 180 + count * 36);
}
