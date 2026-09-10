"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthView } from "@daveyplate/better-auth-ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui";
import {
  HUB_AUTH_DONE_CHANNEL,
  HUB_AUTH_DONE_MESSAGE,
} from "@/app/hub-auth/hub-auth-channel";
import {
  getStoredDeviceCredential,
  hubMe,
  storeDeviceCredential,
  type HubMe,
} from "@/api/hub-client";
import { hubGetSession } from "@/api/hub-auth-client";
import {
  HUB_OAUTH_STARTED_EVENT,
  HubAuthUIProvider,
} from "@/features/settings/components/HubAuthUIProvider";
import { ensureLocalHubDevice } from "@/features/connection/lib/ensure-local-hub-device";
import { loadComputerClientSettingsFromDisk } from "@/features/connection/lib/sync-computer-client-settings";
import { applyIdentityBearingComputerSettings } from "@/features/connection/lib/query-identity-lifecycle";
import { clearWebRelayClientCache } from "@/features/connection/lib/create-web-relay-client";
import { isDesktopRuntime } from "@/shared/lib/desktop-runtime";

export function HubSignInDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <HubAuthUIProvider>
      <HubSignInDialogBody open={open} onOpenChange={onOpenChange} />
    </HubAuthUIProvider>
  );
}

function HubSignInDialogBody({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("settings.accountSection");
  const qc = useQueryClient();
  const desktop =
    isDesktopRuntime() ||
    process.env.NEXT_PUBLIC_BUILD_TARGET === "desktop";
  const [waitingBrowser, setWaitingBrowser] = React.useState(false);

  const sessionQuery = useQuery({
    queryKey: ["hub", "session"],
    queryFn: async () => hubGetSession(),
    staleTime: 15_000,
    retry: false,
  });
  const meQuery = useQuery({
    queryKey: ["hub", "me"],
    queryFn: async (): Promise<HubMe | null> => hubMe(),
    staleTime: 15_000,
    retry: false,
  });
  const signedIn = Boolean(
    sessionQuery.data?.user?.id || meQuery.data?.user_id,
  );

  React.useEffect(() => {
    const onStarted = () => setWaitingBrowser(true);
    window.addEventListener(HUB_OAUTH_STARTED_EVENT, onStarted);
    return () => {
      window.removeEventListener(HUB_OAUTH_STARTED_EVENT, onStarted);
    };
  }, []);

  React.useEffect(() => {
    const onDone = () => {
      void qc.invalidateQueries({ queryKey: ["hub"] });
      void ensureLocalHubDevice().then(() =>
        qc.invalidateQueries({ queryKey: ["hub"] }),
      );
    };
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(HUB_AUTH_DONE_CHANNEL);
      bc.onmessage = (ev) => {
        if (ev.data?.type === HUB_AUTH_DONE_MESSAGE && !ev.data?.error) onDone();
      };
    } catch {
      /* ignore */
    }
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      if (ev.data?.type === HUB_AUTH_DONE_MESSAGE && !ev.data?.error) onDone();
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      bc?.close();
    };
  }, [qc]);

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
  }, [desktop, qc, signedIn, waitingBrowser]);

  React.useEffect(() => {
    if (!signedIn || (!open && !waitingBrowser)) return;
    let cancelled = false;
    void (async () => {
      try {
        if (!getStoredDeviceCredential()?.trim()) {
          await ensureLocalHubDevice();
        }
      } finally {
        if (!cancelled) {
          onOpenChange(false);
          setWaitingBrowser(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onOpenChange, open, signedIn, waitingBrowser]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
  );
}
