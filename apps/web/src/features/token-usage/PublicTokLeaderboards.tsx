"use client";

import * as React from "react";
import { GitHubIcon } from "@daveyplate/better-auth-ui";
import { Coins, Crown, DollarSign, Trophy, User } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  SlidingMetric,
  XIcon,
  compactSlidingParts,
  currencySlidingParts,
} from "@workspace/ui";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/motion/tabs";
import LogoSvg from "@workspace/ui/components/logo-svg";
import { ATMOS_SLOGAN } from "@/app-shell/token-usage-share-card";

import type {
  PublicLeaderboardEntry,
  PublicLeaderboards,
} from "@/features/token-usage/fetch-public-tok";

type BoardTab = "tokens" | "cost";

function isBoardTab(value: string): value is BoardTab {
  return value === "tokens" || value === "cost";
}

function letterOf(handle: string) {
  return (handle[0] ?? "?").toUpperCase();
}

function Avatar({
  handle,
  url,
}: {
  handle: string;
  url: string | null;
}) {
  const [failed, setFailed] = React.useState(false);
  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        className="size-6 shrink-0 rounded-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium"
    >
      {letterOf(handle)}
    </span>
  );
}

const CROWN_TONE: Record<
  1 | 2 | 3,
  { fill: string; stroke: string; label: string }
> = {
  1: { fill: "#E8B923", stroke: "#C49212", label: "1" },
  2: { fill: "#C5CDD4", stroke: "#8E99A3", label: "2" },
  3: { fill: "#C47B3A", stroke: "#9A5724", label: "3" },
};

function RankMark({ rank }: { rank: number }) {
  if (rank === 1 || rank === 2 || rank === 3) {
    const tone = CROWN_TONE[rank];
    return (
      <span
        className="flex size-6 items-center justify-center"
        aria-label={tone.label}
        title={tone.label}
      >
        <Crown
          className="size-4"
          fill={tone.fill}
          stroke={tone.stroke}
          strokeWidth={1.75}
          aria-hidden
        />
      </span>
    );
  }
  return (
    <span className="flex size-6 items-center justify-center text-[11px] tabular-nums text-muted-foreground">
      {rank}
    </span>
  );
}

function useEnterValue(target: number) {
  const [value, setValue] = React.useState(0);
  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => setValue(target));
    return () => window.cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

function SocialCell({
  username,
  href,
}: {
  username: string | null | undefined;
  href: (username: string) => string;
}) {
  if (!username) {
    return <span className="text-muted-foreground">-</span>;
  }
  return (
    <a
      href={href(username)}
      target="_blank"
      rel="noreferrer"
      className="relative z-20 max-w-full truncate text-muted-foreground hover:text-foreground"
    >
      @{username}
    </a>
  );
}

function ColHead({
  align = "left",
  children,
}: {
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <span
      className={
        align === "right"
          ? "inline-flex w-full items-center justify-end gap-1"
          : "inline-flex w-full items-center justify-start gap-1"
      }
    >
      {children}
    </span>
  );
}

function BoardTable({
  empty,
  board,
  metric,
}: {
  empty: string;
  board: PublicLeaderboards["tokens"];
  metric: BoardTab;
}) {
  const t = useTranslations("appShell.tokenUsageDialog.leaderboard");
  const valueTitle = metric === "cost" ? t("costTitle") : t("tokensTitle");
  const ValueIcon = metric === "cost" ? DollarSign : Coins;

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-background/60 px-2 py-3">
      {board.entries.length === 0 ? (
        <p className="px-2 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <table className="w-full min-w-[42rem] table-fixed border-collapse">
          <thead>
            <tr className="text-[11px] text-muted-foreground">
              <th
                scope="col"
                className="w-16 pb-2 pl-2 text-left font-medium"
              >
                <ColHead>
                  <Trophy className="size-3 shrink-0" aria-hidden />
                  {t("colRank")}
                </ColHead>
              </th>
              <th scope="col" className="pb-2 pl-1 text-left font-medium">
                <ColHead>
                  <User className="size-3 shrink-0" aria-hidden />
                  {t("colUser")}
                </ColHead>
              </th>
              <th
                scope="col"
                className="w-[7.5rem] pb-2 pl-2 text-left font-medium"
              >
                <ColHead>
                  <XIcon
                    className="size-3"
                    size={12}
                    aria-label={t("colX")}
                  />
                </ColHead>
              </th>
              <th
                scope="col"
                className="w-[8.5rem] pb-2 pl-2 text-left font-medium"
              >
                <ColHead>
                  <GitHubIcon className="size-3 shrink-0" />
                  {t("colGithub")}
                </ColHead>
              </th>
              <th
                scope="col"
                className="w-28 pb-2 pr-2 text-right font-medium"
              >
                <ColHead align="right">
                  <ValueIcon className="size-3 shrink-0" aria-hidden />
                  {valueTitle}
                </ColHead>
              </th>
            </tr>
          </thead>
          <tbody>
            {board.entries.map((row) => (
              <LeaderRow key={row.handle} row={row} metric={metric} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function LeaderRow({
  row,
  metric,
}: {
  row: PublicLeaderboardEntry;
  metric: BoardTab;
}) {
  const locale = useLocale();
  const value = useEnterValue(row.value);
  const parts =
    metric === "cost"
      ? currencySlidingParts(value, locale, "compact")
      : compactSlidingParts(value, locale);

  return (
    <tr className="group relative text-sm">
      <td className="rounded-l-lg py-1.5 pl-2 group-hover:bg-muted/60">
        <a
          href={`/tok/@${row.handle}`}
          className="absolute inset-0 z-10"
          aria-label={`@${row.handle}`}
        />
        <span className="flex justify-start">
          <RankMark rank={row.rank} />
        </span>
      </td>
      <td className="py-1.5 pl-1 group-hover:bg-muted/60">
        <span className="flex min-w-0 items-center gap-2">
          <Avatar handle={row.handle} url={row.avatar_url} />
          <span className="min-w-0 truncate">@{row.handle}</span>
        </span>
      </td>
      <td className="py-1.5 pl-2 text-left text-xs group-hover:bg-muted/60">
        <SocialCell
          username={row.x_username}
          href={(username) => `https://x.com/${username}`}
        />
      </td>
      <td className="py-1.5 pl-2 text-left text-xs group-hover:bg-muted/60">
        <SocialCell
          username={row.github_username}
          href={(username) => `https://github.com/${username}`}
        />
      </td>
      <td className="rounded-r-lg py-1.5 pr-2 text-right group-hover:bg-muted/60">
        <SlidingMetric
          {...parts}
          className="shrink-0 text-xs text-muted-foreground"
        />
      </td>
    </tr>
  );
}

export function PublicTokLeaderboards({
  data,
}: {
  data: PublicLeaderboards;
}) {
  const t = useTranslations("appShell.tokenUsageDialog.leaderboard");
  const locale = useLocale();
  const [tab, setTab] = React.useState<BoardTab>("tokens");
  const updated =
    data.updated_at != null
      ? new Intl.DateTimeFormat(locale, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(data.updated_at))
      : null;

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-4 pb-10 sm:px-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <a
          href="https://atmos.land"
          className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-foreground"
        >
          <LogoSvg className="size-9 shrink-0" />
          <span className="text-3xl font-medium tracking-tight">Atmos</span>
          <span className="text-muted-foreground/70" aria-hidden>
            –
          </span>
          <span className="text-sm text-muted-foreground sm:text-base">
            {ATMOS_SLOGAN}
          </span>
        </a>
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Tabs
          value={tab}
          onValueChange={(value) => {
            if (isBoardTab(value)) setTab(value);
          }}
          variant="pill"
          className="flex flex-col gap-4"
        >
          <TabsList className="h-8 w-fit gap-0.5 p-0.5">
            <TabsTrigger value="tokens" className="h-7 gap-1.5 px-3 text-xs">
              <Coins className="size-3.5 shrink-0" aria-hidden />
              {t("tokensTitle")}
            </TabsTrigger>
            <TabsTrigger value="cost" className="h-7 gap-1.5 px-3 text-xs">
              <DollarSign className="size-3.5 shrink-0" aria-hidden />
              {t("costTitle")}
            </TabsTrigger>
          </TabsList>
          <BoardTable
            key={tab}
            empty={tab === "cost" ? t("costEmpty") : t("tokensEmpty")}
            board={tab === "cost" ? data.cost : data.tokens}
            metric={tab}
          />
        </Tabs>
        {updated ? (
          <p className="text-right text-[11px] text-muted-foreground">
            {t("updated", { time: updated })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
