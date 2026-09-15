"use client";

import React from "react";
import { useQueryState } from "nuqs";
import { ptDesignParams } from "@/shared/lib/nuqs/searchParams";
import { listedDesignTitle } from "./pt-design-overview";

/** Workspace / project tab title: saved design name when a board is open. */
export function usePtDesignOpenTitle(fallback: string, untitled: string): string {
  const [design] = useQueryState("design", ptDesignParams.design);
  return React.useMemo(() => {
    if (!design) return fallback;
    return listedDesignTitle(design, untitled) ?? untitled;
  }, [design, fallback, untitled]);
}
