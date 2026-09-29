"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useQueryState } from "nuqs";
import { ptDesignParams } from "@/shared/lib/nuqs/searchParams";
import {
  ptDesignDocExists,
  readPtDesignLastOpen,
  resolvePtDesignOpenTarget,
  writePtDesignLastOpen,
} from "./pt-design-last-open";

/**
 * Remember the open Prototype Design canvas per launchpad or workspace frame.
 * The `design` query is not kept across route and workspace changes.
 */
export function usePtDesignRememberedDesign(scope: string, enabled = true) {
  const [urlDesign, setUrlDesign] = useQueryState("design", ptDesignParams.design);
  const [design, setDesign] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const scopeRef = useRef<string | null>(null);
  const closedRef = useRef(false);

  useLayoutEffect(() => {
    if (!enabled) return;
    if (closedRef.current) {
      if ((urlDesign ?? null) !== null) return;
      closedRef.current = false;
    }
    const scopeChanged = scopeRef.current !== null && scopeRef.current !== scope;
    scopeRef.current = scope;
    const stored = readPtDesignLastOpen(scope);
    const next = resolvePtDesignOpenTarget({
      urlDesign: urlDesign ?? null,
      stored,
      scopeChanged,
      docExists: ptDesignDocExists,
    });
    if (next.persist !== stored) writePtDesignLastOpen(scope, next.persist);
    setDesign(next.design);
    setReady(true);
    if ((urlDesign ?? null) !== next.design) void setUrlDesign(next.design);
  }, [enabled, scope, setUrlDesign, urlDesign]);

  const closeDesign = useCallback(() => {
    closedRef.current = true;
    writePtDesignLastOpen(scope, null);
    setDesign(null);
    setReady(true);
    void setUrlDesign(null);
  }, [scope, setUrlDesign]);

  return {
    design: ready ? design : null,
    ready: enabled ? ready : true,
    closeDesign,
  };
}
