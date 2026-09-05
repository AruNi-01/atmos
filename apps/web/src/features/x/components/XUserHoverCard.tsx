"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import { Calendar, Link as LinkIcon, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { XIcon } from "@workspace/ui";
import { cn } from "@/shared/lib/utils";
import { useXUserCardQuery } from "@/features/x/hooks/use-x-user-card-query";
import {
  formatXCount,
  formatXJoinedDate,
  normalizeXUsername,
  type XUserCardPayload,
} from "@/features/x/lib/public-x-user-card";

export interface XUserHoverCardProps {
  username?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  side?: "top" | "bottom" | "auto";
  openDelay?: number;
  closeDelay?: number;
  className?: string;
  contentClassName?: string;
  /** Max 3D tilt while the pointer is on the trigger (degrees). */
  linkTiltMaxRotate?: number;
  children: React.ReactNode;
}

type Placement = "top" | "bottom";

const CARD_WIDTH = 320;
const CARD_APPROX_HEIGHT = 360;
const VIEWPORT_PAD = 12;

function xInitials(username?: string | null) {
  const handle = normalizeXUsername(username) || "?";
  return handle.slice(0, 2).toUpperCase();
}

function readPointerOffset(
  event: React.MouseEvent,
  el: HTMLElement | null,
): { nx: number; ny: number } {
  if (!el) return { nx: 0, ny: 0 };
  const rect = el.getBoundingClientRect();
  const halfW = Math.max(rect.width / 2, 1);
  const halfH = Math.max(rect.height / 2, 1);
  const nx = ((event.clientX - rect.left - halfW) / halfW) * 20;
  const ny = ((event.clientY - rect.top - halfH) / halfH) * 20;
  return {
    nx: Math.max(-20, Math.min(20, nx)),
    ny: Math.max(-20, Math.min(20, ny)),
  };
}

function resolveVerticalPlacement(
  preferred: XUserHoverCardProps["side"],
  rect: DOMRect,
): Placement {
  if (preferred === "top" || preferred === "bottom") return preferred;

  const spaceTop = rect.top;
  const spaceBottom = window.innerHeight - rect.bottom;
  if (spaceTop >= CARD_APPROX_HEIGHT + 24) return "top";
  if (spaceBottom >= CARD_APPROX_HEIGHT + 24) return "bottom";
  return spaceTop >= spaceBottom ? "top" : "bottom";
}

function computeCardOrigin(rect: DOMRect, placement: Placement) {
  const gap = 14;
  if (placement === "bottom") {
    return {
      left: rect.left + rect.width / 2,
      top: rect.bottom + gap,
      transformOrigin: "top center",
    };
  }
  return {
    left: rect.left + rect.width / 2,
    top: rect.top - gap,
    transformOrigin: "bottom center",
  };
}

function clampHorizontal(left: number) {
  const halfW = CARD_WIDTH / 2;
  return Math.min(
    Math.max(left, VIEWPORT_PAD + halfW),
    window.innerWidth - VIEWPORT_PAD - halfW,
  );
}

function XUserCardBody({
  username,
  name,
  avatarUrl,
  card,
  isLoading,
}: {
  username: string;
  name?: string | null;
  avatarUrl?: string | null;
  card?: XUserCardPayload;
  isLoading: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("x.userCard");
  const profileUrl = `https://x.com/${username}`;
  const displayName = card?.name || name || card?.username || username;
  const displayAvatar = card?.avatar_url || avatarUrl || null;
  const joinedLabel = card?.joined
    ? formatXJoinedDate(card.joined, locale)
    : null;

  return (
    <>
      <div className="relative -mx-4 -mt-4 h-24 overflow-hidden rounded-t-2xl bg-muted">
        {card?.banner_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.banner_url}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-r from-muted to-muted/70" />
        )}
      </div>

      <div className="relative mb-2 flex items-start justify-between">
        {displayAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayAvatar}
            alt={`${displayName}'s avatar`}
            referrerPolicy="no-referrer"
            className="relative z-10 -mt-8 size-16 rounded-full border-4 border-popover bg-muted object-cover shadow-md"
          />
        ) : (
          <span
            aria-hidden
            className="relative z-10 -mt-8 flex size-16 items-center justify-center rounded-full border-4 border-popover bg-muted text-sm font-medium text-muted-foreground shadow-md"
          >
            {xInitials(username)}
          </span>
        )}
        <XIcon className="mt-2 size-5 text-muted-foreground" size={20} />
      </div>

      <div className="flex flex-col text-left">
        <span className="text-base leading-snug font-semibold text-foreground">
          {displayName}
        </span>
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={(event) => event.stopPropagation()}
        >
          @{username}
        </a>
      </div>

      {card?.bio ? (
        <p className="mt-2 text-left text-sm leading-relaxed text-foreground">
          {card.bio}
        </p>
      ) : isLoading ? (
        <p className="mt-2 text-left font-mono text-[11px] text-muted-foreground">
          {t("loading")}
        </p>
      ) : null}

      {card ? (
        <>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {card.location ? (
              <div className="flex items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span>{card.location}</span>
              </div>
            ) : null}
            {card.website ? (
              <div className="flex items-center gap-1.5">
                <LinkIcon className="size-3.5 shrink-0" aria-hidden />
                <a
                  href={card.website.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-500 hover:underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  {card.website.display_url}
                </a>
              </div>
            ) : null}
            {joinedLabel ? (
              <div className="flex items-center gap-1.5">
                <Calendar className="size-3.5 shrink-0" aria-hidden />
                <span>{t("joined", { date: joinedLabel })}</span>
              </div>
            ) : null}
          </div>

          <div className="mt-2 flex gap-4 text-left text-sm text-muted-foreground">
            <div className="flex gap-1">
              <span className="font-bold text-foreground">
                {formatXCount(card.following, locale)}
              </span>
              <span>{t("following")}</span>
            </div>
            <div className="flex gap-1">
              <span className="font-bold text-foreground">
                {formatXCount(card.followers, locale)}
              </span>
              <span>{t("followers")}</span>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

/**
 * Hover preview of an X (Twitter) profile card (banner, avatar, bio, stats).
 * Data: public FxTwitter API used by Great UI Twitter(X) Card.
 * Mouse-follow + 3D tilt (top/bottom only) adapted from Great UI Twitter Card.
 */
export function XUserHoverCard({
  username,
  name,
  avatarUrl,
  side = "auto",
  openDelay = 180,
  closeDelay = 140,
  className,
  contentClassName,
  linkTiltMaxRotate = 5,
  children,
}: XUserHoverCardProps) {
  const handle = normalizeXUsername(username);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverSurfaceRef = useRef<"none" | "link" | "card">("none");

  const [isHovered, setIsHovered] = useState(false);
  const [placement, setPlacement] = useState<Placement>("top");
  const [origin, setOrigin] = useState({
    left: 0,
    top: 0,
    transformOrigin: "bottom center",
  });

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mouseXSpring = useSpring(x, { stiffness: 300, damping: 20 });
  const mouseYSpring = useSpring(y, { stiffness: 300, damping: 20 });

  const rotateX = useTransform(mouseYSpring, (val) => {
    const pct = (val + 20) / 40;
    return linkTiltMaxRotate - pct * (2 * linkTiltMaxRotate);
  });
  const rotateY = useTransform(mouseXSpring, (val) => {
    const pct = (val + 20) / 40;
    return -linkTiltMaxRotate + pct * (2 * linkTiltMaxRotate);
  });

  const { data: card, isFetching } = useXUserCardQuery({
    username: handle,
    enabled: isHovered && Boolean(handle),
  });

  useEffect(() => {
    return () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const updateAnchor = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nextPlacement = resolveVerticalPlacement(side, rect);
    const raw = computeCardOrigin(rect, nextPlacement);
    setPlacement(nextPlacement);
    setOrigin({
      left: clampHorizontal(raw.left),
      top: raw.top,
      transformOrigin: raw.transformOrigin,
    });
  }, [side]);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const resetMotion = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  const openCard = useCallback(() => {
    clearCloseTimer();
    clearOpenTimer();
    hoverSurfaceRef.current = "link";
    openTimerRef.current = setTimeout(() => {
      updateAnchor();
      setIsHovered(true);
    }, openDelay);
  }, [clearCloseTimer, clearOpenTimer, openDelay, updateAnchor]);

  const scheduleClose = useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setIsHovered(false);
      hoverSurfaceRef.current = "none";
      resetMotion();
    }, closeDelay);
  }, [clearCloseTimer, clearOpenTimer, closeDelay, resetMotion]);

  useEffect(() => {
    if (!isHovered) return;
    const onScrollOrResize = () => updateAnchor();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [isHovered, updateAnchor]);

  const handleLinkMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (hoverSurfaceRef.current !== "link") return;
      const { nx, ny } = readPointerOffset(event, triggerRef.current);
      x.set(nx);
      y.set(ny);
    },
    [x, y],
  );

  if (!handle) {
    return <>{children}</>;
  }

  const placementTranslate =
    placement === "top" ? "translate(-50%, -100%)" : "translate(-50%, 0)";

  const popover =
    isHovered && typeof document !== "undefined"
      ? createPortal(
          <div
            style={{
              position: "fixed",
              left: origin.left,
              top: origin.top,
              zIndex: 80,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                transform: placementTranslate,
                perspective: 1000,
                pointerEvents: "none",
              }}
            >
              <motion.div
                onMouseEnter={() => {
                  clearCloseTimer();
                  hoverSurfaceRef.current = "card";
                  resetMotion();
                }}
                onMouseLeave={() => {
                  scheduleClose();
                }}
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {
                    opacity: 0,
                    y: placement === "bottom" ? -6 : 6,
                    scale: 0.98,
                    filter: "blur(2px)",
                    transition: { duration: 0.15, ease: "easeIn" },
                  },
                  visible: {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    filter: "blur(0px)",
                    transition: {
                      duration: 0.22,
                      ease: [0.16, 1, 0.3, 1],
                    },
                  },
                }}
                style={{
                  x: mouseXSpring,
                  rotateX,
                  rotateY,
                  transformStyle: "preserve-3d",
                  transformOrigin: origin.transformOrigin,
                  pointerEvents: "auto",
                }}
                className={cn(
                  "relative w-80 select-none rounded-2xl border border-dashed border-border/70 bg-popover/95 p-4 shadow-xl backdrop-blur-md will-change-transform",
                  placement === "top" &&
                    "after:absolute after:left-0 after:top-full after:h-4 after:w-full",
                  placement === "bottom" &&
                    "after:absolute after:bottom-full after:left-0 after:h-4 after:w-full",
                  contentClassName,
                )}
              >
                <XUserCardBody
                  username={handle}
                  name={name}
                  avatarUrl={avatarUrl}
                  card={card}
                  isLoading={isFetching}
                />
              </motion.div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <span
        ref={triggerRef}
        className={cn(
          "relative inline-flex max-w-full items-center gap-1.5 align-middle",
          className,
        )}
        onMouseEnter={() => {
          hoverSurfaceRef.current = "link";
          openCard();
        }}
        onMouseMove={handleLinkMouseMove}
        onMouseLeave={() => {
          scheduleClose();
        }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {children}
      </span>
      {popover}
    </>
  );
}
