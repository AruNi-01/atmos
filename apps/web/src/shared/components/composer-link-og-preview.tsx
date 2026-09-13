"use client";

import React, { useEffect, useState } from "react";
import { LinkOgPreviewBody } from "@/shared/components/link-og-preview-body";
import {
  localLinkPreviewFallback,
  type LinkPreviewPayload,
} from "@/shared/lib/link-preview";
import {
  fetchLinkPreview,
  peekLinkPreview,
} from "@/shared/lib/link-preview-query";

export function ComposerLinkOgPreview({ url }: { url: string }) {
  const cached = peekLinkPreview(url);
  const fallback = cached ?? localLinkPreviewFallback(url);
  const [preview, setPreview] = useState<LinkPreviewPayload>(fallback);
  const [isLoading, setIsLoading] = useState(!cached);

  useEffect(() => {
    let cancelled = false;
    const existing = peekLinkPreview(url);
    if (existing) {
      setPreview(existing);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setPreview(localLinkPreviewFallback(url));
    setIsLoading(true);
    void fetchLinkPreview(url)
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
