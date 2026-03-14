"use client";

import {
  useRouter as useNextRouter,
  useParams,
  usePathname,
  useSearchParams,
} from "next/navigation";
import { useCallback, useMemo } from "react";

/**
 * Locale-aware router that auto-prefixes navigation paths with the current
 * locale segment (e.g. `/en/`). Required for static-export (desktop) builds
 * where no middleware runs to handle locale resolution.
 *
 * Safe to use in web (SSR) mode too — the prefix is idempotent.
 */
export function useAppRouter() {
  const router = useNextRouter();
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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

      if (
        process.env.BUILD_TARGET === "desktop" &&
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

  const currentLocation = useMemo(() => {
    const query = searchParams.toString();
    return `${pathname}${query ? `?${query}` : ""}`;
  }, [pathname, searchParams]);

  const push = useCallback(
    (path: string) => {
      const nextPath = normalizePath(path);
      if (nextPath === currentLocation) {
        return;
      }
      router.push(nextPath);
    },
    [currentLocation, normalizePath, router],
  );

  const replace = useCallback(
    (path: string) => {
      const nextPath = normalizePath(path);
      if (nextPath === currentLocation) {
        return;
      }
      router.replace(nextPath);
    },
    [currentLocation, normalizePath, router],
  );

  return useMemo(
    () => ({ ...router, push, replace }),
    [router, push, replace],
  );
}
