"use client";

import { useRouter as useNextRouter, useParams } from "next/navigation";
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
  const locale = (params?.locale as string) || "en";

  const prefixPath = useCallback(
    (path: string) => {
      if (
        path.startsWith(`/${locale}/`) ||
        path.startsWith(`/${locale}?`) ||
        path === `/${locale}`
      ) {
        return path;
      }
      return `/${locale}${path.startsWith("/") ? path : `/${path}`}`;
    },
    [locale],
  );

  const push = useCallback(
    (path: string) => router.push(prefixPath(path)),
    [router, prefixPath],
  );

  const replace = useCallback(
    (path: string) => router.replace(prefixPath(path)),
    [router, prefixPath],
  );

  return useMemo(
    () => ({ ...router, push, replace }),
    [router, push, replace],
  );
}
