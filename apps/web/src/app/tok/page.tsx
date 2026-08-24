"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { PushPageStack, usePushPageTransition } from "@workspace/ui";

import {
  PublicTokNotFound,
  PublicTokPage,
} from "@/features/token-usage/PublicTokPage";
import { PublicTokLeaderboards } from "@/features/token-usage/PublicTokLeaderboards";
import { TokenUsageLoadingScreen } from "@/features/token-usage/TokenUsageLoadingScreen";
import {
  fetchPublicLeaderboards,
  fetchPublicTok,
} from "@/features/token-usage/fetch-public-tok";
import type {
  PublicLeaderboardEntry,
  PublicLeaderboards,
  PublicTokData,
} from "@/features/token-usage/fetch-public-tok";

const LEADERBOARD_PATH = "/tok/leaderboard";

/** Survive accidental remounts; primary path uses history API so React stays mounted. */
let boardsCache: PublicLeaderboards | null | undefined;
const profileCache = new Map<string, PublicTokData | null>();

type TokRoute =
  | { kind: "leaderboard" }
  | { kind: "profile"; handle: string }
  | { kind: "home" };

function parseTokPath(pathname: string): TokRoute {
  const parts = pathname.split("/").filter(Boolean);
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

function profileHref(handle: string) {
  return `/tok/@${handle.replace(/^@+/, "")}`;
}

function cleanHandle(handle: string) {
  return handle.replace(/^@+/, "");
}

/**
 * Client path that tracks the browser URL without forcing a Next remount when
 * moving between /tok/leaderboard and /tok/@handle (different page modules).
 */
function useTokPath() {
  const nextPathname = usePathname();
  const [path, setPath] = React.useState(nextPathname);

  React.useEffect(() => {
    setPath(nextPathname);
  }, [nextPathname]);

  React.useEffect(() => {
    const onPopState = () => {
      setPath(window.location.pathname);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = React.useCallback((href: string, mode: "push" | "replace" = "push") => {
    const url = new URL(href, window.location.origin);
    if (mode === "replace") {
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    } else {
      window.history.pushState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    setPath(url.pathname);
  }, []);

  return { pathname: path, navigate };
}

/** Lightweight shell while profile snapshot is still loading. */
function ProfilePendingShell({
  handle,
  avatarUrl,
  onBack,
}: {
  handle: string;
  avatarUrl: string | null;
  onBack: () => void;
}) {
  const t = useTranslations("appShell.tokenUsageDialog.publicPage");
  const letter = (handle[0] ?? "?").toUpperCase();
  const [avatarFailed, setAvatarFailed] = React.useState(false);
  const showAvatar = Boolean(avatarUrl) && !avatarFailed;

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col px-4 pt-5 sm:px-5">
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {showAvatar ? (
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
            )}
            <span className="truncate text-sm font-medium">@{handle}</span>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {t("leaderboardLink")}
          </button>
        </header>
      </div>
      <TokenUsageLoadingScreen />
    </div>
  );
}

export default function TokPage() {
  const { pathname, navigate } = useTokPath();
  const route = React.useMemo(() => parseTokPath(pathname), [pathname]);
  const {
    phase,
    isPresented,
    open: openPush,
    close: closePush,
  } = usePushPageTransition();
  const phaseRef = React.useRef(phase);
  phaseRef.current = phase;

  const [boards, setBoards] = React.useState<
    PublicLeaderboards | null | undefined
  >(() => boardsCache);
  const [profile, setProfile] = React.useState<PublicTokData | null | undefined>(
    () => {
      if (route.kind !== "profile") return null;
      return profileCache.has(route.handle)
        ? profileCache.get(route.handle)
        : undefined;
    },
  );
  const [profileHandle, setProfileHandle] = React.useState<string | null>(() =>
    route.kind === "profile" ? route.handle : null,
  );
  const [pendingAvatar, setPendingAvatar] = React.useState<string | null>(null);
  const profileHandleRef = React.useRef(profileHandle);
  profileHandleRef.current = profileHandle;
  const fetchGenRef = React.useRef(0);
  /** Skip re-open when we already drove open from a row click (avoids double animation). */
  const skipRouteOpenRef = React.useRef(false);

  React.useEffect(() => {
    if (boardsCache !== undefined) {
      setBoards(boardsCache);
      return;
    }
    let cancelled = false;
    void (async () => {
      const next = await fetchPublicLeaderboards();
      boardsCache = next;
      if (!cancelled) setBoards(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (route.kind === "home") {
      navigate(LEADERBOARD_PATH, "replace");
    }
  }, [navigate, route.kind]);

  const loadProfile = React.useCallback(async (handle: string) => {
    const clean = cleanHandle(handle);
    const gen = ++fetchGenRef.current;
    const cached = profileCache.get(clean);
    if (cached !== undefined) {
      setProfile(cached);
    } else {
      setProfile((prev) => (prev?.handle === clean ? prev : undefined));
    }

    const page = await fetchPublicTok(clean, secretFromLocation());
    if (gen !== fetchGenRef.current) return;
    profileCache.set(clean, page);
    if (profileHandleRef.current === clean) {
      setProfile(page);
    }
  }, []);

  // Sync push phase with path (deep links + browser back/forward).
  React.useEffect(() => {
    if (route.kind !== "profile") {
      skipRouteOpenRef.current = false;
      if (phaseRef.current === "open") {
        closePush({
          onComplete: () => {
            setProfileHandle(null);
            setPendingAvatar(null);
            setProfile(null);
          },
        });
      }
      return;
    }

    const handle = route.handle;
    setProfileHandle(handle);

    if (skipRouteOpenRef.current && profileHandleRef.current === handle) {
      // openProfile already opened the stack for this handle — only ensure data.
      skipRouteOpenRef.current = false;
      void loadProfile(handle);
      return;
    }

    // Deep link / popstate / external navigation into a profile.
    if (phaseRef.current !== "open") {
      openPush();
    }
    void loadProfile(handle);
  }, [closePush, loadProfile, openPush, route]);

  const openProfile = React.useCallback(
    (handle: string, entry?: PublicLeaderboardEntry) => {
      const clean = cleanHandle(handle);
      const cached = profileCache.get(clean);
      setProfileHandle(clean);
      setPendingAvatar(entry?.avatar_url ?? null);
      setProfile(cached !== undefined ? cached : undefined);
      // Mark so the route effect does not call openPush a second time.
      skipRouteOpenRef.current = true;
      openPush();
      // history only — keeps this React tree mounted (no Next page remount jolt).
      navigate(profileHref(clean));
      void loadProfile(clean);
    },
    [loadProfile, navigate, openPush],
  );

  const handleBackToLeaderboard = React.useCallback(() => {
    closePush({
      onComplete: () => {
        setProfileHandle(null);
        setPendingAvatar(null);
        setProfile(null);
        navigate(LEADERBOARD_PATH);
      },
    });
  }, [closePush, navigate]);

  const leaderboardBase =
    boards === undefined ? (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <TokenUsageLoadingScreen />
      </div>
    ) : boards ? (
      <div className="h-full overflow-y-auto pt-8">
        <PublicTokLeaderboards data={boards} onOpenProfile={openProfile} />
      </div>
    ) : (
      <PublicTokNotFound />
    );

  const profileOverlay =
    isPresented && profileHandle ? (
      profile ? (
        <PublicTokPage
          handle={profile.handle}
          avatarUrl={profile.avatar_url}
          githubUsername={profile.github_username}
          xUsername={profile.x_username}
          generatedAt={profile.generated_at}
          payload={profile.snapshot}
          onBack={handleBackToLeaderboard}
        />
      ) : profile === null ? (
        <div className="flex h-full flex-col bg-background">
          <PublicTokNotFound />
          <button
            type="button"
            onClick={handleBackToLeaderboard}
            className="mx-auto mb-8 text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            Back to leaderboard
          </button>
        </div>
      ) : (
        <ProfilePendingShell
          handle={profileHandle}
          avatarUrl={pendingAvatar}
          onBack={handleBackToLeaderboard}
        />
      )
    ) : null;

  if (route.kind === "home") {
    return (
      <div className="h-dvh overflow-y-auto bg-background" aria-busy="true" />
    );
  }

  return (
    <PushPageStack
      phase={phase}
      className="h-dvh"
      axis="horizontal"
      shiftBase
      base={leaderboardBase}
      overlay={profileOverlay}
      // Stable key while a profile is open — avoid remounting mid-slide when data arrives.
      overlayKey="tok-profile"
    />
  );
}
