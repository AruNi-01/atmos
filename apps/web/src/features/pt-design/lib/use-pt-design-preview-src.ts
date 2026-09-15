"use client";

import React from "react";
import {
  getPreviewBlob,
  getPreviewObjectUrl,
  isLiveRasterPreview,
  isPreviewBlobPointer,
  isSketchWireframePreview,
  previewBlobId,
} from "@atmos/pt-design/catalog";

export function usePtDesignPreviewSrc(preview: string | undefined): string | undefined {
  const inline =
    preview && isLiveRasterPreview(preview) && !isPreviewBlobPointer(preview) ? preview : undefined;
  const pointerId = isPreviewBlobPointer(preview) ? previewBlobId(preview) : null;
  const cached = pointerId ? getPreviewObjectUrl(pointerId) : undefined;
  const [src, setSrc] = React.useState<string | undefined>(inline ?? cached);

  React.useEffect(() => {
    if (inline) {
      setSrc(inline);
      return;
    }
    if (!preview || isSketchWireframePreview(preview) || !pointerId) {
      setSrc(undefined);
      return;
    }
    const ready = getPreviewObjectUrl(pointerId);
    if (ready) {
      setSrc(ready);
      return;
    }
    let cancelled = false;
    void getPreviewBlob(pointerId).then((blob) => {
      if (cancelled) return;
      if (!blob) {
        setSrc(undefined);
        return;
      }
      setSrc(getPreviewObjectUrl(pointerId));
    });
    return () => {
      cancelled = true;
    };
  }, [inline, pointerId, preview]);

  return inline ?? cached ?? src;
}
