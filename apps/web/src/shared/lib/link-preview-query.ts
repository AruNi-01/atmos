"use client";

import { queryKeys } from "@/api/query/query-keys";
import {
  wsQueryOptions,
} from "@/api/query/computer-query-options";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import { wsRequest } from "@/api/ws/request";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import type { LinkPreviewPayload as WireLinkPreviewPayload } from "@atmos/api-types/ws/dto/link-preview";
import {
  googleFaviconUrl,
  hostnameFromUrl,
  normalizeHttpUrl,
  type LinkPreviewPayload,
} from "@/shared/lib/link-preview";

type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

const PREVIEW_CACHE = new Map<string, LinkPreviewPayload>();
const PREVIEW_INFLIGHT = new Map<string, Promise<LinkPreviewPayload>>();

function fromWire(payload: WireLinkPreviewPayload): LinkPreviewPayload {
  const url = payload.url;
  return {
    url,
    title: payload.title?.trim() || hostnameFromUrl(url),
    description: payload.description?.trim() || null,
    image_url: payload.image_url?.trim() || null,
    favicon_url: payload.favicon_url?.trim() || googleFaviconUrl(url),
    site_name: payload.site_name?.trim() || hostnameFromUrl(url),
  };
}

export function prefetchOgImage(url: string | null | undefined): void {
  if (!url || typeof window === "undefined") return;
  const image = new Image();
  image.referrerPolicy = "no-referrer";
  image.decoding = "async";
  image.src = url;
}

export async function fetchLinkPreview(url: string): Promise<LinkPreviewPayload> {
  const normalized = normalizeHttpUrl(url);
  if (!normalized) {
    throw new Error("Invalid preview URL");
  }
  const cached = PREVIEW_CACHE.get(normalized);
  if (cached) return cached;
  const inflight = PREVIEW_INFLIGHT.get(normalized);
  if (inflight) return inflight;

  if (useWebSocketStore.getState().connectionState !== "connected") {
    throw new Error("WebSocket is not connected");
  }

  const pending = wsRequest("link_preview", { url: normalized })
    .then((payload) => {
      const preview = fromWire(payload);
      PREVIEW_CACHE.set(normalized, preview);
      PREVIEW_INFLIGHT.delete(normalized);
      prefetchOgImage(preview.image_url);
      prefetchOgImage(preview.favicon_url);
      return preview;
    })
    .catch((error: unknown) => {
      PREVIEW_INFLIGHT.delete(normalized);
      throw error;
    });
  PREVIEW_INFLIGHT.set(normalized, pending);
  return pending;
}

export function peekLinkPreview(url: string): LinkPreviewPayload | null {
  const normalized = normalizeHttpUrl(url);
  if (!normalized) return null;
  return PREVIEW_CACHE.get(normalized) ?? null;
}

export function linkPreviewQueryOptions(
  scope: ComputerQueryScope,
  connectionState: ConnectionState,
  params: { url: string },
  options?: { enabled?: boolean },
) {
  const url = normalizeHttpUrl(params.url) ?? "";
  return wsQueryOptions({
    scope,
    connectionState,
    queryKey: queryKeys.computer.linkPreview(scope, { url }),
    queryFn: (): Promise<LinkPreviewPayload> => fetchLinkPreview(url),
    staleTime: 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
    enabled: (options?.enabled ?? true) && Boolean(url),
  });
}
