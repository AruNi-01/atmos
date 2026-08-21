"use client";

/**
 * Linked accounts, aligned with better-auth-ui Security settings:
 * https://better-auth-ui.com/docs/shadcn/components/settings/security/security-settings
 *
 * Renders Providers without the upstream ProvidersCard double-list of linked
 * providers. Link uses Hub `/v1/oauth/start?mode=link` (first-party state cookie).
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
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui";
import { Loader2 } from "lucide-react";
import {
  hubListAccounts,
  hubUnlinkAccount,
  type HubLinkedAccount,
  type HubSocialProvider,
} from "@/api/hub-auth-client";
import {
  isHubSocialProvider,
  openHubOAuth,
} from "@/features/settings/components/hub-oauth-open";
import {
  SettingsGroupCard,
  SettingsGroupRow,
} from "@/features/settings/components/settings/SettingsGroupCard";

const PROVIDERS: Array<{
  id: HubSocialProvider;
  name: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "github", name: "GitHub", Icon: GitHubIcon },
  { id: "google", name: "Google", Icon: GoogleIcon },
];

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

/** Security block: Linked accounts (better-auth-ui security settings). */
export function HubSecuritySettingsCards() {
  return <LinkedAccountsCard />;
}
