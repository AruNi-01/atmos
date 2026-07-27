"use client";

import { useCallback, useEffect, useState } from "react";

import { openDesktopExternalUrl } from "@/shared/lib/desktop-external-url";
import { debugLog, errorLog } from "@/shared/lib/desktop-logger";
import {
  clearRuntimeApiConfigCache,
  getRuntimeApiConfig,
  httpBase,
  isDesktopRuntime as detectDesktopRuntime,
} from "@/shared/lib/desktop-runtime";

type DesktopWebStatus = "checking" | "ready" | "unavailable";
type DesktopWebCheckResult = {
  ready: boolean;
  url: string | null;
};

const RETRY_DELAY_MS = 500;
const MAX_ATTEMPTS = 10;

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeBrowserPath(pathname: string) {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (path === "/" || path.endsWith("/")) {
    return path;
  }

  const lastSegment = path.split("/").pop() ?? "";
  return lastSegment.includes(".") ? path : `${path}/`;
}

function browserUrlForConfig(
  cfg: Awaited<ReturnType<typeof getRuntimeApiConfig>>,
  pathname: string,
  search: string,
) {
  const hash = typeof window === "undefined" ? "" : window.location.hash;
  return `${httpBase(cfg)}${normalizeBrowserPath(pathname)}${search}${hash}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Desktop web launcher + shell detection for header actions.
 * `isDesktopRuntime` is re-checked after mount so Electron preload
 * (`window.__ATMOS_DESKTOP__`) is visible even if first paint races.
 */
export function useDesktopWebLauncher(pathname: string, search: string, enabled = true) {
  const [isDesktopRuntime, setIsDesktopRuntime] = useState(false);
  const isActive = isDesktopRuntime && enabled;
  const [status, setStatus] = useState<DesktopWebStatus>("unavailable");
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);

  useEffect(() => {
    const refreshShell = () => {
      const next = detectDesktopRuntime();
      setIsDesktopRuntime(next);
      if (!next) {
        setStatus("unavailable");
        setBrowserUrl(null);
      }
    };
    refreshShell();
    // Preload is usually ready immediately; retry a few times in case of race.
    const t1 = window.setTimeout(refreshShell, 50);
    const t2 = window.setTimeout(refreshShell, 250);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  const checkDesktopWeb = useCallback(async (): Promise<DesktopWebCheckResult> => {
    try {
      const cfg = await getRuntimeApiConfig();
      const url = browserUrlForConfig(cfg, pathname, search);
      debugLog(`desktop-web: resolved via native config url=${url}`);
      setBrowserUrl(url);
      setStatus("ready");
      return { ready: true, url };
    } catch (error) {
      clearRuntimeApiConfigCache();
      setBrowserUrl(null);
      setStatus("unavailable");
      errorLog(`desktop-web: readiness failed err=${errorMessage(error)}`);
      return { ready: false, url: null };
    }
  }, [pathname, search]);

  const refreshStatus = useCallback(async () => {
    if (!detectDesktopRuntime()) {
      setIsDesktopRuntime(false);
      setStatus("unavailable");
      setBrowserUrl(null);
      return false;
    }

    setIsDesktopRuntime(true);
    setStatus((current) => (current === "ready" ? current : "checking"));

    const result = await checkDesktopWeb();
    return result.ready;
  }, [checkDesktopWeb]);

  const openInBrowser = useCallback(async () => {
    if (!detectDesktopRuntime()) {
      return false;
    }

    setIsLaunching(true);

    try {
      let result = await checkDesktopWeb();

      for (let attempt = 1; !result.ready && attempt < MAX_ATTEMPTS; attempt += 1) {
        await delay(RETRY_DELAY_MS);
        result = await checkDesktopWeb();
      }

      if (!result.ready || !result.url) {
        return false;
      }

      const opened = await openDesktopExternalUrl(result.url);
      if (!opened) {
        errorLog(`desktop-web: opener failed url=${result.url}`);
      }
      return opened;
    } finally {
      setIsLaunching(false);
    }
  }, [checkDesktopWeb]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    void refreshStatus();
  }, [isActive, refreshStatus]);

  return {
    browserUrl,
    isDesktopRuntime,
    isLaunching,
    openInBrowser,
    refreshStatus,
    status,
  };
}
