"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthView, UserView } from "@daveyplate/better-auth-ui";
import { HubDeleteAccountSection } from "@/features/settings/components/HubDeleteAccountSection";
import { HubNameSettingsCard } from "@/features/settings/components/HubNameSettingsCard";
import { HubSecuritySettingsCards } from "@/features/settings/components/HubSecuritySettingsCards";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  cn,
} from "@workspace/ui";
import { LogIn, LogOut, RefreshCw, User } from "lucide-react";
import {
  clearStoredDeviceCredential,
  getStoredDeviceCredential,
  hubConfigured,
  hubMe,
  storeDeviceCredential,
  type HubMe,
} from "@/api/hub-client";
import {
  getHubAuthClient,
  hubGetSession,
  hubSignOut,
} from "@/api/hub-auth-client";
import {
  HUB_OAUTH_STARTED_EVENT,
  HubAuthUIProvider,
} from "@/features/settings/components/HubAuthUIProvider";
import { ensureLocalHubDevice } from "@/features/connection/lib/ensure-local-hub-device";
import { loadComputerClientSettingsFromDisk } from "@/features/connection/lib/sync-computer-client-settings";
import { applyIdentityBearingComputerSettings } from "@/features/connection/lib/query-identity-lifecycle";
import { clearWebRelayClientCache } from "@/features/connection/lib/create-web-relay-client";
import { isDesktopRuntime } from "@/shared/lib/desktop-runtime";

/** Shared Atmos surface: use page background (not muted/gray card). */
const accountSurfaceClass =
  "overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-none";

export function AccountSettingsSection() {
  const t = useTranslations("settings.accountSection");
  const configured = hubConfigured();

  if (!configured) {
    return (
      <div className="rounded-xl border border-border bg-background p-6">
        <p className="text-sm font-medium text-foreground">{t("title")}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("hubNotConfigured")}
        </p>
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
  // Electron/Tauri preload, or desktop static export build (packaged UI).
  const desktop =
    isDesktopRuntime() ||
    process.env.NEXT_PUBLIC_BUILD_TARGET === "desktop";

  const sessionQuery = useQuery({
    queryKey: ["hub", "session"],
    queryFn: async () => hubGetSession(),
    staleTime: 15_000,
    retry: false,
  });

  // Live Better Auth session atom — updates immediately after rename (updateUser).
  const authClient = React.useMemo(() => getHubAuthClient(), []);
  const { data: liveSession } = authClient.useSession();

  // Desktop after system-browser OAuth has no Hub cookies in Electron —
  // identity comes from device credential + /v1/me Bearer.
  const meQuery = useQuery({
    queryKey: ["hub", "me"],
    queryFn: async (): Promise<HubMe | null> => hubMe(),
    staleTime: 15_000,
    retry: false,
  });

  const cookieUser = liveSession?.user ?? sessionQuery.data?.user;
  const me = meQuery.data;
  const signedIn = Boolean(cookieUser?.id || me?.user_id);

  const [signInOpen, setSignInOpen] = React.useState(false);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [waitingBrowser, setWaitingBrowser] = React.useState(false);

  const refresh = React.useCallback(() => {
    void sessionQuery.refetch();
    void meQuery.refetch();
  }, [sessionQuery, meQuery]);

  // After OAuth opens in a new tab / system browser, poll until this tab sees a session
  // (web: Hub cookie) or device credential (desktop: bridge → disk).
  React.useEffect(() => {
    if (!waitingBrowser || signedIn) return;

    let cancelled = false;
    const tick = async () => {
      try {
        if (desktop) {
          const disk = await loadComputerClientSettingsFromDisk();
          const cred = (
            disk?.device_credential ||
            disk?.access_token ||
            ""
          ).trim();
          if (cred.length >= 32 && !cancelled) {
            storeDeviceCredential({
              device_id: disk?.device_id ?? "device",
              device_credential: cred,
            });
            try {
              await applyIdentityBearingComputerSettings({
                accessToken: cred,
                accessTokenConfigured: true,
              });
              clearWebRelayClientCache();
            } catch {
              /* local API optional */
            }
          }
        }
        await qc.invalidateQueries({ queryKey: ["hub"] });
      } catch {
        /* keep polling */
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [desktop, waitingBrowser, signedIn, qc]);

  React.useEffect(() => {
    if (signedIn && (signInOpen || waitingBrowser)) {
      setSignInOpen(false);
      setWaitingBrowser(false);
    }
  }, [signedIn, signInOpen, waitingBrowser]);

  React.useEffect(() => {
    const onStarted = () => setWaitingBrowser(true);
    window.addEventListener(HUB_OAUTH_STARTED_EVENT, onStarted);
    return () => {
      window.removeEventListener(HUB_OAUTH_STARTED_EVENT, onStarted);
    };
  }, []);

  // OAuth done tab notifies via BroadcastChannel (and postMessage if opener intact).
  React.useEffect(() => {
    const onDone = () => {
      void qc.invalidateQueries({ queryKey: ["hub"] });
      // Web login tab: mint/sync device for Linear + local API (no manual Trust).
      void ensureLocalHubDevice().then(() =>
        qc.invalidateQueries({ queryKey: ["hub"] }),
      );
    };
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("atmos-hub-auth");
      bc.onmessage = (ev) => {
        if (ev.data?.type === "hub-auth-done" && !ev.data?.error) onDone();
      };
    } catch {
      /* ignore */
    }
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      if (ev.data?.type === "hub-auth-done" && !ev.data?.error) onDone();
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      bc?.close();
    };
  }, [qc]);

  // Hydrate device store from disk when Account opens (desktop cold start).
  React.useEffect(() => {
    if (!desktop || getStoredDeviceCredential()) return;
    void (async () => {
      try {
        const disk = await loadComputerClientSettingsFromDisk();
        const cred = (
          disk?.device_credential ||
          disk?.access_token ||
          ""
        ).trim();
        if (cred.length >= 32) {
          storeDeviceCredential({
            device_id: disk?.device_id ?? "device",
            device_credential: cred,
          });
          await qc.invalidateQueries({ queryKey: ["hub"] });
        }
      } catch {
        /* ignore */
      }
    })();
  }, [desktop, qc]);

  // Cookie session present → ensure local device matches this user (auto re-trust).
  React.useEffect(() => {
    if (!cookieUser?.id) return;
    let cancelled = false;
    void (async () => {
      const result = await ensureLocalHubDevice();
      if (cancelled) return;
      if (result.status === "ok" && result.enrolled) {
        await qc.invalidateQueries({ queryKey: ["hub"] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cookieUser?.id, qc]);

  const signOut = async () => {
    setBusy(true);
    setError(null);
    try {
      // Hub /api/auth/sign-out: delete session row + expire session cookies.
      await hubSignOut();
      clearStoredDeviceCredential();
      try {
        const { clearComputerClientSettingsOnDisk } = await import(
          "@/features/connection/lib/sync-computer-client-settings"
        );
        await clearComputerClientSettingsOnDisk();
        await applyIdentityBearingComputerSettings({
          accessToken: "",
          accessTokenConfigured: false,
        });
        clearWebRelayClientCache();
      } catch {
        /* local API optional */
      }
      await qc.invalidateQueries({ queryKey: ["hub"] });
      setSignOutConfirmOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.signOutFailed"));
    } finally {
      setBusy(false);
    }
  };

  // better-auth-ui UserView accepts a user-like object; desktop device auth has no cookie session.
  const profileUser = cookieUser
    ? cookieUser
    : me
      ? {
          id: me.user_id,
          name: me.name || me.handle || t("signedIn"),
          email: me.email ?? undefined,
          image: undefined as string | undefined,
        }
      : null;

  const identityPending =
    (sessionQuery.isLoading || meQuery.isLoading) && !signedIn;

  return (
    <div className="space-y-4">
      {!signedIn ? (
        /* ── Signed out: title + Sign in in status slot ── */
        <section className={accountSurfaceClass}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-6 px-6 py-5">
            <div className="flex items-start gap-3">
              <User className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="text-base font-medium text-foreground">
                  {t("title")}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t("description")}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              {identityPending ? (
                <Skeleton className="h-9 w-28 rounded-xl" />
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="h-9 gap-1.5"
                  onClick={() => setSignInOpen(true)}
                >
                  <LogIn className="size-3.5" />
                  {t("signIn")}
                </Button>
              )}
              {waitingBrowser ? (
                <p className="max-w-[16rem] text-right text-xs text-muted-foreground">
                  {desktop ? t("waitingBrowser") : t("waitingBrowserWeb")}
                </p>
              ) : null}
              {error ? (
                <p className="max-w-[16rem] text-right text-xs text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      ) : (
        /* ── Signed in: profile + account security + delete ── */
        <div className="flex w-full flex-col gap-4">
          <section className={accountSurfaceClass}>
            <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
              {profileUser ? (
                <UserView
                  key={`${profileUser.id}:${profileUser.name ?? ""}`}
                  user={profileUser}
                  size="lg"
                />
              ) : (
                <Skeleton className="h-12 w-48 rounded-xl" />
              )}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5"
                  onClick={refresh}
                  disabled={sessionQuery.isFetching || meQuery.isFetching}
                >
                  <RefreshCw
                    className={cn(
                      "size-3.5",
                      (sessionQuery.isFetching || meQuery.isFetching) &&
                        "animate-spin",
                    )}
                  />
                </Button>
                <Popover
                  open={signOutConfirmOpen}
                  onOpenChange={setSignOutConfirmOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1.5"
                      disabled={busy}
                    >
                      <LogOut className="size-3.5" />
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
                        onClick={() => setSignOutConfirmOpen(false)}
                      >
                        {t("signOutCancel")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => void signOut()}
                      >
                        {t("signOut")}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            {error ? (
              <div className="border-t border-border px-6 py-3">
                <p className="text-xs text-destructive">{error}</p>
              </div>
            ) : null}
          </section>

          <div className="flex w-full flex-col gap-4 md:gap-6">
            {cookieUser ? (
              <HubNameSettingsCard
                value={cookieUser.name ?? ""}
                onSaved={() => {
                  void qc.invalidateQueries({ queryKey: ["hub"] });
                }}
              />
            ) : null}
            <HubSecuritySettingsCards />
          </div>

          <HubDeleteAccountSection
            onDeleted={() => {
              setError(null);
              void qc.invalidateQueries({ queryKey: ["hub"] });
            }}
          />
        </div>
      )}

      <Dialog open={signInOpen} onOpenChange={setSignInOpen}>
        <DialogContent
          className="z-[70] w-full max-w-sm gap-0 overflow-hidden border-none bg-transparent p-0 shadow-none sm:max-w-sm"
          overlayClassName="z-[70]"
          showCloseButton
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{t("signInDialogTitle")}</DialogTitle>
            <DialogDescription>
              {desktop
                ? t("signInDialogDescriptionDesktop")
                : t("signInDialogDescriptionWeb")}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-xl border border-border bg-background shadow-lg">
            <AuthView
              view="SIGN_IN"
              socialLayout="vertical"
              className="w-full max-w-none"
              redirectTo={
                typeof window !== "undefined" ? window.location.origin : "/"
              }
              localization={{
                SIGN_IN: t("signInDialogTitle"),
                DISABLED_CREDENTIALS_DESCRIPTION: desktop
                  ? t("signInDialogDescriptionDesktop")
                  : t("signInDialogDescriptionWeb"),
              }}
              classNames={{
                base: "w-full max-w-none border-0 shadow-none rounded-none bg-transparent",
              }}
              cardFooter={
                waitingBrowser ? (
                  <p className="w-full px-1 pb-1 text-center text-xs leading-5 text-muted-foreground">
                    {desktop ? t("waitingBrowser") : t("waitingBrowserWeb")}
                  </p>
                ) : undefined
              }
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
