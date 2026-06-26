"use client";

import {
  useRouter as useNextRouter,
  useParams,
  usePathname,
} from "next/navigation";
import { useCallback, useMemo } from "react";

import { useAppNavigationInterceptor } from "./app-navigation-intercept";

function currentBrowserLocation(fallbackPathname: string): string {
  if (typeof window === "undefined") {
    return fallbackPathname;
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/**
 * Locale-aware router that auto-prefixes navigation paths with the current
 * locale segment (e.g. `/en/`). Required for static-export builds
 * where no middleware runs to handle locale resolution.
 *
 * Safe to use in web (SSR) mode too — the prefix is idempotent.
 */
export function useAppRouter() {
  const router = useNextRouter();
  const params = useParams();
  const pathname = usePathname();
  const interceptor = useAppNavigationInterceptor();
  const locale = (params?.locale as string) || "en";

  const normalizePath = useCallback(
    (path: string) => {
      const [pathAndQuery, hash = ""] = path.split("#", 2);
      const [rawPathname, rawQuery = ""] = pathAndQuery.split("?", 2);

      let nextPathname = rawPathname;

      if (
        nextPathname.startsWith(`/${locale}/`) ||
        nextPathname === `/${locale}`
      ) {
        // Already locale-prefixed.
      } else {
        nextPathname = `/${locale}${nextPathname.startsWith("/") ? nextPathname : `/${nextPathname}`}`;
      }

      const isStaticExportBuild =
        process.env.BUILD_TARGET === "desktop" ||
        process.env.BUILD_TARGET === "local-web" ||
        process.env.BUILD_TARGET === "pages";

      if (
        isStaticExportBuild &&
        nextPathname !== `/${locale}` &&
        nextPathname !== `/${locale}/` &&
        !nextPathname.endsWith("/")
      ) {
        nextPathname = `${nextPathname}/`;
      }

      const query = rawQuery ? `?${rawQuery}` : "";
      const nextHash = hash ? `#${hash}` : "";
      return `${nextPathname}${query}${nextHash}`;
    },
    [locale],
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
      router.push(nextPath);
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
      router.replace(nextPath);
    },
    [interceptor, normalizePath, pathname, router],
  );

  return useMemo(
    () => ({ ...router, push, replace }),
    [router, push, replace],
  );
}
