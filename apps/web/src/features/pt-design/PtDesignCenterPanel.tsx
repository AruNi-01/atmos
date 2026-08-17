"use client";

import React from "react";
import { useTheme } from "next-themes";
import { PtDesignApp, type PersistenceAdapter } from "@atmos/pt-design";

function contextPersistence(contextId: string): PersistenceAdapter {
  const key = `pt-design:scene:${contextId}`;
  return {
    async load() {
      if (typeof localStorage === "undefined") return null;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as { scene: Parameters<PersistenceAdapter["save"]>[0]["scene"] };
      } catch {
        return null;
      }
    },
    async save(input) {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(key, JSON.stringify({ scene: input.scene }));
    },
  };
}

export function PtDesignCenterPanel({ contextId }: { contextId: string }) {
  const persistence = React.useMemo(() => contextPersistence(contextId), [contextId]);
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  return (
    <div
      className="h-full min-h-0 w-full bg-background text-foreground"
      data-testid="pt-design-center"
      data-theme={theme}
    >
      <PtDesignApp
        theme={theme}
        persistence={persistence}
        storageKey={`pt-design:scene:${contextId}`}
        className="h-full min-h-0"
      />
    </div>
  );
}
