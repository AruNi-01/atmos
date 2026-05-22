"use client";

import React from "react";
import { useTheme } from "next-themes";
import {
  DefaultToolbar,
  DefaultToolbarContent,
  PORTRAIT_BREAKPOINT,
  TldrawUiButton,
  TldrawUiButtonIcon,
  TldrawUiRow,
  TldrawUiToolbar,
  useBreakpoint,
  useEditor,
  usePassThroughWheelEvents,
  useTldrawUiComponents,
  useValue,
} from "tldraw";
import {
  PanelBottomClose,
  PanelBottomOpen,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

import { cn } from "@workspace/ui";
import { useCanvasChromePrefs } from "@/hooks/use-canvas-chrome-prefs";

export const CanvasTopLeftToolbarContext = React.createContext<{
  isCollapsed: boolean;
  toggle: () => void;
}>({
  isCollapsed: false,
  toggle: () => {},
});

/**
 * Carries the macOS traffic-lights offset (32px in non-fullscreen Tauri) down
 * to the in-tldraw top menu zone so the left-top menu can shift below the
 * window controls without pushing the entire canvas down.
 */
export const CanvasTopChromePaddingContext = React.createContext<number>(0);

/**
 * Bridges next-themes' Atmos theme into tldraw's user preferences.
 *
 * - Atmos is the source of truth when the app theme *changes*; we do not
 *   overwrite tldraw's restored localStorage prefs on editor mount.
 * - Users can still pick a different theme from tldraw's own menu; that
 *   choice persists (tldraw writes it to `TLDRAW_USER_DATA_v3`) until Atmos
 *   theme changes again.
 */
export function CanvasThemeBridge() {
  const editor = useEditor();
  const { theme } = useTheme();
  const prevThemeRef = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    if (!editor || !theme) return;

    const prevTheme = prevThemeRef.current;
    prevThemeRef.current = theme;

    // Let tldraw restore user prefs from localStorage on first mount.
    if (prevTheme === undefined) return;
    if (prevTheme === theme) return;

    const colorScheme: "light" | "dark" | "system" =
      theme === "dark" ? "dark" : theme === "light" ? "light" : "system";
    editor.user.updateUserPreferences({ colorScheme });
  }, [editor, theme]);

  return null;
}

function CanvasCollapsibleMenuPanel({
  isCollapsed,
  children,
}: {
  isCollapsed: boolean;
  children: React.ReactNode;
}) {
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [contentWidth, setContentWidth] = React.useState(0);

  React.useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) {
      return;
    }

    const updateWidth = () => {
      setContentWidth(element.scrollWidth);
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(() => {
      updateWidth();
    });
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [children]);

  return (
    <div
      aria-hidden={isCollapsed}
      style={{
        width: isCollapsed ? 0 : `${contentWidth}px`,
      }}
      className={cn(
        "origin-left overflow-hidden transition-[width,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        isCollapsed ? "pointer-events-none -mr-2" : "mr-0",
      )}
    >
      <div
        ref={contentRef}
        className={cn(
          "origin-left transition-[opacity,transform,filter] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
          isCollapsed
            ? "translate-x-3 scale-x-95 opacity-0 blur-[1px]"
            : "translate-x-0 scale-x-100 opacity-100 blur-0",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function CanvasMenuPanel() {
  const { isCollapsed } = React.useContext(CanvasTopLeftToolbarContext);
  const topChromePadding = React.useContext(CanvasTopChromePaddingContext);
  const breakpoint = useBreakpoint();
  const ref = React.useRef<HTMLDivElement | null>(null);
  usePassThroughWheelEvents(ref);

  const { MainMenu, QuickActions, ActionsMenu, PageMenu } = useTldrawUiComponents();
  const editor = useEditor();
  const isSinglePageMode = useValue("isSinglePageMode", () => editor.options.maxPages <= 1, [editor]);

  const showQuickActions =
    editor.options.actionShortcutsLocation === "menu"
      ? true
      : editor.options.actionShortcutsLocation === "toolbar"
        ? false
        : breakpoint >= PORTRAIT_BREAKPOINT.TABLET;

  if (!MainMenu && !PageMenu && !showQuickActions) {
    return null;
  }

  return (
    <div
      ref={ref}
      className="tlui-menu-zone pointer-events-auto"
      style={topChromePadding ? { marginTop: topChromePadding } : undefined}
    >
      <TldrawUiToolbar label="Canvas menu" className="tlui-buttons__horizontal">
        <CanvasCollapsibleMenuPanel isCollapsed={isCollapsed}>
          <TldrawUiRow>
            {MainMenu && <MainMenu />}
            {PageMenu && !isSinglePageMode && <PageMenu />}
            {showQuickActions ? (
              <>
                {QuickActions && <QuickActions />}
                {ActionsMenu && <ActionsMenu />}
              </>
            ) : null}
          </TldrawUiRow>
        </CanvasCollapsibleMenuPanel>
        <CanvasTopLeftToolbarToggle />
      </TldrawUiToolbar>
    </div>
  );
}

function CanvasTopLeftToolbarToggle() {
  const { isCollapsed, toggle } = React.useContext(CanvasTopLeftToolbarContext);
  const label = isCollapsed ? "Expand toolbar" : "Collapse toolbar";

  return (
    <TldrawUiButton
      type="icon"
      aria-label={label}
      tooltip={label}
      onClick={toggle}
      className={cn(
        "pointer-events-auto shrink-0 bg-transparent transition-transform duration-300 ease-out",
        "hover:bg-transparent focus:bg-transparent active:bg-transparent",
      )}
    >
      <TldrawUiButtonIcon
        icon={
          <CanvasToolbarIconFrame>
            <PanelLeftClose
              className={cn(
                "absolute left-1/2 top-1/2 size-[14px] -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-out",
                isCollapsed ? "-rotate-90 scale-75 opacity-0" : "rotate-0 scale-100 opacity-100",
              )}
              strokeWidth={1.8}
            />
            <PanelLeftOpen
              className={cn(
                "absolute left-1/2 top-1/2 size-[14px] -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-out",
                isCollapsed ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-75 opacity-0",
              )}
              strokeWidth={1.8}
            />
          </CanvasToolbarIconFrame>
        }
      />
    </TldrawUiButton>
  );
}

function CanvasToolbarIconFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("relative flex size-[14px] items-center justify-center", className)}>
      {children}
    </span>
  );
}

export function CanvasBottomToolbarPeek() {
  const { isBottomToolbarDocked, setIsBottomToolbarDocked } = useCanvasChromePrefs();
  const [isDocked, setIsDocked] = React.useState(isBottomToolbarDocked);
  const [isOpen, setIsOpen] = React.useState(!isBottomToolbarDocked);
  const [shouldRenderToolbar, setShouldRenderToolbar] = React.useState(!isBottomToolbarDocked);
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

  const scheduleClose = React.useCallback(() => {
    if (!isDocked) {
      return;
    }
    cancelClose();
    setIsOpen(false);
    closeTimeoutRef.current = setTimeout(() => {
      setShouldRenderToolbar(false);
      closeTimeoutRef.current = null;
    }, 220);
  }, [cancelClose, isDocked]);

  React.useEffect(() => {
    setIsDocked(isBottomToolbarDocked);
    setIsOpen(!isBottomToolbarDocked);
    setShouldRenderToolbar(!isBottomToolbarDocked);
  }, [isBottomToolbarDocked]);

  const handleToggleDocked = React.useCallback(() => {
    cancelClose();
    setIsDocked((prev) => {
      const next = !prev;
      setIsBottomToolbarDocked(next);
      if (next) {
        setIsOpen(false);
        closeTimeoutRef.current = setTimeout(() => {
          setShouldRenderToolbar(false);
          closeTimeoutRef.current = null;
        }, 220);
      } else {
        setShouldRenderToolbar(true);
        scheduleOpenAfterMount();
      }
      return next;
    });
  }, [cancelClose, scheduleOpenAfterMount, setIsBottomToolbarDocked]);

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
    <div className="pointer-events-auto flex justify-center pb-3">
      <div className="relative flex items-end justify-center">
        {shouldRenderToolbar && (
          <div
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            aria-hidden={isDocked && !isOpen}
            className={cn(
              "absolute bottom-full left-1/2 z-10 w-max max-w-none -translate-x-1/2",
              isDocked && !isOpen
                ? "pointer-events-none opacity-0 transition-opacity duration-220 ease-in"
                : "pointer-events-auto opacity-100 transition-opacity duration-280 ease-[cubic-bezier(0.22,1,0.36,1)]",
            )}
          >
            <div className="absolute left-1/2 top-full h-4 w-24 -translate-x-1/2" />
            <DefaultToolbar
              minItems={8}
              minSizePx={470}
              maxItems={13}
              maxSizePx={980}
            >
              <DefaultToolbarContent />
              <TldrawUiButton
                type="tool"
                aria-label={isDocked ? "Expand bottom toolbar" : "Collapse bottom toolbar"}
                tooltip={isDocked ? "Expand toolbar" : "Collapse toolbar"}
                onClick={handleToggleDocked}
                className="canvas-bottom-toolbar-toggle"
              >
                <TldrawUiButtonIcon
                  icon={
                    <span className="relative flex size-[18px] items-center justify-center">
                      {isDocked ? (
                        <PanelBottomOpen
                          className="absolute left-1/2 top-1/2 size-[18px] -translate-x-1/2 -translate-y-1/2"
                          strokeWidth={1.8}
                        />
                      ) : (
                        <PanelBottomClose
                          className="absolute left-1/2 top-1/2 size-[18px] -translate-x-1/2 -translate-y-1/2"
                          strokeWidth={1.8}
                        />
                      )}
                    </span>
                  }
                />
              </TldrawUiButton>
            </DefaultToolbar>
          </div>
        )}

        <div
          onMouseEnter={() => {
            if (isDocked) {
              openToolbar();
            }
          }}
          className={cn(
            "h-1.5 w-40 rounded-full bg-foreground/20 shadow-[0_1px_8px_rgba(0,0,0,0.18)]",
            isDocked && !isOpen
              ? "transition-opacity duration-220 ease-in"
              : "transition-opacity duration-280 ease-[cubic-bezier(0.22,1,0.36,1)]",
            isDocked && !isOpen
              ? "pointer-events-auto opacity-100"
              : isDocked && isOpen
                ? "pointer-events-none opacity-0"
                : "pointer-events-none opacity-0",
          )}
        />
      </div>
      <style jsx global>{`
        .tlui-main-toolbar__tools .canvas-bottom-toolbar-toggle[data-toolbar-visible="false"] {
          display: flex !important;
        }

        .tlui-main-toolbar__overflow-content .canvas-bottom-toolbar-toggle {
          display: none !important;
        }
      `}</style>
    </div>
  );
}

/**
 * Stable null-renderer for the tldraw `StylePanel` slot. Defining it at module
 * scope keeps the component's identity constant across renders.
 */
export const NullStylePanelSlot = () => null;

export function CanvasAnimatedToolbarGroup({
  isCollapsed,
  children,
}: {
  isCollapsed: boolean;
  children: React.ReactNode;
}) {
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [contentWidth, setContentWidth] = React.useState(0);

  React.useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) {
      return;
    }

    const updateWidth = () => {
      setContentWidth(element.scrollWidth);
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(() => {
      updateWidth();
    });
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [children]);

  return (
    <div
      aria-hidden={isCollapsed}
      style={{ width: isCollapsed ? 0 : `${contentWidth}px` }}
      className={cn(
        "overflow-hidden",
        isCollapsed
          ? "pointer-events-none transition-[width,opacity] duration-260 ease-in"
          : "pointer-events-auto transition-[width,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
      )}
    >
      <div
        ref={contentRef}
        className={cn(
          "flex items-center gap-2 whitespace-nowrap will-change-transform",
          isCollapsed
            ? "translate-x-2 opacity-0 transition-[opacity,transform] duration-180 ease-in"
            : "translate-x-0 opacity-100 transition-[opacity,transform] duration-420 ease-[cubic-bezier(0.22,1,0.36,1)]",
        )}
      >
        {children}
      </div>
    </div>
  );
}
