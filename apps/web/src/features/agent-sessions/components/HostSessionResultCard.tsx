"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import { formatLocalDateTime, formatRelativeTime, parseUTCDate } from "@atmos/shared";
import { Archive, Folder, MessageSquare } from "lucide-react";
import type {
  HostSessionListItem,
  HostSessionSearchHit,
} from "@atmos/api-types/ws/dto/host-session";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import {
  formatHostSessionBytes,
  hasAtmosChatTag,
  hostSessionHighlightParts,
  hostSessionProjectLabel,
} from "@/features/agent-sessions/lib/host-session-filters";
import {
  hostSessionAgentIconId,
  hostSessionAgentLabel,
} from "@/features/agent-sessions/lib/host-session-groups";

export function HostSessionHighlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {hostSessionHighlightParts(text, query).map((part, index) =>
        part.match ? (
          <mark
            key={`${part.text}-${index}`}
            className="rounded-sm bg-info/35 px-0.5 text-foreground"
          >
            {part.text}
          </mark>
        ) : (
          <React.Fragment key={`${part.text}-${index}`}>{part.text}</React.Fragment>
        ),
      )}
    </>
  );
}

export function hostSessionResultClass(selected: boolean) {
  return cn(
    "group flex h-[84px] w-full items-center justify-between rounded-lg border px-4 text-left hover:border-primary/30 hover:bg-muted/50 hover:shadow-sm",
    selected
      ? "border-primary/40 bg-muted/50 shadow-sm"
      : "border-border bg-background",
  );
}

export function HostSessionResultBody({
  session,
  hit,
  query,
  archived = false,
}: {
  session: HostSessionListItem;
  hit?: HostSessionSearchHit | null;
  query: string;
  archived?: boolean;
}) {
  const t = useTranslations("agentSessions");
  const locale = useLocale();
  const projectLabel = hostSessionProjectLabel(session);
  const agentLabel = hostSessionAgentLabel(session.provider_id);
  const title = session.title.trim() || session.native_id;
  const searching = query.trim().length > 0;

  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/50 bg-muted/30 transition-colors duration-150 group-hover:border-primary/20 group-hover:bg-primary/5">
          <AgentIcon
            registryId={hostSessionAgentIconId(session.provider_id)}
            name={agentLabel}
            size={22}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground transition-colors duration-150 group-hover:text-primary">
              {searching ? <HostSessionHighlight text={title} query={query} /> : title}
            </span>
            {hasAtmosChatTag(session) ? (
              <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {t("atmosChatTag")}
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
            {searching && hit?.snippet ? (
              <span className="block min-w-0 truncate">
                <HostSessionHighlight text={hit.snippet} query={query} />
              </span>
            ) : (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex min-w-0 items-center gap-1">
                      <Folder className="size-3 shrink-0" />
                      <span className="block max-w-[220px] truncate">
                        {projectLabel || t("unknownProject")}
                      </span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs break-all">
                    {session.cwd || t("unknownProject")}
                  </TooltipContent>
                </Tooltip>
                {session.message_count != null ? (
                  <>
                    <span className="text-border">·</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <MessageSquare className="size-3 shrink-0" />
                      <span className="whitespace-nowrap">
                        {t("messageCount", { count: session.message_count })}
                      </span>
                    </span>
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
      <div className="ml-4 flex shrink-0 items-center gap-3">
        <div className="text-right">
          <div className="text-[11px] font-medium tabular-nums text-muted-foreground">
            {formatHostSessionBytes(session.byte_size) ?? "–"}
          </div>
          <div className="mt-0.5 whitespace-nowrap text-[10px] tabular-nums text-muted-foreground/55">
            {session.updated_at && !Number.isNaN(parseUTCDate(session.updated_at).getTime())
              ? `${formatLocalDateTime(session.updated_at, "yyyy/MM/dd HH:mm")} · ${formatRelativeTime(session.updated_at, locale)}`
              : ""}
          </div>
        </div>
        {archived ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="inline-flex text-muted-foreground"
                data-testid="host-session-archived-icon"
              >
                <Archive className="size-3.5" aria-hidden />
              </span>
            </TooltipTrigger>
            <TooltipContent>{t("archived")}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </>
  );
}

export function HostSessionResultCard({
  session,
  hit,
  query,
  selected,
  archived = false,
  onSelect,
}: {
  session: HostSessionListItem;
  hit?: HostSessionSearchHit | null;
  query: string;
  selected: boolean;
  archived?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={hostSessionResultClass(selected)}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
    >
      <HostSessionResultBody session={session} hit={hit} query={query} archived={archived} />
    </button>
  );
}
