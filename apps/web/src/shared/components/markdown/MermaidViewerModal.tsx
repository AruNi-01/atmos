"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogTitle, cn } from "@workspace/ui";
import { Minus, Plus, X } from "lucide-react";

interface MermaidViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  svgContent: string;
  isDark: boolean;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

function makeScalableSvg(svg: string): string {
  const widthMatch = svg.match(/<svg[^>]*\swidth="([\d.]+)"/);
  const heightMatch = svg.match(/<svg[^>]*\sheight="([\d.]+)"/);
  if (!widthMatch || !heightMatch) return svg;

  const w = widthMatch[1];
  const h = heightMatch[1];

  let result = svg;
  if (!/<svg[^>]*\sviewBox=/.test(result)) {
    result = result.replace("<svg", `<svg viewBox="0 0 ${w} ${h}"`);
  }
  result = result.replace(/(<svg[^>]*)\swidth="[\d.]+"/, "$1");
  result = result.replace(/(<svg[^>]*)\sheight="[\d.]+"/, "$1");
  result = result.replace("<svg", '<svg width="100%" height="100%"');
  return result;
}

export function MermaidViewerModal({
  open,
  onOpenChange,
  svgContent,
  isDark,
}: MermaidViewerModalProps) {
  const t = useTranslations("shared.mermaidViewer");
  const [zoom, setZoom] = useState(1);
  const [zoomInput, setZoomInput] = useState("100");
  const [isEditingZoom, setIsEditingZoom] = useState(false);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const scalableSvg = useMemo(() => makeScalableSvg(svgContent), [svgContent]);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, translateX: 0, translateY: 0 });
  const zoomInputRef = useRef<HTMLInputElement>(null);

  const applyZoom = useCallback((value: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
    setZoom(clamped);
    setZoomInput(String(Math.round(clamped * 100)));
  }, []);

  const handleZoomIn = useCallback(() => {
    applyZoom(zoom + ZOOM_STEP);
  }, [zoom, applyZoom]);

  const handleZoomOut = useCallback(() => {
    applyZoom(zoom - ZOOM_STEP);
  }, [zoom, applyZoom]);

  const handleZoomInputCommit = useCallback(() => {
    const parsed = parseInt(zoomInput, 10);
    if (!isNaN(parsed) && parsed > 0) {
      applyZoom(parsed / 100);
    } else {
      setZoomInput(String(Math.round(zoom * 100)));
    }
    setIsEditingZoom(false);
  }, [zoomInput, zoom, applyZoom]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        translateX: translate.x,
        translateY: translate.y,
      };
    },
    [translate],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setTranslate({
        x: dragStartRef.current.translateX + dx,
        y: dragStartRef.current.translateY + dy,
      });
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setZoom(1);
      setZoomInput("100");
      setIsEditingZoom(false);
      setTranslate({ x: 0, y: 0 });
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(900px,92vh)] max-h-[95vh] w-[min(1600px,95vw)] max-w-[95vw] flex-col overflow-hidden p-0 sm:max-w-[95vw]"
      >
        <DialogTitle className="sr-only">{t("title")}</DialogTitle>
        {/* Toolbar */}
        <div className="flex shrink-0 items-center justify-end gap-1 px-3 py-2">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= MIN_ZOOM}
            className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            title={t("zoomOut")}
          >
            <Minus className="size-4" />
          </button>
          {isEditingZoom ? (
            <div className="flex items-center">
              <input
                ref={zoomInputRef}
                type="text"
                inputMode="numeric"
                value={zoomInput}
                onChange={(e) => setZoomInput(e.target.value.replace(/[^\d]/g, ""))}
                onBlur={handleZoomInputCommit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleZoomInputCommit();
                  if (e.key === "Escape") {
                    setZoomInput(String(Math.round(zoom * 100)));
                    setIsEditingZoom(false);
                  }
                }}
                className="w-10 rounded border border-border bg-transparent px-1 py-0.5 text-center text-xs text-foreground tabular-nums outline-none focus:border-ring"
                autoFocus
              />
              <span className="ml-0.5 text-xs text-muted-foreground">%</span>
            </div>
          ) : (
            <button
              onClick={() => {
                setIsEditingZoom(true);
                setZoomInput(String(Math.round(zoom * 100)));
              }}
              className="min-w-[3ch] cursor-pointer text-center text-xs text-muted-foreground tabular-nums hover:text-foreground"
              title={t("editZoom")}
            >
              {Math.round(zoom * 100)}%
            </button>
          )}
          <button
            onClick={handleZoomIn}
            disabled={zoom >= MAX_ZOOM}
            className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            title={t("zoomIn")}
          >
            <Plus className="size-4" />
          </button>
          <button
            onClick={() => onOpenChange(false)}
            className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            title={t("close")}
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Canvas area - drag to pan */}
        <div
          className={cn(
            "relative flex-1 overflow-hidden",
            isDragging ? "cursor-grabbing" : "cursor-grab",
          )}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              padding: 16,
              boxSizing: "border-box",
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${zoom})`,
              transformOrigin: "center center",
            }}
            className="bg-background"
            dangerouslySetInnerHTML={{ __html: scalableSvg }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
