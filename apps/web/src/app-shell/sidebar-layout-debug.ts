"use client";

import { getDebugLogger } from "@atmos/shared/debug/debug-logger";
import { getRuntimeHttpConfig, httpBase } from "@/shared/lib/desktop-runtime";

let loggerPromise: ReturnType<typeof getLogger> | null = null;

async function getLogger() {
  const cfg = await getRuntimeHttpConfig();
  return getDebugLogger("sidebar-layout", httpBase(cfg));
}

export function logSidebarLayout(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;

  loggerPromise ??= getLogger();
  loggerPromise
    .then((logger) => logger.log(category, message, data))
    .catch(() => {
      // Debug logging must never affect layout behavior.
    });
}
