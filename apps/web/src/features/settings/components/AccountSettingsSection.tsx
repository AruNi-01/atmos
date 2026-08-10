"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Skeleton, cn } from "@workspace/ui";
import { CircleCheck, CircleMinus, LogIn, LogOut, RefreshCw, Shield } from "lucide-react";
import {
  clearStoredDeviceCredential,
  hubBaseUrl,
  hubConfigured,
  hubFetch,
  storeDeviceCredential,
} from "@/api/hub-client";
import {
  hubGetSession,
  hubSignInSocial,
  hubSignOut,
} from "@/api/hub-auth-client";

type DeviceRow = {
  device_id: string;
  label: string | null;
  created_at?: unknown;
  last_seen_at?: unknown;
  revoked_at?: unknown;
};

export function AccountSettingsSection() {
  const t = useTranslations("settings.accountSection");
  const qc = useQueryClient();
  const configured = hubConfigured();

  const sessionQuery = useQuery({
    queryKey: ["hub", "session"],
    queryFn: async () => hubGetSession(),
    enabled: configured,
    staleTime: 15_000,
    retry: false,
  });

  const user = sessionQuery.data?.user;
  const signedIn = Boolean(user?.id);

  const devicesQuery = useQuery({
    queryKey: ["hub", "devices"],
    queryFn: async (): Promise<DeviceRow[]> => {
      const res = await hubFetch("/v1/devices");
      if (res.status === 401) return [];
      if (!res.ok) throw new Error(`devices ${res.status}`);
      const body = (await res.json()) as { devices?: DeviceRow[] };
      return body.devices ?? [];
    },
    enabled: configured && signedIn,
    staleTime: 15_000,
  });

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deviceCredentialOnce, setDeviceCredentialOnce] = React.useState<string | null>(
    null,
  );

  const refresh = React.useCallback(() => {
    void sessionQuery.refetch();
    void devicesQuery.refetch();
  }, [sessionQuery, devicesQuery]);

  const signIn = async (provider: "github" | "google") => {
    setBusy(true);
    setError(null);
    try {
      await hubSignInSocial(provider);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.signInFailed"));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await hubSignOut();
      setDeviceCredentialOnce(null);
      clearStoredDeviceCredential();
      await qc.invalidateQueries({ queryKey: ["hub"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.signOutFailed"));
    } finally {
      setBusy(false);
    }
  };

  const enrollDevice = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await hubFetch("/v1/devices", {
        method: "POST",
        body: JSON.stringify({
          label:
            typeof navigator !== "undefined"
              ? navigator.userAgent.slice(0, 64)
              : "web",
        }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const body = (await res.json()) as {
        device_id: string;
        device_credential: string;
      };
      // Show once — also persist for local API / Relay Bearer.
      setDeviceCredentialOnce(body.device_credential);
      storeDeviceCredential({
        device_id: body.device_id,
        device_credential: body.device_credential,
      });
      // Also project into Computer client settings when local API is available.
      try {
        const { saveComputerClientSettingsToDisk } = await import(
          "@/features/connection/lib/sync-computer-client-settings"
        );
        const { applyIdentityBearingComputerSettings } = await import(
          "@/features/connection/lib/query-identity-lifecycle"
        );
        const { useAtmosComputerStore } = await import(
          "@/features/connection/lib/atmos-computer-store"
        );
        const st = useAtmosComputerStore.getState();
        await applyIdentityBearingComputerSettings({
          accessToken: body.device_credential,
          accessTokenConfigured: true,
        });
        await saveComputerClientSettingsToDisk(
          body.device_credential,
          st.relayUrl,
          st.relaySecretKey,
          body.device_id,
        );
      } catch {
        /* local API optional */
      }
      await devicesQuery.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.enrollFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (!configured) {
    return (
      <div className="rounded-2xl border border-border p-6">
        <p className="text-sm font-medium text-foreground">{t("title")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("hubNotConfigured")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          NEXT_PUBLIC_ATMOS_HUB_URL → {hubBaseUrl() || "(empty)"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-6 px-6 py-5">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="text-base font-medium text-foreground">{t("title")}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("description")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sessionQuery.isLoading ? (
              <Skeleton className="h-9 w-28 rounded-xl" />
            ) : signedIn ? (
              <div className="flex items-center gap-2 text-sm text-emerald-500">
                <CircleCheck className="size-4" />
                <span>
                  {user?.name || user?.email || t("signedIn")}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CircleMinus className="size-4" />
                <span>{t("signedOut")}</span>
              </div>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={refresh}
              disabled={sessionQuery.isFetching}
            >
              <RefreshCw
                className={cn("size-3.5", sessionQuery.isFetching && "animate-spin")}
              />
            </Button>
          </div>
        </div>

        <div className="space-y-3 border-t border-border px-6 py-4">
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : null}

          {!signedIn ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="h-9 gap-1.5"
                disabled={busy}
                onClick={() => void signIn("github")}
              >
                <LogIn className="size-3.5" />
                {t("signInGithub")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 gap-1.5"
                disabled={busy}
                onClick={() => void signIn("google")}
              >
                <LogIn className="size-3.5" />
                {t("signInGoogle")}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={busy}
                  onClick={() => void enrollDevice()}
                >
                  {t("trustDevice")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1.5"
                  disabled={busy}
                  onClick={() => void signOut()}
                >
                  <LogOut className="size-3.5" />
                  {t("signOut")}
                </Button>
              </div>

              {deviceCredentialOnce ? (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                  <p className="font-medium text-foreground">{t("credentialOnceTitle")}</p>
                  <p className="mt-1 break-all font-mono text-muted-foreground">
                    {deviceCredentialOnce}
                  </p>
                  <p className="mt-1 text-muted-foreground">{t("credentialOnceHint")}</p>
                </div>
              ) : null}

              <div>
                <p className="text-sm font-medium text-foreground">{t("devicesTitle")}</p>
                {devicesQuery.isLoading ? (
                  <Skeleton className="mt-2 h-12 w-full rounded-lg" />
                ) : (devicesQuery.data?.length ?? 0) === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">{t("devicesEmpty")}</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {devicesQuery.data!.map((d) => (
                      <li
                        key={d.device_id}
                        className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs"
                      >
                        <span className="truncate font-mono text-muted-foreground">
                          {d.device_id}
                        </span>
                        <span className="text-muted-foreground">
                          {d.revoked_at ? t("deviceRevoked") : d.label || t("deviceActive")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
