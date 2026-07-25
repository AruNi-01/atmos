"use client";

import {
  useRouter as useNextRouter,
  usePathname,
} from "next/navigation";
import { useCallback, useMemo } from "react";

import { useAppNavigationInterceptor } from "./app-navigation-intercept";
import { prepareWorkspaceContextNavigation } from "@/app-shell/workspace-surface-switch";

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

  const push = useCallback(
    (path: string) => {
      if (interceptor?.({ path, kind: "push" })) {
        return;
      }
      const nextPath = normalizePath(path);
      if (nextPath === currentBrowserLocation(pathname)) {
        return;
      }
      // APP-043: inject last tab only — never promote WSC here (blocks click).
      const prepared = prepareWorkspaceContextNavigation(nextPath);
      router.push(prepared);
    },
    [interceptor, normalizePath, pathname, router],
  );

  const replace = useCallback(
    (path: string) => {
      if (interceptor?.({ path, kind: "replace" })) {
        return;
      }
      const nextPath = normalizePath(path);
      if (nextPath === currentBrowserLocation(pathname)) {
        return;
      }
      const prepared = prepareWorkspaceContextNavigation(nextPath);
      router.replace(prepared);
    },
    [interceptor, normalizePath, pathname, router],
  );

  return useMemo(
    () => ({ ...router, push, replace }),
    [router, push, replace],
  );
}
