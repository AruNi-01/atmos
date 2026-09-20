"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/shared/lib/utils";
import { FollowHoverCard } from "@/shared/components/follow-hover-card";
import { ComposerLinkOgPreview } from "@/shared/components/composer-link-og-preview";
import {
  HTTP_TEXT_LINK_CLASSNAME,
  LINK_OG_CARD_HEIGHT,
  LINK_OG_CARD_WIDTH,
  URL_CHIP_CLASSNAME,
  googleFaviconUrl,
  hostnameFromUrl,
  localLinkPreviewFallback,
  normalizeHttpUrl,
  type LinkPreviewPayload,
} from "@/shared/lib/link-preview";
import {
  fetchLinkPreview,
  peekLinkPreview,
} from "@/shared/lib/link-preview-query";

export function HttpTextLink({
  href,
  children,
  className,
  onClick,
  ...rest
}: {
  href?: string;
} & Omit<React.ComponentPropsWithoutRef<"a">, "href">) {
  const url = normalizeHttpUrl(href);
  if (!url) {
    return (
      <a href={href} className={className} onClick={onClick} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <a
      {...rest}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      data-http-text-link=""
      className={cn(className, HTTP_TEXT_LINK_CLASSNAME)}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
    >
      {children ?? url}
    </a>
  );
}

export function ConversationHttpUrl({
  href,
  children,
  startAsChip = true,
}: {
  href: string;
  children?: React.ReactNode;
  startAsChip?: boolean;
}) {
  const url = normalizeHttpUrl(href);
  const [expanded, setExpanded] = useState(!startAsChip);
  if (!url) return <>{children ?? href}</>;

  return (
    <FollowHoverCard
      cardWidth={LINK_OG_CARD_WIDTH}
      cardApproxHeight={LINK_OG_CARD_HEIGHT}
      contentClassName="overflow-hidden p-0"
      content={<ComposerLinkOgPreview url={url} />}
    >
      {expanded ? (
        <HttpTextLink href={url}>{url}</HttpTextLink>
      ) : (
        <UrlChipTrigger url={url} onExpand={() => setExpanded(true)} />
      )}
    </FollowHoverCard>
  );
}

function UrlChipTrigger({
  url,
  onExpand,
}: {
  url: string;
  onExpand: () => void;
}) {
  const preview = useFetchedLinkPreview(url);
  const title = (preview.title || hostnameFromUrl(url)).trim();
  const favicon = preview.favicon_url || googleFaviconUrl(url);
  return (
    <span
      role="button"
      tabIndex={0}
      data-url-chip=""
      data-kind="url"
      className={URL_CHIP_CLASSNAME}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onExpand();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        onExpand();
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={favicon}
        alt=""
        referrerPolicy="no-referrer"
        className="block size-3 shrink-0 rounded-full"
      />
      <span className="min-w-0 max-w-[12rem] truncate">{title}</span>
    </span>
  );
}

function useFetchedLinkPreview(url: string): LinkPreviewPayload {
  const [preview, setPreview] = useState(
    () => peekLinkPreview(url) ?? localLinkPreviewFallback(url),
  );
  useEffect(() => {
    let cancelled = false;
    const cached = peekLinkPreview(url);
    if (cached) {
      setPreview(cached);
      return () => {
        cancelled = true;
      };
    }
    setPreview(localLinkPreviewFallback(url));
    void fetchLinkPreview(url)
      .then((data) => {
        if (!cancelled && data) setPreview(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [url]);
  return preview;
}
