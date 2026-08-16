"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";

export type AppNavigationTarget = {
  path: string;
  kind: "push" | "replace";
};

/**
 * Returns `true` when the interceptor has handled (and blocked) the navigation,
 * so the router should not navigate. Returning `false` lets navigation proceed.
 */
export type AppNavigationInterceptor = (target: AppNavigationTarget) => boolean;

const AppNavigationInterceptContext = createContext<AppNavigationInterceptor | null>(null);

export function AppNavigationInterceptProvider({
  interceptor,
  children,
}: {
  interceptor: AppNavigationInterceptor;
  children: ReactNode;
}) {
  return (
    <AppNavigationInterceptContext.Provider value={interceptor}>
      {children}
    </AppNavigationInterceptContext.Provider>
  );
}

export function useAppNavigationInterceptor(): AppNavigationInterceptor | null {
  return useContext(AppNavigationInterceptContext);
}

let registeredGuard: AppNavigationInterceptor | null = null;

export function runRegisteredAppNavigationGuard(target: AppNavigationTarget): boolean {
  return registeredGuard?.(target) === true;
}

export function useRegisteredAppNavigationGuard(
  guard: AppNavigationInterceptor | null,
) {
  useEffect(() => {
    registeredGuard = guard;
    return () => {
      if (registeredGuard === guard) {
        registeredGuard = null;
      }
    };
  }, [guard]);
}
