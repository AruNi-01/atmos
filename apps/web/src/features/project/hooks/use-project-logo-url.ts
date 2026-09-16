"use client";

import React from "react";
import { getRuntimeApiConfig, httpBase } from "@/shared/lib/desktop-runtime";

export function isDirectLogoSource(value: string): boolean {
  return /^(https?:|data:)/i.test(value.trim());
}

export function useProjectLogoUrl(logoPath: string | null): {
  logoUrl: string | null;
  hasLogoLoadError: boolean;
  onLogoError: () => void;
} {
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);
  const [hasLogoLoadError, setHasLogoLoadError] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setHasLogoLoadError(false);
    if (!logoPath) {
      setLogoUrl(null);
      return () => {
        cancelled = true;
      };
    }

    setLogoUrl(null);
    if (isDirectLogoSource(logoPath)) {
      setLogoUrl(logoPath);
      return () => {
        cancelled = true;
      };
    }

    void getRuntimeApiConfig()
      .then((config) => {
        if (cancelled) return;
        const params = new URLSearchParams({ path: logoPath });
        if (config.token) params.set("token", config.token);
        setLogoUrl(`${httpBase(config)}/api/system/file?${params.toString()}`);
      })
      .catch(() => {
        if (cancelled) return;
        setLogoUrl(null);
        setHasLogoLoadError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [logoPath]);

  return {
    logoUrl,
    hasLogoLoadError,
    onLogoError: () => setHasLogoLoadError(true),
  };
}
