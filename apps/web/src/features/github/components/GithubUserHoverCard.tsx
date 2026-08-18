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
import { useTheme } from "next-themes";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui";
import { cn } from "@/shared/lib/utils";
import { useGithubUserCardQuery } from "@/features/github/hooks/use-github-user-card-query";
import {
  normalizeGithubLogin,
  type GithubUserCardSource,
} from "@/features/github/lib/public-github-user-card";
import type { GithubUserCardPayload } from "@atmos/api-types/ws/dto/github";

export interface GithubUserHoverCardProps {
  username?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  /** Disable the card (e.g. for bots). */
  disabled?: boolean;
  /**
   * Preferred vertical side. `"auto"` picks top when there is room, else bottom.
   * Horizontal placement is intentionally not used (mouse-follow only works vertically).
   */
  side?: "top" | "bottom" | "auto";
  openDelay?: number;
  closeDelay?: number;
  className?: string;
  contentClassName?: string;
  /** Max 3D tilt while the pointer is on the trigger (degrees). */
  linkTiltMaxRotate?: number;
  /**
   * `auto` uses local `github_user_card` when a computer WS is up, then the
   * public contributions API (Great UI host). Share/leaderboard pages pass `public`.
   */
  source?: GithubUserCardSource;
  children: React.ReactNode;
}

export interface GithubUserAvatarProps {
  username?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  /** Optional display name rendered next to the avatar; shares the same hover hit area. */
  label?: React.ReactNode;
  labelClassName?: string;
  /** Avatar root classes (size, border, etc.). */
  className?: string;
  fallbackClassName?: string;
  alt?: string;
  disabled?: boolean;
  side?: GithubUserHoverCardProps["side"];
  openDelay?: number;
  closeDelay?: number;
  /** Extra classes on the hover trigger wrapper. */
  triggerClassName?: string;
  source?: GithubUserCardSource;
}

type Placement = "top" | "bottom";

const COLOR_SCHEME = {
  light: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
  dark: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
} as const;

const CARD_WIDTH = 320;
const CARD_APPROX_HEIGHT = 220;
const VIEWPORT_PAD = 12;

function githubAvatarSrc(username?: string | null, avatarUrl?: string | null) {
  if (avatarUrl) return avatarUrl;
  const login = normalizeGithubLogin(username);
  if (!login) return undefined;
  return `https://github.com/${login}.png?size=64`;
}

function githubInitials(username?: string | null) {
  const login = normalizeGithubLogin(username) || "?";
  return login.slice(0, 2).toUpperCase();
}

export function isGithubBotLogin(login?: string | null): boolean {
  if (!login) return false;
  const lower = login.toLowerCase();
  return (
    lower.endsWith("[bot]") ||
    lower.endsWith("-bot") ||
    lower === "github-actions" ||
    lower === "dependabot" ||
    lower === "renovate" ||
    lower === "cursor" ||
    lower === "vercel" ||
    lower === "copilot"
  );
}

function formatContributionDate(dateStr: string) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
  preferred: GithubUserHoverCardProps["side"],
  rect: DOMRect,
): Placement {
  if (preferred === "top" || preferred === "bottom") return preferred;

  const spaceTop = rect.top;
  const spaceBottom = window.innerHeight - rect.bottom;
  // Prefer above when either fits or top has more room.
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

function GithubUserCardBody({
  username,
  name,
  avatarUrl,
  card,
  isLoading,
}: {
  username: string;
  name?: string | null;
  avatarUrl?: string | null;
  card?: GithubUserCardPayload;
  isLoading: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  const year = new Date().getFullYear();

  const displayName = card?.name || name || card?.login || username;
  const displayAvatar =
    card?.avatar_url || avatarUrl || `https://github.com/${username}.png`;
  const contributions = card?.contributions ?? [];
  const hasCalendar = contributions.length > 0;
  const total = hasCalendar
    ? (card?.total_contributions ??
      contributions.reduce((sum, day) => sum + day.count, 0))
    : 0;
  const profileUrl = `https://github.com/${username}`;

  return (
    <>
      <div className="mb-4 flex items-center gap-3.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={displayAvatar}
          alt={`${displayName}'s avatar`}
          className="size-12 rounded-full border border-border/60 object-cover shadow-sm"
        />
        <div className="flex min-w-0 flex-col text-left">
          <span className="truncate text-sm font-semibold text-foreground">
            {displayName}
          </span>
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-xs text-muted-foreground transition-colors hover:text-foreground"
            onClick={(event) => event.stopPropagation()}
          >
            @{username}
          </a>
        </div>
      </div>

      {hasCalendar ? (
        <>
          <div className="mx-auto grid w-max grid-flow-col grid-rows-7 gap-1">
            {contributions.map((day, index) => {
              const level = Math.max(0, Math.min(4, day.level ?? 0));
              const color = isDark
                ? COLOR_SCHEME.dark[level] ?? COLOR_SCHEME.dark[0]
                : COLOR_SCHEME.light[level] ?? COLOR_SCHEME.light[0];
              return (
                <div key={day.date || index} className="group/cell relative">
                  <div
                    style={{ backgroundColor: color }}
                    className="size-2.5 cursor-default rounded-[2px] transition-transform duration-200 hover:z-10 hover:scale-125"
                  />
                  {day.date ? (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-[60] mb-1.5 hidden -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-[10px] font-medium whitespace-nowrap text-background shadow-md group-hover/cell:block">
                      <span className="font-semibold">{day.count}</span>
                      {" contributions on "}
                      {formatContributionDate(day.date)}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <span className="mt-3 block text-left font-mono text-[11px] text-muted-foreground">
            {`${total.toLocaleString()} contributions in ${year}`}
          </span>
        </>
      ) : isLoading ? (
        <span className="block text-left font-mono text-[11px] text-muted-foreground">
          Loading contributions…
        </span>
      ) : null}
    </>
  );
}

/**
 * Hover preview of a GitHub user's profile card (avatar, handle, contribution graph).
 * Data: local `github_user_card` (gh GraphQL) when a computer WS is up,
 * otherwise the public contributions API used by Great UI Github Card.
 * Mouse-follow + 3D tilt (top/bottom only) adapted from Great UI Github Card.
 */
export function GithubUserHoverCard({
  username,
  name,
  avatarUrl,
  disabled = false,
  side = "auto",
  openDelay = 180,
  closeDelay = 140,
  className,
  contentClassName,
  linkTiltMaxRotate = 5,
  source = "auto",
  children,
}: GithubUserHoverCardProps) {
  const login = normalizeGithubLogin(username);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether the pointer is on the trigger ("link") or the popover ("card").
  // Follow + 3D tilt only apply while on the trigger — matching Great UI's link phase,
  // and skipping card-phase motion per product preference.
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

  // Great UI formula: map pointer offset (-20..20) → tilt degrees.
  const rotateX = useTransform(mouseYSpring, (val) => {
    const pct = (val + 20) / 40;
    return linkTiltMaxRotate - pct * (2 * linkTiltMaxRotate);
  });
  const rotateY = useTransform(mouseXSpring, (val) => {
    const pct = (val + 20) / 40;
    return -linkTiltMaxRotate + pct * (2 * linkTiltMaxRotate);
  });

  const { data: card, isFetching } = useGithubUserCardQuery({
    login,
    enabled: isHovered && Boolean(login),
    source,
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

  /** Only while pointer is on the trigger — drives popover x-follow + 3D tilt. */
  const handleLinkMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (hoverSurfaceRef.current !== "link") return;
      const { nx, ny } = readPointerOffset(event, triggerRef.current);
      x.set(nx);
      y.set(ny);
    },
    [x, y],
  );

  if (!login || disabled || isGithubBotLogin(username)) {
    return <>{children}</>;
  }

  const placementTranslate =
    placement === "top" ? "translate(-50%, -100%)" : "translate(-50%, 0)";

  const popover =
    isHovered && typeof document !== "undefined"
      ? createPortal(
          // Fixed anchor point at the trigger edge.
          <div
            style={{
              position: "fixed",
              left: origin.left,
              top: origin.top,
              zIndex: 80,
              pointerEvents: "none",
            }}
          >
            {/*
              Perspective MUST live on an ancestor of the rotated element.
              Official Great UI puts [perspective:1000px] on the trigger wrapper;
              we recreate that here around the portaled card.
            */}
            <div
              style={{
                transform: placementTranslate,
                perspective: 1000,
                pointerEvents: "none",
              }}
            >
              <motion.div
                onMouseEnter={() => {
                  // Entering the popover: stop following, settle flat (no card-phase tilt).
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
                    // Entrance offset only — not the mouse-follow spring.
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
                  // Great UI popoverStyle: spring x + rotateX/Y under a perspective parent.
                  x: mouseXSpring,
                  rotateX,
                  rotateY,
                  transformStyle: "preserve-3d",
                  transformOrigin: origin.transformOrigin,
                  pointerEvents: "auto",
                }}
                className={cn(
                  "relative w-80 select-none rounded-2xl border border-dashed border-border/70 bg-popover/95 p-5 shadow-xl backdrop-blur-md will-change-transform",
                  // Hover bridge so the pointer can travel trigger → card without closing.
                  placement === "top" &&
                    "after:absolute after:left-0 after:top-full after:h-4 after:w-full",
                  placement === "bottom" &&
                    "after:absolute after:bottom-full after:left-0 after:h-4 after:w-full",
                  contentClassName,
                )}
              >
                <GithubUserCardBody
                  username={login}
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
          // Leaving trigger toward the card is handled by the card's enter;
          // a short close delay covers the bridge gap.
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

/**
 * Unified GitHub user avatar (+ optional name label) with hover profile card.
 * When `label` is set, hovering either the avatar or the name opens the card.
 */
export function GithubUserAvatar({
  username,
  name,
  avatarUrl,
  label,
  labelClassName,
  className,
  fallbackClassName,
  alt,
  disabled,
  side = "auto",
  openDelay,
  closeDelay,
  triggerClassName,
  source,
}: GithubUserAvatarProps) {
  const src = githubAvatarSrc(username, avatarUrl);
  const initials = githubInitials(username);
  const imageAlt = alt || name || username || initials;

  return (
    <GithubUserHoverCard
      username={username}
      name={name}
      avatarUrl={avatarUrl}
      disabled={disabled}
      side={side}
      openDelay={openDelay}
      closeDelay={closeDelay}
      source={source}
      className={cn(label != null ? "min-w-0" : undefined, triggerClassName)}
    >
      <Avatar className={className} title={username ?? undefined}>
        {src ? <AvatarImage src={src} alt={imageAlt} /> : null}
        <AvatarFallback className={fallbackClassName}>{initials}</AvatarFallback>
      </Avatar>
      {label != null && label !== false ? (
        typeof label === "string" || typeof label === "number" ? (
          <span className={cn("truncate", labelClassName)}>{label}</span>
        ) : (
          label
        )
      ) : null}
    </GithubUserHoverCard>
  );
}
