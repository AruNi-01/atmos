"use client";

import React from "react";
import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import { useQueryClient } from "@tanstack/react-query";
import { toastManager } from "@workspace/ui";
import { getHubAuthClient } from "@/api/hub-auth-client";

type HubAuthUIProviderProps = {
  children: React.ReactNode;
};

/**
 * better-auth-ui provider wired to Atmos Hub's Better Auth browser client.
 * Social-only (GitHub + Google); credentials / sign-up disabled.
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
    await queryClient.invalidateQueries({ queryKey: ["hub"] });
  }, [queryClient]);

  // baseURL is prepended to callback paths inside better-auth-ui ProviderButton.
  // Keep empty so OAuth callbackURL is the app origin (matches hubSignInSocial).
  const redirectTo =
    typeof window !== "undefined" ? window.location.origin : "/";

  return (
    <AuthUIProvider
      authClient={authClient}
      baseURL=""
      redirectTo={redirectTo}
      credentials={false}
      signUp={false}
      changeEmail={false}
      account={{ fields: ["name"] }}
      social={{ providers: ["github", "google"] }}
      toast={toast}
      onSessionChange={onSessionChange}
      navigate={(href) => {
        if (typeof window !== "undefined") {
          window.location.assign(href);
        }
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
