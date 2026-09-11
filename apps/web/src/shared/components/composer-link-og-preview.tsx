"use client";

import React, { useEffect, useState } from "react";
import { LinkOgPreviewBody } from "@/shared/components/link-og-preview-body";
import {
  localLinkPreviewFallback,
  type LinkPreviewPayload,
} from "@/shared/lib/link-preview";

export function ComposerLinkOgPreview({ url }: { url: string }) {
  const fallback = localLinkPreviewFallback(url);
  const [preview, setPreview] = useState<LinkPreviewPayload>(fallback);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setPreview(localLinkPreviewFallback(url));
    setIsLoading(true);
    void import("@/shared/lib/link-preview-query")
      .then(({ peekLinkPreview, fetchLinkPreview }) => {
        const cached = peekLinkPreview(url);
        if (cached) {
          if (!cancelled) {
            setPreview(cached);
            setIsLoading(false);
          }
          return null;
        }
        return fetchLinkPreview(url);
      })
      .then((data) => {
        if (cancelled || !data) return;
        setPreview(data);
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return <LinkOgPreviewBody url={url} preview={preview} isLoading={isLoading} />;
}
