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
  HUB_AUTH_DONE_CHANNEL,
  HUB_AUTH_DONE_MESSAGE,
} from "@/app/hub-auth/hub-auth-channel";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
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
import {
  SettingsGroupCard,
  SettingsGroupRow,
  SettingsPageStack,
} from "@/features/settings/components/settings/SettingsGroupCard";

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
      bc = new BroadcastChannel(HUB_AUTH_DONE_CHANNEL);
      bc.onmessage = (ev) => {
        if (ev.data?.type === HUB_AUTH_DONE_MESSAGE) onDone();
      };
    } catch {
      /* ignore */
    }
    return () => bc?.close();
  }, [qc]);

  return (
    <SettingsGroupCard
      title={t("linkedAccounts")}
      description={t("linkedAccountsDescription")}
    >
      {accountsQuery.isLoading ? (
        <div className="space-y-3 py-3">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : (
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
            <SettingsGroupRow
              key={id}
              wide
              title={
                <span className="inline-flex items-center gap-2">
                  <Icon className="size-4 shrink-0" />
                  {name}
                </span>
              }
              description={
                isLinked && account
                  ? linkedSubtitle(account)
                  : t("notLinked")
              }
            >
              {isLinked ? (
                unlinkBlocked ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex cursor-not-allowed">
                        {unlinkButton}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      {t("errors.cannotUnlinkLast")}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  unlinkButton
                )
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className="relative shrink-0"
                  disabled={busy || accountsQuery.isError}
                  title={t("linkOpensNewTab")}
                  onClick={() => void link(id)}
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {t("link")}
                </Button>
              )}
            </SettingsGroupRow>
          );
        })}
      </TooltipProvider>
      )}
      {error ? <p className="px-2 py-3 text-xs text-destructive">{error}</p> : null}
      {accountsQuery.isError ? (
        <p className="px-2 py-3 text-xs text-destructive">
          {accountsQuery.error instanceof Error
            ? accountsQuery.error.message
            : t("errors.listAccountsFailed")}
        </p>
      ) : null}
    </SettingsGroupCard>
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
    <SettingsGroupCard
      title={t("activeSessions")}
      description={t("activeSessionsDescription")}
    >
      {sessionQuery.isLoading || sessionsQuery.isLoading ? (
        <div className="space-y-3 py-3">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : (
        <>
      {sessions.length === 0 ? (
        <p className="px-2 py-3 text-sm text-muted-foreground">{t("sessionsEmpty")}</p>
      ) : null}
      {sessions.map((session) => {
        const isCurrent = session.id === currentId;
        const busy = busyToken === session.token;
        const { isMobile, label } = parseUserAgent(session.userAgent);
        const deviceLabel = label || session.userAgent || t("sessionUnknown");
        const DeviceIcon = isMobile ? Smartphone : Laptop;

        return (
          <SettingsGroupRow
            key={session.id}
            wide
            title={
              <span className="inline-flex items-center gap-2">
                <DeviceIcon className="size-4 shrink-0 text-muted-foreground" />
                {isCurrent
                  ? t("currentSession")
                  : session.ipAddress?.trim() || t("otherSession")}
              </span>
            }
            description={deviceLabel}
          >
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
                    className="relative shrink-0"
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
                className="relative shrink-0"
                disabled={busy}
                onClick={() => void revoke(session)}
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {t("revoke")}
              </Button>
            )}
          </SettingsGroupRow>
        );
      })}
        </>
      )}
      {error ? <p className="px-2 py-3 text-xs text-destructive">{error}</p> : null}
      {sessionsQuery.isError ? (
        <p className="px-2 py-3 text-xs text-destructive">
          {sessionsQuery.error instanceof Error
            ? sessionsQuery.error.message
            : t("errors.listSessionsFailed")}
        </p>
      ) : null}
    </SettingsGroupCard>
  );
}

/** Security block: Linked accounts + Active sessions (better-auth-ui security settings). */
export function HubSecuritySettingsCards() {
  return (
    <SettingsPageStack>
      <LinkedAccountsCard />
      <ActiveSessionsCard />
    </SettingsPageStack>
  );
}
