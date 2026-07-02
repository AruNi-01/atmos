"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { openDesktopExternalUrl } from "@/shared/lib/desktop-external-url";
import {
  clearRuntimeApiConfigCache,
  getRuntimeApiConfig,
  httpBase,
  isTauriRuntime,
  type ApiConfig,
} from "@/shared/lib/desktop-runtime";

type DesktopWebStatus = "checking" | "ready" | "unavailable";

const RETRY_DELAY_MS = 500;
const MAX_ATTEMPTS = 10;

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function browserUrlForConfig(cfg: ApiConfig, pathname: string, search: string) {
  const hash = typeof window === "undefined" ? "" : window.location.hash;
  return `${httpBase(cfg)}${pathname}${search}${hash}`;
}

async function checkHealth(cfg: ApiConfig) {
  const response = await fetch(`${httpBase(cfg)}/healthz`, {
    cache: "no-store",
    headers: cfg.token
      ? {
          Authorization: `Bearer ${cfg.token}`,
        }
      : undefined,
  });
  return response.ok;
}

export function useDesktopWebLauncher(pathname: string, search: string) {
  const isDesktopRuntime = useMemo(() => isTauriRuntime(), []);
  const [status, setStatus] = useState<DesktopWebStatus>(
    isDesktopRuntime ? "checking" : "unavailable",
  );
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);

  const resolveBrowserUrl = useCallback(async () => {
    const cfg = await getRuntimeApiConfig();
    return browserUrlForConfig(cfg, pathname, search);
  }, [pathname, search]);

  const refreshStatus = useCallback(async () => {
    if (!isDesktopRuntime) {
      setStatus("unavailable");
      setBrowserUrl(null);
      return false;
    }

    setStatus((current) => (current === "ready" ? current : "checking"));

    try {
      let cfg = await getRuntimeApiConfig();
      let healthy = await checkHealth(cfg);

      if (!healthy) {
        clearRuntimeApiConfigCache();
        cfg = await getRuntimeApiConfig();
        healthy = await checkHealth(cfg);
      }

      const url = browserUrlForConfig(cfg, pathname, search);
      setBrowserUrl(url);
      setStatus(healthy ? "ready" : "unavailable");
      return healthy;
    } catch {
      clearRuntimeApiConfigCache();
      setStatus("unavailable");
      return false;
    }
  }, [isDesktopRuntime, pathname, search]);

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

      const url = await resolveBrowserUrl();
      return openDesktopExternalUrl(url);
    } finally {
      setIsLaunching(false);
    }
  }, [isDesktopRuntime, refreshStatus, resolveBrowserUrl]);

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
