"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { getRuntimeHttpBase, systemApi } from "@/api/rest-api";
import { openDesktopExternalUrl } from "@/lib/desktop-external-url";
import { isTauriRuntime } from "@/lib/desktop-runtime";

type DesktopWebStatus = "checking" | "ready" | "unavailable";

const RETRY_DELAY_MS = 500;
const MAX_ATTEMPTS = 10;

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function useDesktopWebLauncher(pathname: string, search: string) {
  const isDesktopRuntime = useMemo(() => isTauriRuntime(), []);
  const [status, setStatus] = useState<DesktopWebStatus>(
    isDesktopRuntime ? "checking" : "unavailable",
  );
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);

  const resolveBrowserUrl = useCallback(async () => {
    const baseUrl = await getRuntimeHttpBase();
    const hash = typeof window === "undefined" ? "" : window.location.hash;
    return `${baseUrl}${pathname}${search}${hash}`;
  }, [pathname, search]);

  const refreshStatus = useCallback(async () => {
    if (!isDesktopRuntime) {
      setStatus("unavailable");
      setBrowserUrl(null);
      return false;
    }

    setStatus((current) => (current === "ready" ? current : "checking"));

    try {
      const [healthy, url] = await Promise.all([
        systemApi.checkHealth(),
        resolveBrowserUrl(),
      ]);
      setBrowserUrl(url);
      setStatus(healthy ? "ready" : "unavailable");
      return healthy;
    } catch {
      setStatus("unavailable");
      return false;
    }
  }, [isDesktopRuntime, resolveBrowserUrl]);

  const openInBrowser = useCallback(async () => {
    if (!isDesktopRuntime) {
      return false;
    }

    setIsLaunching(true);

    try {
      let ready = await refreshStatus();

      for (let attempt = 1; !ready && attempt < MAX_ATTEMPTS; attempt += 1) {
        await delay(RETRY_DELAY_MS);
        ready = await refreshStatus();
      }

      if (!ready) {
        return false;
      }

      const url = browserUrl ?? (await resolveBrowserUrl());
      return openDesktopExternalUrl(url);
    } finally {
      setIsLaunching(false);
    }
  }, [browserUrl, isDesktopRuntime, refreshStatus, resolveBrowserUrl]);

  useEffect(() => {
    if (!isDesktopRuntime) {
      return;
    }

    void refreshStatus();
  }, [isDesktopRuntime, refreshStatus]);

  return {
    browserUrl,
    isDesktopRuntime,
    isLaunching,
    openInBrowser,
    refreshStatus,
    status,
  };
}
