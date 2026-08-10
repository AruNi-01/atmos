"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AuthView,
  SignedIn,
  SignedOut,
  UserView,
} from "@daveyplate/better-auth-ui";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
  cn,
} from "@workspace/ui";
import {
  CircleCheck,
  CircleMinus,
  LogIn,
  LogOut,
  RefreshCw,
  Shield,
  UserRound,
} from "lucide-react";
import {
  clearStoredDeviceCredential,
  hubConfigured,
  hubEnrollAndStoreDevice,
  hubListDevices,
  type HubDeviceRow,
} from "@/api/hub-client";
import { hubGetSession, hubSignOut } from "@/api/hub-auth-client";
import { HubAuthUIProvider } from "@/features/settings/components/HubAuthUIProvider";

export function AccountSettingsSection() {
  const t = useTranslations("settings.accountSection");
  const configured = hubConfigured();

  if (!configured) {
    return (
      <div className="rounded-2xl border border-border p-6">
        <p className="text-sm font-medium text-foreground">{t("title")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("hubNotConfigured")}</p>
      </div>
    );
  }

  return (
    <HubAuthUIProvider>
      <AccountSettingsBody />
    </HubAuthUIProvider>
  );
}

function AccountSettingsBody() {
  const t = useTranslations("settings.accountSection");
  const qc = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ["hub", "session"],
    queryFn: async () => hubGetSession(),
    staleTime: 15_000,
    retry: false,
  });

  const user = sessionQuery.data?.user;
  const signedIn = Boolean(user?.id);

  const devicesQuery = useQuery({
    queryKey: ["hub", "devices"],
    queryFn: async (): Promise<HubDeviceRow[]> => hubListDevices(),
    enabled: signedIn,
    staleTime: 15_000,
  });

  const [signInOpen, setSignInOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deviceCredentialOnce, setDeviceCredentialOnce] = React.useState<
    string | null
  >(null);

  const refresh = React.useCallback(() => {
    void sessionQuery.refetch();
    void devicesQuery.refetch();
  }, [sessionQuery, devicesQuery]);

  // Close sign-in dialog once session becomes available (e.g. return from OAuth).
  React.useEffect(() => {
    if (signedIn && signInOpen) {
      setSignInOpen(false);
    }
  }, [signedIn, signInOpen]);

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
      const body = await hubEnrollAndStoreDevice({
        label:
          typeof navigator !== "undefined"
            ? navigator.userAgent.slice(0, 64)
            : "web",
      });
      // Show once — store already persisted via hubEnrollAndStoreDevice.
      setDeviceCredentialOnce(body.device_credential);
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
        const { clearWebRelayClientCache } = await import(
          "@/features/connection/lib/create-web-relay-client"
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
        clearWebRelayClientCache();
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

  return (
    <div className="space-y-4">
      {/* ── Auth ─────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-2xl border border-border">
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
                <span>{t("signedIn")}</span>
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
                className={cn(
                  "size-3.5",
                  sessionQuery.isFetching && "animate-spin",
                )}
              />
            </Button>
          </div>
        </div>

        <div className="space-y-3 border-t border-border px-6 py-4">
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : null}

          <SignedOut>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="h-9 gap-1.5"
                onClick={() => setSignInOpen(true)}
              >
                <LogIn className="size-3.5" />
                {t("signIn")}
              </Button>
              <p className="text-xs text-muted-foreground">{t("signInHint")}</p>
            </div>
          </SignedOut>

          <SignedIn>
            <div className="flex flex-wrap items-center gap-2">
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
          </SignedIn>
        </div>
      </section>

      {/* ── User profile ─────────────────────────────────────── */}
      <SignedIn>
        <section className="overflow-hidden rounded-2xl border border-border">
          <div className="flex items-start gap-3 px-6 py-5">
            <UserRound className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-base font-medium text-foreground">
                {t("profileTitle")}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("profileDescription")}
              </p>
            </div>
          </div>
          <div className="border-t border-border px-6 py-4">
            {sessionQuery.isLoading ? (
              <div className="flex items-center gap-3">
                <Skeleton className="size-12 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ) : user ? (
              <UserView user={user} size="lg" />
            ) : (
              <div className="flex items-center gap-3">
                <Avatar className="size-12">
                  <AvatarImage src={undefined} alt="" />
                  <AvatarFallback>
                    <UserRound className="size-5" />
                  </AvatarFallback>
                </Avatar>
                <p className="text-sm font-medium text-foreground">
                  {t("signedIn")}
                </p>
              </div>
            )}
          </div>
        </section>
      </SignedIn>

      {/* ── Security (devices / trust) ───────────────────────── */}
      <SignedIn>
        <section className="overflow-hidden rounded-2xl border border-border">
          <div className="flex items-start gap-3 px-6 py-5">
            <Shield className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-base font-medium text-foreground">
                {t("securityTitle")}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("securityDescription")}
              </p>
            </div>
          </div>
          <div className="space-y-3 border-t border-border px-6 py-4">
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
            </div>

            {deviceCredentialOnce ? (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                <p className="font-medium text-foreground">
                  {t("credentialOnceTitle")}
                </p>
                <p className="mt-1 break-all font-mono text-muted-foreground">
                  {deviceCredentialOnce}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {t("credentialOnceHint")}
                </p>
              </div>
            ) : null}

            <div>
              <p className="text-sm font-medium text-foreground">
                {t("devicesTitle")}
              </p>
              {devicesQuery.isLoading ? (
                <Skeleton className="mt-2 h-12 w-full rounded-lg" />
              ) : (devicesQuery.data?.length ?? 0) === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("devicesEmpty")}
                </p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {devicesQuery.data!.map((d) => (
                    <li
                      key={d.device_id}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs"
                    >
                      <span className="truncate font-mono text-muted-foreground">
                        {d.label || d.device_id}
                      </span>
                      <span className="text-muted-foreground">
                        {d.revoked_at
                          ? t("deviceRevoked")
                          : t("deviceActive")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </SignedIn>

      {/* Sign-in modal (better-auth-ui AuthView, social only) */}
      <Dialog open={signInOpen} onOpenChange={setSignInOpen}>
        <DialogContent
          className="z-[70] w-full max-w-md border-none bg-transparent p-0 shadow-none sm:max-w-md"
          overlayClassName="z-[70]"
          showCloseButton
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{t("signInDialogTitle")}</DialogTitle>
            <DialogDescription>{t("signInDialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center">
            <AuthView
              view="SIGN_IN"
              socialLayout="vertical"
              redirectTo={
                typeof window !== "undefined" ? window.location.origin : "/"
              }
              localization={{
                SIGN_IN: t("signInDialogTitle"),
                DISABLED_CREDENTIALS_DESCRIPTION: t("signInDialogDescription"),
              }}
              classNames={{
                base: "border-border shadow-lg",
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
