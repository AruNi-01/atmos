"use client";

import React from "react";
import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import { useQueryClient } from "@tanstack/react-query";
import { toastManager } from "@workspace/ui";
import {
  getHubAuthClient,
  hubSignOut,
} from "@/api/hub-auth-client";
import {
  isHubSocialProvider,
  openHubOAuth,
} from "@/features/settings/components/hub-oauth-open";

export {
  HUB_OAUTH_STARTED_EVENT,
  HUB_DESKTOP_OAUTH_STARTED_EVENT,
} from "@/features/settings/components/hub-oauth-open";

type HubAuthUIProviderProps = {
  children: React.ReactNode;
};

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
  }, [queryClient]);

  // baseURL is prepended to callback paths inside better-auth-ui ProviderButton.
  // Keep empty so web callbackURL is the app origin (not Hub).
  const redirectTo =
    typeof window !== "undefined" ? window.location.origin : "/";

  const socialSignIn = React.useCallback(
    async (params: { provider: string; callbackURL?: string }) => {
      if (!isHubSocialProvider(params.provider)) {
        throw new Error(`Unsupported provider: ${params.provider}`);
      }
      const result = await openHubOAuth({
        provider: params.provider,
        mode: "sign-in",
      });
      if (!result.ok) {
        toast({ variant: "error", message: result.error });
        throw new Error(result.error);
      }
    },
    [toast],
  );

  return (
    <AuthUIProvider
      authClient={authClient}
      baseURL=""
      redirectTo={redirectTo}
      credentials={false}
      signUp={false}
      changeEmail={false}
      account={{ fields: ["name"] }}
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
