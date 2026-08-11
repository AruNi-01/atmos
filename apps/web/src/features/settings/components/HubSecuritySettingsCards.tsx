"use client";

/**
 * Linked accounts + Active sessions, aligned with better-auth-ui Security settings:
 * https://better-auth-ui.com/docs/shadcn/components/settings/security/security-settings
 *
 * Renders the same two cards as SecuritySettingsCards (Providers + Sessions) without
 * the upstream ProvidersCard double-list of linked providers. Link uses Hub
 * `/v1/oauth/start?mode=link` (first-party state cookie).
 */
import React from "react";
import { GitHubIcon, GoogleIcon } from "@daveyplate/better-auth-ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import { Laptop, Loader2, Smartphone } from "lucide-react";
import {
  hubGetSession,
  hubListAccounts,
  hubListSessions,
  hubRevokeSession,
  hubSignOut,
  hubUnlinkAccount,
  type HubAuthSessionRow,
  type HubLinkedAccount,
  type HubSocialProvider,
} from "@/api/hub-auth-client";
import { clearStoredDeviceCredential } from "@/api/hub-client";
import {
  isHubSocialProvider,
  openHubOAuth,
} from "@/features/settings/components/hub-oauth-open";

const PROVIDERS: Array<{
  id: HubSocialProvider;
  name: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "github", name: "GitHub", Icon: GitHubIcon },
  { id: "google", name: "Google", Icon: GoogleIcon },
];

function parseUserAgent(ua: string | null | undefined): {
  isMobile: boolean;
  label: string | null;
} {
  if (!ua) return { isMobile: false, label: null };
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  let os: string | null = null;
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iOS/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser: string | null = null;
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";

  if (os && browser) return { isMobile, label: `${os}, ${browser}` };
  if (os) return { isMobile, label: os };
  if (browser) return { isMobile, label: browser };
  return { isMobile, label: null };
}

function SettingsSection({
  title,
  description,
  children,
  isPending,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  isPending?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-none">
      <div className="space-y-1 border-b border-border px-6 py-4">
        <p className="text-base font-semibold leading-none">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-3 px-6 py-4">
        {isPending ? (
          <>
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function LinkedAccountsCard() {
  const t = useTranslations("settings.accountSection");
  const qc = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: ["hub", "list-accounts"],
    queryFn: async (): Promise<HubLinkedAccount[]> => hubListAccounts(),
    staleTime: 10_000,
    retry: false,
  });

  const [busyProvider, setBusyProvider] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const linkedByProvider = React.useMemo(() => {
    const map = new Map<string, HubLinkedAccount>();
    for (const a of accountsQuery.data ?? []) {
      // Normalize provider id (some responses use provider vs providerId).
      const raw =
        a.providerId ||
        (a as { provider?: string }).provider ||
        "";
      const id = String(raw).toLowerCase();
      if (isHubSocialProvider(id)) {
        map.set(id, { ...a, providerId: id });
      }
    }
    return map;
  }, [accountsQuery.data]);

  /** Per-provider label — never reuse Atmos primary email for every provider. */
  const linkedSubtitle = (account: HubLinkedAccount): string => {
    const email = account.email?.trim();
    if (email) return email;
    return t("linked");
  };

  const link = async (provider: HubSocialProvider) => {
    // Already linked → never start another link for the same provider
    // (Better Auth: one identity per provider per user).
    if (linkedByProvider.has(provider)) {
      setError(t("errors.alreadyLinked"));
      return;
    }
    setBusyProvider(provider);
    setError(null);
    try {
      // Always new tab / system browser (same as sign-in).
      const result = await openHubOAuth({ provider, mode: "link" });
      if (!result.ok) {
        setError(result.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.linkFailed"));
    } finally {
      setBusyProvider(null);
    }
  };

  const unlink = async (account: HubLinkedAccount) => {
    setBusyProvider(account.providerId);
    setError(null);
    try {
      await hubUnlinkAccount({
        providerId: account.providerId,
        accountId: account.accountId,
      });
      await qc.invalidateQueries({ queryKey: ["hub", "list-accounts"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.unlinkFailed"));
    } finally {
      setBusyProvider(null);
    }
  };

  // After link OAuth completes, done page broadcasts hub-auth-done.
  React.useEffect(() => {
    const onDone = () => {
      void qc.invalidateQueries({ queryKey: ["hub", "list-accounts"] });
    };
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("atmos-hub-auth");
      bc.onmessage = (ev) => {
        if (ev.data?.type === "hub-auth-done") onDone();
      };
    } catch {
      /* ignore */
    }
    return () => bc?.close();
  }, [qc]);

  return (
    <SettingsSection
      title={t("linkedAccounts")}
      description={t("linkedAccountsDescription")}
      isPending={accountsQuery.isLoading}
    >
      <TooltipProvider delayDuration={200}>
        {PROVIDERS.map(({ id, name, Icon }) => {
          const account = linkedByProvider.get(id) ?? null;
          const busy = busyProvider === id;
          // One Atmos user ↔ many providers, but only one account per provider.
          // Never offer Link when this provider is already connected.
          const isLinked = Boolean(account);
          const onlyOneLinked = linkedByProvider.size <= 1;
          const unlinkBlocked = isLinked && onlyOneLinked;

          const unlinkButton = (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="relative shrink-0"
              disabled={busy || unlinkBlocked}
              onClick={() => {
                if (account && !unlinkBlocked) void unlink(account);
              }}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {t("unlink")}
            </Button>
          );

          return (
            <Card
              key={id}
              className="flex min-w-0 flex-row items-center gap-3 border-border bg-background px-4 py-3 shadow-none"
            >
              <Icon className="size-4 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="text-sm font-medium">{name}</div>
                <span className="truncate text-xs text-muted-foreground">
                  {isLinked && account
                    ? linkedSubtitle(account)
                    : t("notLinked")}
                </span>
              </div>
              {isLinked ? (
                unlinkBlocked ? (
                  // Native title on disabled buttons does not show in most browsers.
                  // Wrap so Tooltip can receive pointer events.
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="ms-auto inline-flex cursor-not-allowed">
                        {unlinkButton}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      {t("errors.cannotUnlinkLast")}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <div className="ms-auto">{unlinkButton}</div>
                )
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className="relative ms-auto shrink-0"
                  disabled={busy || accountsQuery.isError}
                  title={t("linkOpensNewTab")}
                  onClick={() => void link(id)}
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {t("link")}
                </Button>
              )}
            </Card>
          );
        })}
      </TooltipProvider>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {accountsQuery.isError ? (
        <p className="text-xs text-destructive">
          {accountsQuery.error instanceof Error
            ? accountsQuery.error.message
            : t("errors.listAccountsFailed")}
        </p>
      ) : null}
    </SettingsSection>
  );
}

function ActiveSessionsCard() {
  const t = useTranslations("settings.accountSection");
  const qc = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ["hub", "session"],
    queryFn: async () => hubGetSession(),
    staleTime: 15_000,
    retry: false,
  });

  // /v1/me/sessions works with cookie or device Bearer — always load when signed in.
  const sessionsQuery = useQuery({
    queryKey: ["hub", "list-sessions"],
    queryFn: async (): Promise<HubAuthSessionRow[]> => hubListSessions(),
    staleTime: 10_000,
    retry: false,
  });

  const [busyToken, setBusyToken] = React.useState<string | null>(null);
  const [signOutConfirmToken, setSignOutConfirmToken] = React.useState<
    string | null
  >(null);
  const [error, setError] = React.useState<string | null>(null);

  const currentId = sessionQuery.data?.session?.id;

  const revoke = async (session: HubAuthSessionRow) => {
    setBusyToken(session.token);
    setError(null);
    try {
      if (session.id === currentId) {
        // Full sign-out: delete session + expire Hub cookies.
        await hubSignOut();
        try {
          clearStoredDeviceCredential();
        } catch {
          /* ignore */
        }
        await qc.invalidateQueries({ queryKey: ["hub"] });
        setSignOutConfirmToken(null);
        return;
      }
      await hubRevokeSession(session.token);
      await qc.invalidateQueries({ queryKey: ["hub", "list-sessions"] });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : session.id === currentId
            ? t("errors.signOutFailed")
            : t("errors.revokeFailed"),
      );
    } finally {
      setBusyToken(null);
    }
  };

  const sessions = React.useMemo(() => {
    const list = [...(sessionsQuery.data ?? [])];
    list.sort((a, b) => {
      if (a.id === currentId) return -1;
      if (b.id === currentId) return 1;
      return 0;
    });
    return list;
  }, [sessionsQuery.data, currentId]);

  return (
    <SettingsSection
      title={t("activeSessions")}
      description={t("activeSessionsDescription")}
      isPending={sessionQuery.isLoading || sessionsQuery.isLoading}
    >
      {sessions.length === 0 && !sessionsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("sessionsEmpty")}</p>
      ) : null}
      {sessions.map((session) => {
        const isCurrent = session.id === currentId;
        const busy = busyToken === session.token;
        const { isMobile, label } = parseUserAgent(session.userAgent);
        const deviceLabel = label || session.userAgent || t("sessionUnknown");

        return (
          <Card
            key={session.id}
            className="flex flex-row items-center gap-3 border-border bg-background px-4 py-3 shadow-none"
          >
            {isMobile ? (
              <Smartphone className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <Laptop className="size-4 shrink-0 text-muted-foreground" />
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold">
                {isCurrent
                  ? t("currentSession")
                  : session.ipAddress?.trim() || t("otherSession")}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {deviceLabel}
              </span>
            </div>
            {isCurrent ? (
              <Popover
                open={signOutConfirmToken === session.token}
                onOpenChange={(open) =>
                  setSignOutConfirmToken(open ? session.token : null)
                }
              >
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={cn("relative ms-auto shrink-0")}
                    disabled={busy}
                  >
                    {busy ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : null}
                    {t("signOut")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="z-[70] w-72 space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {t("signOutConfirmTitle")}
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {t("signOutConfirmDescription")}
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => setSignOutConfirmToken(null)}
                    >
                      {t("signOutCancel")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => void revoke(session)}
                    >
                      {busy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : null}
                      {t("signOut")}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={cn("relative ms-auto shrink-0")}
                disabled={busy}
                onClick={() => void revoke(session)}
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {t("revoke")}
              </Button>
            )}
          </Card>
        );
      })}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {sessionsQuery.isError ? (
        <p className="text-xs text-destructive">
          {sessionsQuery.error instanceof Error
            ? sessionsQuery.error.message
            : t("errors.listSessionsFailed")}
        </p>
      ) : null}
    </SettingsSection>
  );
}

/** Security block: Linked accounts + Active sessions (better-auth-ui security settings). */
export function HubSecuritySettingsCards() {
  return (
    <div className="flex w-full flex-col gap-4 md:gap-6">
      <LinkedAccountsCard />
      <ActiveSessionsCard />
    </div>
  );
}
