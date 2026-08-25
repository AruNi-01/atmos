"use client";

import React from "react";
import {
  paintCenterSpaceTerminalOverlay,
  queryCenterSpaceFrame,
  queryCenterWorkArea,
  THUMB_HEIGHT,
  THUMB_WIDTH,
} from "@/app-shell/center-space/center-space-thumbnail";

const LIVE_MS = 480;

export function CenterSpacePreview({
  hostId,
  spaceId,
  thumbnailDataUrl,
  live,
  emptyLabel,
}: {
  hostId: string;
  spaceId: string;
  thumbnailDataUrl?: string | null;
  live: boolean;
  emptyLabel: string;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [overlayReady, setOverlayReady] = React.useState(false);

  React.useEffect(() => {
    if (!live) {
      setOverlayReady(false);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    const paint = () => {
      if (cancelled) return false;
      const frame =
        queryCenterWorkArea() ?? queryCenterSpaceFrame(hostId, spaceId);
      if (!frame) return false;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.round(THUMB_WIDTH * dpr);
      const height = Math.round(THUMB_HEIGHT * dpr);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      return paintCenterSpaceTerminalOverlay(ctx, frame, width, height);
    };

    const run = () => {
      setOverlayReady(paint());
    };
    run();
    const interval = window.setInterval(run, LIVE_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [hostId, live, spaceId]);

  const showImg = Boolean(thumbnailDataUrl);
  const showEmpty = !thumbnailDataUrl && !overlayReady;

  return (
    <>
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element -- cached JPEG screenshot
        <img
          src={thumbnailDataUrl ?? ""}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full object-contain"
        />
      ) : null}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full"
        style={{ opacity: overlayReady ? 1 : 0 }}
        aria-hidden="true"
      />
      {showEmpty ? (
        <div className="flex size-full items-center justify-center text-[11px] text-muted-foreground">
          {emptyLabel}
        </div>
      ) : null}
    </>
  );
}
