"use client";

import React, { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  hostnameFromUrl,
  type LinkPreviewPayload,
} from "@/shared/lib/link-preview";

export function LinkOgPreviewBody({
  url,
  preview,
  isLoading = false,
}: {
  url: string;
  preview: LinkPreviewPayload;
  isLoading?: boolean;
}) {
  const title = (preview.title || hostnameFromUrl(url)).trim();
  const imageUrl = preview.image_url;
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  const showImage = Boolean(imageUrl) && !imageFailed;

  return (
    <div className="flex flex-col">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl ?? undefined}
          alt=""
          referrerPolicy="no-referrer"
          className="aspect-[1.91/1] w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : null}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{title}</div>
          {!showImage ? (
            <div className="truncate text-xs text-muted-foreground">
              {hostnameFromUrl(url)}
            </div>
          ) : null}
          {!showImage && isLoading ? (
            <div className="font-mono text-[11px] text-muted-foreground">…</div>
          ) : null}
        </div>
        <OpenUrlButton url={url} />
      </div>
    </div>
  );
}

function OpenUrlButton({ url }: { url: string }) {
  const t = useTranslations("shared.linkPreview");
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("openInBrowser")}
      data-link-preview-open=""
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
}
