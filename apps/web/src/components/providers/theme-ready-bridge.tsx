"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { isTauriRuntime } from "@/lib/desktop-runtime";

export function ThemeReadyBridge() {
  const { resolvedTheme } = useTheme();
  const emittedRef = useRef(false);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    if (!resolvedTheme) return;
    if (emittedRef.current) return;

    emittedRef.current = true;

    import("@tauri-apps/api/event")
      .then(({ emit }) => emit("frontend://theme-ready"))
      .catch(() => {
        emittedRef.current = false;
      });
  }, [resolvedTheme]);

  return null;
}
