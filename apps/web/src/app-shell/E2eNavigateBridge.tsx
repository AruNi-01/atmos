"use client";

import { useEffect } from "react";
import { useAppRouter } from "@/shared/hooks/use-app-router";

declare global {
  interface Window {
    __atmosNavigate?: (href: string) => void;
  }
}

/**
 * Exposes client soft-navigation for Playwright E2E (APP-043 warm cache requires SPA nav).
 * No UI; production-safe (tiny side effect on window).
 */
export function E2eNavigateBridge() {
  const router = useAppRouter();

  useEffect(() => {
    window.__atmosNavigate = (href: string) => {
      router.push(href);
    };
    return () => {
      delete window.__atmosNavigate;
    };
  }, [router]);

  return null;
}
