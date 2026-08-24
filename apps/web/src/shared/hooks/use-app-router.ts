"use client";

import {
  useRouter as useNextRouter,
  usePathname,
} from "next/navigation";
import { useCallback, useMemo } from "react";

import {
  runRegisteredAppNavigationGuard,
  useAppNavigationInterceptor,
} from "./app-navigation-intercept";
import { prepareAndPrimeWorkspaceNavigation } from "@/app-shell/workspace-surface-switch";

function currentBrowserLocation(fallbackPathname: string): string {
  if (typeof window === "undefined") {
    return fallbackPathname;
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function useAppRouter() {
  const router = useNextRouter();
  const pathname = usePathname();
  const interceptor = useAppNavigationInterceptor();

  const normalizePath = useCallback(
    (path: string) => {
      const [pathAndQuery, hash = ""] = path.split("#", 2);
      const [rawPathname, rawQuery = ""] = pathAndQuery.split("?", 2);

      let nextPathname = rawPathname;
      if (!nextPathname.startsWith("/")) {
        nextPathname = `/${nextPathname}`;
      }

      const isStaticExportBuild =
        process.env.BUILD_TARGET === "desktop" ||
        process.env.BUILD_TARGET === "local-web" ||
        process.env.BUILD_TARGET === "pages";

      if (
        isStaticExportBuild &&
        nextPathname !== "/" &&
        !nextPathname.endsWith("/")
      ) {
        nextPathname = `${nextPathname}/`;
      }

      const query = rawQuery ? `?${rawQuery}` : "";
      const nextHash = hash ? `#${hash}` : "";
      return `${nextPathname}${query}${nextHash}`;
    },
    [],
  );

  const commitWorkspaceNavigation = useCallback(
    (path: string, kind: "push" | "replace", currentHref?: string | null) => {
      if (interceptor?.({ path, kind })) {
        return;
      }
      if (runRegisteredAppNavigationGuard({ path, kind })) {
        return;
      }
      const nextPath = normalizePath(path);
      if (nextPath === currentBrowserLocation(pathname)) {
        return;
      }
      // APP-043/IMP-008: leftover-chrome strip + warm visual prime only (no full promote).
      // `currentHref === null` keeps dest tab/tmux for an explicit workspace deep link.
      const prepared = prepareAndPrimeWorkspaceNavigation(nextPath, currentHref);
      if (kind === "replace") {
        router.replace(prepared);
        return;
      }
      router.push(prepared);
    },
    [interceptor, normalizePath, pathname, router],
  );

  const push = useCallback(
    (path: string) => {
      commitWorkspaceNavigation(path, "push");
    },
    [commitWorkspaceNavigation],
  );

  const replace = useCallback(
    (path: string) => {
      commitWorkspaceNavigation(path, "replace");
    },
    [commitWorkspaceNavigation],
  );

  const pushWorkspaceDeepLink = useCallback(
    (path: string) => {
      commitWorkspaceNavigation(path, "push", null);
    },
    [commitWorkspaceNavigation],
  );

  return useMemo(
    () => ({ ...router, push, replace, pushWorkspaceDeepLink }),
    [router, push, replace, pushWorkspaceDeepLink],
  );
}
