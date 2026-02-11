"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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

export function MermaidViewerModal({
  open,
  onOpenChange,
  svgContent,
  isDark,
}: MermaidViewerModalProps) {
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: scrollContainerRef.current?.scrollLeft ?? 0,
      scrollTop: scrollContainerRef.current?.scrollTop ?? 0,
    };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !scrollContainerRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      scrollContainerRef.current.scrollLeft =
        dragStartRef.current.scrollLeft - dx;
      scrollContainerRef.current.scrollTop =
        dragStartRef.current.scrollTop - dy;
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (!open) setZoom(1);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[95vw] sm:max-w-[95vw] max-h-[95vh] w-[min(1600px,95vw)] h-[min(900px,92vh)] p-0 overflow-hidden flex flex-col"
      >
        <DialogTitle className="sr-only">Mermaid Diagram</DialogTitle>
        {/* Toolbar */}
        <div className="flex items-center justify-end gap-1 px-3 py-2 shrink-0">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= MIN_ZOOM}
            className="size-8 flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Zoom out"
          >
            <Minus className="size-4" />
          </button>
          <span className="text-xs text-muted-foreground min-w-[3ch] text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= MAX_ZOOM}
            className="size-8 flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Zoom in"
          >
            <Plus className="size-4" />
          </button>
          <button
            onClick={() => onOpenChange(false)}
            className="size-8 flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer"
            title="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Canvas area - scrollable when zoomed */}
        <div
          ref={scrollContainerRef}
          className={cn(
            "flex-1 overflow-auto",
            isDragging ? "cursor-grabbing" : "cursor-grab"
          )}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
          <div
            className="flex items-center justify-center p-8"
            style={{
              width: 1100 * zoom,
              height: 850 * zoom,
              minWidth: 1100 * zoom,
              minHeight: 850 * zoom,
            }}
          >
            <div
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "center center",
                width: 1100,
                height: 850,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                className="inline-block bg-background"
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
