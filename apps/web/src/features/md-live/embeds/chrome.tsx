"use client";

import { cloneElement, isValidElement } from "react";
import {
  Button,
  Skeleton,
  cn,
} from "@workspace/ui";
import { mdLiveCopy } from "../lib/md-live-copy";
import type { MdLiveEmbedChromeProps } from "./types";

function StateBadge({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-1.5 py-px text-[10px] font-medium leading-4",
        className,
      )}
    >
      {label}
    </span>
  );
}

function EmbedCard({
  selected,
  icon,
  title,
  subtitle,
  badge,
  badgeClassName,
  loading,
  canOpen,
  onOpen,
}: Omit<MdLiveEmbedChromeProps, "layout" | "tooltip">) {
  return (
    <div
      className={cn(
        "not-prose my-3 rounded-lg border border-border bg-card p-3 text-sm",
        selected && "ring-1 ring-foreground/40",
      )}
    >
      {loading ? (
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="ml-6 h-4 w-32" />
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="flex h-7 min-w-0 items-center gap-2">
            <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">
              {icon}
            </span>
            <p className="min-w-0 flex-1 truncate text-sm leading-none font-medium text-foreground">
              {title}
            </p>
            {canOpen ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 shrink-0 px-2 text-sm leading-none"
                data-md-live-interactive="true"
                onClick={onOpen}
              >
                {mdLiveCopy("open")}
              </Button>
            ) : null}
          </div>
          {subtitle || badge ? (
            <div className="flex min-w-0 items-center gap-1.5 pl-6 text-xs leading-none text-muted-foreground">
              {subtitle ? <span className="min-w-0 truncate">{subtitle}</span> : null}
              {badge ? <StateBadge label={badge} className={badgeClassName} /> : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function EmbedChip({
  selected,
  icon,
  title,
  tooltip,
  canOpen,
  onOpen,
}: Omit<MdLiveEmbedChromeProps, "layout" | "subtitle" | "badge" | "badgeClassName" | "loading">) {
  const inner = (duplicateIcon: boolean) => (
    <>
      <span className="inline-flex shrink-0 items-center">
        {duplicateIcon && isValidElement(icon) ? cloneElement(icon) : icon}
      </span>
      <span className="min-w-0 truncate">{title}</span>
    </>
  );
  return (
    <>
      <span className="md-live-embed-chip-sizer" aria-hidden="true">
        {inner(true)}
      </span>
      <button
        type="button"
        data-md-live-interactive="true"
        disabled={!canOpen}
        title={tooltip}
        onClick={canOpen ? onOpen : undefined}
        className={cn(
          "md-live-embed-chip inline-flex max-w-[16rem] items-center gap-1 rounded-md border border-border bg-muted/50 px-1.5 text-xs leading-none text-foreground hover:bg-muted",
          selected && "ring-1 ring-foreground/40",
          !canOpen && "cursor-default opacity-80",
        )}
      >
        {inner(false)}
      </button>
    </>
  );
}

export function MdLiveEmbedChrome(props: MdLiveEmbedChromeProps) {
  if (props.layout === "inline") {
    return (
      <EmbedChip
        selected={props.selected}
        icon={props.icon}
        title={props.title}
        tooltip={props.tooltip}
        canOpen={props.canOpen}
        onOpen={props.onOpen}
      />
    );
  }
  return (
    <EmbedCard
      selected={props.selected}
      icon={props.icon}
      title={props.title}
      subtitle={props.subtitle}
      badge={props.badge}
      badgeClassName={props.badgeClassName}
      loading={props.loading}
      canOpen={props.canOpen}
      onOpen={props.onOpen}
    />
  );
}
