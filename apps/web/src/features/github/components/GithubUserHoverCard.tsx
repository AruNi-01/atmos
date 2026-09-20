"use client";

import React, { useState } from "react";
import { useTheme } from "next-themes";
import { useLocale, useTranslations } from "next-intl";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui";
import { cn } from "@/shared/lib/utils";
import { FollowHoverCard } from "@/shared/components/follow-hover-card";
import { useGithubUserCardQuery } from "@/features/github/hooks/use-github-user-card-query";
import {
  formatContributionDate,
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

const COLOR_SCHEME = {
  light: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
  dark: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
} as const;

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
  const locale = useLocale();
  const t = useTranslations("github.userCard");
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
            className="truncate text-xs text-muted-foreground hover:text-foreground"
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
                      {t("dayTooltip", {
                        count: day.count,
                        date: formatContributionDate(day.date, locale),
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <span className="mt-3 block text-left font-mono text-[11px] text-muted-foreground">
            {t("yearTotal", {
              total: total.toLocaleString(locale),
              year,
            })}
          </span>
        </>
      ) : isLoading ? (
        <span className="block text-left font-mono text-[11px] text-muted-foreground">
          {t("loading")}
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
  const [open, setOpen] = useState(false);
  const { data: card, isFetching } = useGithubUserCardQuery({
    login,
    enabled: open && Boolean(login),
    source,
  });

  if (!login || disabled || isGithubBotLogin(username)) {
    return <>{children}</>;
  }

  return (
    <FollowHoverCard
      side={side}
      openDelay={openDelay}
      closeDelay={closeDelay}
      className={className}
      contentClassName={cn("p-5", contentClassName)}
      linkTiltMaxRotate={linkTiltMaxRotate}
      cardWidth={320}
      cardApproxHeight={220}
      onOpenChange={setOpen}
      content={
        <GithubUserCardBody
          username={login}
          name={name}
          avatarUrl={avatarUrl}
          card={card}
          isLoading={isFetching}
        />
      }
    >
      {children}
    </FollowHoverCard>
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
