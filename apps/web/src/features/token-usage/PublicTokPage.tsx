"use client";

import * as React from "react";
import { GitHubIcon } from "@daveyplate/better-auth-ui";
import { Trophy } from "lucide-react";
import { XIcon } from "@workspace/ui";
import { useLocale, useTranslations } from "next-intl";

import { GithubUserHoverCard } from "@/features/github/components/GithubUserHoverCard";
import { TokenUsageOverviewView } from "@/features/token-usage/TokenUsageOverviewView";
import type { TokenUsageSharePayload } from "@/features/token-usage/token-usage-share-payload";

export type PublicTokPageProps = {
  handle: string;
  avatarUrl: string | null;
  githubUsername: string | null;
  xUsername: string | null;
  generatedAt: number;
  payload: TokenUsageSharePayload;
  /** When set, leaderboard link uses push-back instead of a hard navigation. */
  onBack?: () => void;
};

function formatGeneratedDate(ts: number, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString().slice(0, 10);
  }
}

export function PublicTokPage({
  handle,
  avatarUrl,
  githubUsername,
  xUsername,
  generatedAt,
  payload,
  onBack,
}: PublicTokPageProps) {
  const t = useTranslations("appShell.tokenUsageDialog.publicPage");
  const locale = useLocale();
  const date = formatGeneratedDate(generatedAt, locale);
  const letter = (handle[0] ?? "?").toUpperCase();
  const [avatarFailed, setAvatarFailed] = React.useState(false);
  const showAvatar = Boolean(avatarUrl) && !avatarFailed;
  const avatar = showAvatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl ?? ""}
      alt=""
      referrerPolicy="no-referrer"
      className="size-8 shrink-0 rounded-full object-cover"
      onError={() => setAvatarFailed(true)}
    />
  ) : (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
    >
      {letter}
    </span>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-auto bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col px-4 pt-5 sm:px-5">
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {avatar}
            <span className="truncate text-sm font-medium">@{handle}</span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {xUsername ? (
              <a
                href={`https://x.com/${xUsername}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-3.5" />
                <span>@{xUsername}</span>
              </a>
            ) : null}
            {githubUsername ? (
              <GithubUserHoverCard
                username={githubUsername}
                avatarUrl={avatarUrl}
                source="public"
              >
                <a
                  href={`https://github.com/${githubUsername}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <GitHubIcon className="size-3.5 shrink-0" />
                  <span>@{githubUsername}</span>
                </a>
              </GithubUserHoverCard>
            ) : null}
          </div>
        </header>
      </div>

      <TokenUsageOverviewView payload={payload} hideCostToggle={!payload.summary.total_cost_usd} />

      <footer className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-3 px-4 pb-8 sm:px-5">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Trophy className="size-3 shrink-0" aria-hidden />
            {t("leaderboardLink")}
          </button>
        ) : (
          <a
            href="/tok/leaderboard"
            className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Trophy className="size-3 shrink-0" aria-hidden />
            {t("leaderboardLink")}
          </a>
        )}
        <p className="text-right text-[11px] text-muted-foreground">
          {t("generatedDate", { date })} · {t("generatedByPrefix")}
          <a
            href="https://atmos.land"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline-offset-2 hover:underline"
          >
            Atmos
          </a>
          {t("generatedBySuffix")}
        </p>
      </footer>
    </div>
  );
}

export function PublicTokNotFound() {
  const t = useTranslations("appShell.tokenUsageDialog.publicPage");
  return (
    <div className="flex h-dvh items-center justify-center overflow-y-auto bg-background px-6 text-center text-sm text-muted-foreground">
      {t("notFound")}
    </div>
  );
}
