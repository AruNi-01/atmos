"use client";

import React from "react";
import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import { useQueryClient } from "@tanstack/react-query";
import { cn, toastManager } from "@workspace/ui";
import {
  getHubAuthClient,
  hubSignOut,
} from "@/api/hub-auth-client";
import {
  isHubSocialProvider,
  openHubOAuth,
} from "@/features/settings/components/hub-oauth-open";
import {
  HUB_AUTH_DONE_CHANNEL,
  HUB_AUTH_DONE_MESSAGE,
} from "@/app/hub-auth/hub-auth-channel";

export {
  HUB_OAUTH_STARTED_EVENT,
  HUB_DESKTOP_OAUTH_STARTED_EVENT,
} from "@/features/settings/components/hub-oauth-open";

type HubAuthUIProviderProps = {
  children: React.ReactNode;
};

/**
 * GitHub / Google profile photos are remote HTTPS URLs. Render them as a
 * plain img (not next/image) with no-referrer so the provider CDN does not
 * 403, and keep the image above Radix's initials fallback.
 */
function HubAvatarImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  if (!src || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- OAuth avatars are arbitrary GitHub/Google hosts.
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      className={cn("relative z-10 size-full object-cover", className)}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * better-auth-ui provider wired to Atmos Hub's Better Auth browser client.
 * Social-only (GitHub + Google); credentials / sign-up disabled.
 *
 * OAuth always opens outside the current Atmos tab via Hub `/v1/oauth/start`
 * (top-level navigation on hub.atmos.land) so the OAuth state cookie is
 * first-party — avoids `state_mismatch` when using a new tab / system browser.
 *
 * Do not wrap the auth client in a Proxy that `.bind()`s methods: better-auth
 * uses a dynamic path Proxy for `updateUser` / `listAccounts` / etc., and
 * `.bind()` breaks that (→ "updateUser is not a function").
 * Account linking uses `openHubOAuth` from HubSecuritySettingsCards directly.
 */
export function HubAuthUIProvider({ children }: HubAuthUIProviderProps) {
  const authClient = React.useMemo(() => getHubAuthClient(), []);
  const queryClient = useQueryClient();

  const toast = React.useCallback(
    ({
      variant = "default",
      message,
    }: {
      variant?: "default" | "success" | "error" | "info" | "warning";
      message?: string;
    }) => {
      if (!message) return;
      const type =
        variant === "error"
          ? "error"
          : variant === "success"
            ? "success"
            : variant === "warning"
              ? "warning"
              : "info";
      toastManager.add({ title: message, type });
    },
    [],
  );

  const onSessionChange = React.useCallback(async () => {
    // Drop Better Auth cookie cache so this tab sees the OAuth tab's new session.
    try {
      await authClient.getSession({
        query: { disableCookieCache: true },
      });
    } catch {
      /* ignore */
    }
    // Refetch active hub identity queries so header UserView updates immediately.
    await queryClient.invalidateQueries({ queryKey: ["hub"] });
    await queryClient.refetchQueries({ queryKey: ["hub", "session"] });
    // Cookie session present → ensure local device for Linear / local API.
    try {
      const { ensureLocalHubDevice } = await import(
        "@/features/connection/lib/ensure-local-hub-device"
      );
      await ensureLocalHubDevice();
      await queryClient.invalidateQueries({ queryKey: ["hub"] });
    } catch {
      /* optional */
    }
  }, [authClient, queryClient]);

  React.useEffect(() => {
    const onDone = (error?: unknown) => {
      if (error) return;
      void onSessionChange();
    };
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(HUB_AUTH_DONE_CHANNEL);
      bc.onmessage = (ev) => {
        if (ev.data?.type === HUB_AUTH_DONE_MESSAGE) onDone(ev.data?.error);
      };
    } catch {
      /* ignore */
    }
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      if (ev.data?.type === HUB_AUTH_DONE_MESSAGE) onDone(ev.data?.error);
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      bc?.close();
    };
  }, [onSessionChange]);

  // baseURL is prepended to callback paths inside better-auth-ui ProviderButton.
  // Keep empty so web callbackURL is the app origin (not Hub).
  const redirectTo =
    typeof window !== "undefined" ? window.location.origin : "/";

  const socialSignIn = React.useCallback(async (params: unknown) => {
    const p = params as { provider?: string; callbackURL?: string };
    if (!p?.provider || !isHubSocialProvider(p.provider)) {
      throw new Error(`Unsupported provider: ${String(p?.provider)}`);
    }
    const result = await openHubOAuth({
      provider: p.provider,
      mode: "sign-in",
    });
    if (!result.ok) {
      toast({ variant: "error", message: result.error });
      throw new Error(result.error);
    }
  }, [toast]);

  return (
    <AuthUIProvider
      authClient={authClient}
      baseURL=""
      redirectTo={redirectTo}
      credentials={false}
      signUp={false}
      changeEmail={false}
      account={{ fields: ["name"] }}
      avatar={{ Image: HubAvatarImage }}
      social={{
        providers: ["github", "google"],
        signIn: socialSignIn,
      }}
      // better-auth-ui updateUser does not call onSessionChange by default —
      // wrap so Account header UserView + hub queries stay in sync after rename.
      mutators={{
        updateUser: async (params) => {
          const { data, error } = await authClient.updateUser({
            ...params,
          });
          if (error) {
            throw new Error(error.message || "Failed to update profile");
          }
          // Refresh Better Auth session atom + React Query hub cache.
          await authClient.getSession({
            query: { disableCookieCache: true },
          });
          await onSessionChange();
          return data;
        },
      }}
      toast={toast}
      onSessionChange={onSessionChange}
      navigate={(href) => {
        if (typeof window === "undefined") return;
        // SessionsCard "Sign out" on the current session navigates to /auth/sign-out.
        // We do not host AuthView routes — call Hub signOut and refresh instead.
        const path = href.split("?")[0] ?? href;
        if (
          path === "/auth/sign-out" ||
          path.endsWith("/sign-out") ||
          path.endsWith("/auth/sign-out")
        ) {
          void (async () => {
            try {
              await hubSignOut();
              await onSessionChange();
            } catch (e) {
              toast({
                variant: "error",
                message:
                  e instanceof Error ? e.message : "Sign out failed",
              });
            }
          })();
          return;
        }
        window.location.assign(href);
      }}
      replace={(href) => {
        if (typeof window !== "undefined") {
          window.location.replace(href);
        }
      }}
    >
      {children}
    </AuthUIProvider>
  );
}
