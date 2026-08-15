"use client";

import * as React from "react";
import {
  PublicTokNotFound,
  PublicTokPage,
} from "@/features/token-usage/PublicTokPage";
import { PublicTokLeaderboards } from "@/features/token-usage/PublicTokLeaderboards";
import {
  fetchPublicLeaderboards,
  fetchPublicTok,
} from "@/features/token-usage/fetch-public-tok";
import type { PublicLeaderboards } from "@/features/token-usage/fetch-public-tok";
import type { PublicTokData } from "@/features/token-usage/fetch-public-tok";

const LEADERBOARD_PATH = "/tok/leaderboard";

type TokRoute =
  | { kind: "leaderboard" }
  | { kind: "profile"; handle: string }
  | { kind: "home" };

function tokRoute(): TokRoute {
  if (typeof window === "undefined") return { kind: "home" };
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] !== "tok") return { kind: "home" };
  const slug = parts[1] ? decodeURIComponent(parts[1]) : "";
  if (!slug) return { kind: "home" };
  if (slug === "leaderboard") return { kind: "leaderboard" };
  const handle = slug.replace(/^@+/, "");
  if (!handle) return { kind: "home" };
  return { kind: "profile", handle };
}

function secretFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("k");
}

export default function TokPage() {
  const [route] = React.useState<TokRoute>(() => tokRoute());
  const [profile, setProfile] = React.useState<PublicTokData | null | undefined>(
    route.kind === "home" ? null : undefined,
  );
  const [boards, setBoards] = React.useState<PublicLeaderboards | null>(null);

  React.useEffect(() => {
    if (route.kind === "home") {
      window.location.replace(LEADERBOARD_PATH);
      return;
    }

    let cancelled = false;
    const k = secretFromLocation();

    void (async () => {
      if (route.kind === "leaderboard") {
        const next = await fetchPublicLeaderboards();
        if (!cancelled) {
          setBoards(next);
          setProfile(null);
        }
        return;
      }

      const [page, nextBoards] = await Promise.all([
        fetchPublicTok(route.handle, k),
        fetchPublicLeaderboards(),
      ]);
      if (cancelled) return;
      setProfile(page);
      setBoards(nextBoards);
    })();

    return () => {
      cancelled = true;
    };
  }, [route]);

  if (route.kind === "home") {
    return (
      <div className="h-dvh overflow-y-auto bg-background" aria-busy="true" />
    );
  }

  if (profile === undefined) {
    return (
      <div className="h-dvh overflow-y-auto bg-background" aria-busy="true" />
    );
  }

  if (route.kind === "leaderboard") {
    return (
      <div className="relative flex h-dvh min-h-0 flex-col overflow-y-auto bg-background text-foreground">
        {boards ? (
          <div className="pt-8">
            <PublicTokLeaderboards data={boards} />
          </div>
        ) : (
          <PublicTokNotFound />
        )}
      </div>
    );
  }

  if (!profile) return <PublicTokNotFound />;
  return (
    <PublicTokPage
      handle={profile.handle}
      avatarUrl={profile.avatar_url}
      githubUsername={profile.github_username}
      xUsername={profile.x_username}
      generatedAt={profile.generated_at}
      payload={profile.snapshot}
      leaderboards={boards}
    />
  );
}
