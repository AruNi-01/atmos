"use client";

import React, { useState } from "react";
import { Calendar, Link as LinkIcon, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { XIcon } from "@workspace/ui";
import { FollowHoverCard } from "@/shared/components/follow-hover-card";
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

function xInitials(username?: string | null) {
  const handle = normalizeXUsername(username) || "?";
  return handle.slice(0, 2).toUpperCase();
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
  const [open, setOpen] = useState(false);
  const { data: card, isFetching } = useXUserCardQuery({
    username: handle,
    enabled: open && Boolean(handle),
  });

  if (!handle) {
    return <>{children}</>;
  }

  return (
    <FollowHoverCard
      side={side}
      openDelay={openDelay}
      closeDelay={closeDelay}
      className={className}
      contentClassName={contentClassName}
      linkTiltMaxRotate={linkTiltMaxRotate}
      cardWidth={320}
      cardApproxHeight={360}
      onOpenChange={setOpen}
      content={
        <XUserCardBody
          username={handle}
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
