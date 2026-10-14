import React from "react";
import { Button } from "@workspace/ui";
import { LoaderCircle, RotateCw } from "lucide-react";
import { Github } from "@workspace/ui/components/icons/lucide-brand-icons";
import { cn } from "@/shared/lib/utils";

export function ActionsActionBar({
  actionLoading,
  isCompleted,
  isFailure,
  onOpenGitHub,
  onRerunFailed,
  onRerunAll,
}: {
  actionLoading: boolean;
  isCompleted: boolean;
  isFailure: boolean;
  onOpenGitHub: () => void;
  onRerunFailed: () => void;
  onRerunAll: () => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [shouldRenderToolbar, setShouldRenderToolbar] = React.useState(false);
  const closeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const openFrameRef = React.useRef<number | null>(null);

  const cancelClose = React.useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (openFrameRef.current != null) {
      cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = null;
    }
  }, []);

  const scheduleOpenAfterMount = React.useCallback(() => {
    openFrameRef.current = requestAnimationFrame(() => {
      openFrameRef.current = requestAnimationFrame(() => {
        setIsOpen(true);
        openFrameRef.current = null;
      });
    });
  }, []);

  const openToolbar = React.useCallback(() => {
    cancelClose();
    if (shouldRenderToolbar) {
      setIsOpen(true);
      return;
    }
    setShouldRenderToolbar(true);
    scheduleOpenAfterMount();
  }, [cancelClose, scheduleOpenAfterMount, shouldRenderToolbar]);

  const closeToolbar = React.useCallback(() => {
    cancelClose();
    setIsOpen(false);
    closeTimeoutRef.current = setTimeout(() => {
      setShouldRenderToolbar(false);
      closeTimeoutRef.current = null;
    }, 220);
  }, [cancelClose]);

  const scheduleClose = React.useCallback(() => {
    closeToolbar();
  }, [closeToolbar]);

  const handleControlBlur = React.useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        scheduleClose();
      }
    },
    [scheduleClose],
  );

  React.useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
      if (openFrameRef.current != null) {
        cancelAnimationFrame(openFrameRef.current);
      }
    };
  }, []);

  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 justify-center">
      <div
        className="pointer-events-auto relative flex items-end justify-center"
        onBlur={handleControlBlur}
        onMouseLeave={scheduleClose}
      >
        {shouldRenderToolbar && (
          <div
            onMouseEnter={() => {
              cancelClose();
            }}
            onMouseLeave={() => {
              scheduleClose();
            }}
            aria-hidden={!isOpen}
            className={cn(
              "absolute bottom-full left-1/2 z-10 flex max-w-[calc(100vw-3rem)] -translate-x-1/2 items-center gap-6 rounded-xl border border-dashed border-border/80 bg-background/90 px-4 py-2.5 whitespace-nowrap shadow-xl backdrop-blur-md",
              !isOpen
                ? "pointer-events-none opacity-0 transition-opacity duration-220 ease-in"
                : "pointer-events-auto opacity-100 transition-opacity duration-280 ease-[cubic-bezier(0.22,1,0.36,1)]",
            )}
          >
            <div className="absolute top-full left-1/2 h-4 w-24 -translate-x-1/2" />
            <div className="flex gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenGitHub}
                className="h-8 border-0 px-3 text-[11px] font-medium shadow-sm transition-shadow hover:shadow-md"
              >
                <Github className="mr-1.5 size-3.5" />
                GitHub
              </Button>
            </div>

            {isCompleted && (
              <>
                <div className="mx-1 h-5 w-px shrink-0 bg-border/40" />

                <div className="flex gap-2.5">
                  {isFailure && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onRerunFailed}
                      disabled={actionLoading}
                      className="h-8 border-0 px-3 text-[11px] font-medium shadow-sm transition-shadow hover:shadow-md"
                    >
                      {actionLoading ? (
                        <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
                      ) : (
                        <RotateCw className="mr-1.5 size-3.5" />
                      )}
                      Re-run failed jobs
                    </Button>
                  )}

                  <Button
                    variant="default"
                    size="sm"
                    onClick={onRerunAll}
                    disabled={actionLoading}
                    className="h-8 border-0 px-3 text-[11px] font-medium shadow-sm transition-shadow hover:shadow-md"
                  >
                    {actionLoading ? (
                      <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
                    ) : (
                      <RotateCw className="mr-1.5 size-3.5" />
                    )}
                    Re-run all jobs
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        <button
          type="button"
          aria-label="Show workflow actions"
          onClick={openToolbar}
          onFocus={openToolbar}
          onMouseEnter={openToolbar}
          className={cn(
            "h-1.5 w-40 rounded-full border-0 bg-foreground/20 p-0 shadow-[0_1px_8px_rgba(0,0,0,0.18)] focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
            !isOpen
              ? "pointer-events-auto opacity-100 transition-opacity duration-220 ease-in"
              : "pointer-events-none opacity-0 transition-opacity duration-280 ease-[cubic-bezier(0.22,1,0.36,1)]",
          )}
        />
      </div>
    </div>
  );
}
