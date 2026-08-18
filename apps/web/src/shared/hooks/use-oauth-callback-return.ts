"use client";

import { useEffect, useState } from "react";
import {
  resolveOAuthCallbackReturnFromWindow,
  type OAuthReturnContext,
} from "@/shared/lib/oauth-callback-return";

const FALLBACK: OAuthReturnContext = { client: "web", returnTo: "/" };

/** Resolve after mount so static prerender does not mismatch the system-browser tab. */
export function useOAuthCallbackReturn(
  params: { get: (key: string) => string | null },
  opts?: { state?: string | null },
): { ctx: OAuthReturnContext; ready: boolean } {
  const [ctx, setCtx] = useState<OAuthReturnContext>(FALLBACK);
  const [ready, setReady] = useState(false);
  const state = opts?.state ?? null;
  useEffect(() => {
    setCtx(resolveOAuthCallbackReturnFromWindow(params, { state }));
    setReady(true);
  }, [params, state]);
  return { ctx, ready };
}
