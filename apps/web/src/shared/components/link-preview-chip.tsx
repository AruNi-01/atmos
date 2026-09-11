"use client";

import React from "react";
import { cn } from "@/shared/lib/utils";
import { FollowHoverCard } from "@/shared/components/follow-hover-card";
import { LinkOgPreviewBody } from "@/shared/components/link-og-preview-body";
import { useLinkPreviewQuery } from "@/shared/hooks/use-link-preview-query";
import {
  googleFaviconUrl,
  hostnameFromUrl,
  LINK_OG_CARD_HEIGHT,
  LINK_OG_CARD_WIDTH,
  localLinkPreviewFallback,
  normalizeHttpUrl,
} from "@/shared/lib/link-preview";

const chipClassName =
  "inline-flex h-5 max-w-[min(100%,16rem)] cursor-pointer items-center gap-1 box-border rounded-full border border-border/70 bg-muted/60 px-1.5 align-middle text-[12px] font-medium leading-none text-foreground no-underline hover:bg-muted hover:text-foreground";

export function LinkPreviewChip({
  href,
  children,
  className,
  onClick,
  ...rest
}: {
  href?: string;
} & Omit<React.ComponentPropsWithoutRef<"a">, "href">) {
  const url = normalizeHttpUrl(href);
  const previewQuery = useLinkPreviewQuery({
    url,
    enabled: Boolean(url),
  });

  if (!url) {
    return (
      <a href={href} className={className} onClick={onClick} {...rest}>
        {children}
      </a>
    );
  }

  const preview = previewQuery.data ?? localLinkPreviewFallback(url);
  const title = (preview.title || hostnameFromUrl(url)).trim();
  const favicon = preview.favicon_url || googleFaviconUrl(url);

  return (
    <FollowHoverCard
      cardWidth={LINK_OG_CARD_WIDTH}
      cardApproxHeight={LINK_OG_CARD_HEIGHT}
      contentClassName="overflow-hidden p-0"
      stopTriggerPropagation={false}
      content={
        <LinkOgPreviewBody
          url={url}
          preview={preview}
          isLoading={previewQuery.isFetching}
        />
      }
    >
      <a
        {...rest}
        href={url}
        onClick={onClick}
        title={url}
        data-link-preview-chip=""
        className={cn(chipClassName, className)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={favicon}
          alt=""
          referrerPolicy="no-referrer"
          className="size-3 shrink-0 rounded-full"
        />
        <span className="min-w-0 truncate">{title}</span>
      </a>
    </FollowHoverCard>
  );
}
