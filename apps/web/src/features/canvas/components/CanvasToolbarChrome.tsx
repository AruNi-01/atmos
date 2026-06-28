"use client";

import React from "react";
import { useTranslations } from "next-intl";
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
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";

import { cn } from "@workspace/ui";
import { useCanvasChromePrefs } from "@/features/canvas/hooks/use-canvas-chrome-prefs";

const BOTTOM_TOOLBAR_HIDE_DELAY_MS = 600;
const BOTTOM_TOOLBAR_FADE_MS = 220;

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
 * Atmos is the source of truth on mount and when the app theme changes.
 * tldraw persists its own prefs; without this bridge it can restore a stale
 * light mode after refresh while the rest of Atmos is already dark.
 */
export function CanvasThemeBridge() {
  const editor = useEditor();
  const { resolvedTheme, theme } = useTheme();
  const appliedColorSchemeRef = React.useRef<"light" | "dark" | null>(null);

  React.useEffect(() => {
    if (!editor) return;

    const colorScheme = resolveAtmosCanvasColorScheme(theme, resolvedTheme);
    if (!colorScheme) return;
    if (appliedColorSchemeRef.current === colorScheme) return;

    appliedColorSchemeRef.current = colorScheme;
    editor.user.updateUserPreferences({ colorScheme });
  }, [editor, resolvedTheme, theme]);

  return null;
}

function resolveAtmosCanvasColorScheme(
  theme?: string,
  resolvedTheme?: string,
): "light" | "dark" | null {
  if (resolvedTheme === "dark" || resolvedTheme === "light") {
    return resolvedTheme;
  }

  if (theme === "dark" || theme === "light") {
    return theme;
  }

  if (typeof document === "undefined") {
    return null;
  }

  return document.documentElement.classList.contains("dark") ? "dark" : "light";
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
  const t = useTranslations("canvas.toolbarChrome");
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

  const menuLabel = t("menuLabel");

  return (
    <div
      ref={ref}
      className="tlui-menu-zone pointer-events-auto"
      style={topChromePadding ? { marginTop: topChromePadding } : undefined}
    >
      <TldrawUiToolbar label={menuLabel} className="tlui-buttons__horizontal">
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
  const t = useTranslations("canvas.toolbarChrome");
  const { isCollapsed, toggle } = React.useContext(CanvasTopLeftToolbarContext);
  const label = isCollapsed
    ? t("topLeftToggle.expand")
    : t("topLeftToggle.collapse");

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
        icon={<CanvasToolbarCollapseIcon isCollapsed={isCollapsed} />}
      />
    </TldrawUiButton>
  );
}

export function CanvasToolbarCollapseIcon({
  isCollapsed,
  side = "left",
}: {
  isCollapsed: boolean;
  side?: "left" | "right";
}) {
  const CloseIcon = side === "right" ? PanelRightClose : PanelLeftClose;
  const OpenIcon = side === "right" ? PanelRightOpen : PanelLeftOpen;

  return (
    <CanvasToolbarIconFrame>
      <CloseIcon
        className={cn(
          "absolute left-1/2 top-1/2 size-[14px] -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-out",
          isCollapsed ? "-rotate-90 scale-75 opacity-0" : "rotate-0 scale-100 opacity-100",
        )}
        strokeWidth={1.8}
      />
      <OpenIcon
        className={cn(
          "absolute left-1/2 top-1/2 size-[14px] -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-out",
          isCollapsed ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-75 opacity-0",
        )}
        strokeWidth={1.8}
      />
    </CanvasToolbarIconFrame>
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
  const t = useTranslations("canvas.toolbarChrome");
  const { isBottomToolbarDocked, setIsBottomToolbarDocked } = useCanvasChromePrefs();
  const [isDocked, setIsDocked] = React.useState(isBottomToolbarDocked);
  const [isOpen, setIsOpen] = React.useState(!isBottomToolbarDocked);
  const [shouldRenderToolbar, setShouldRenderToolbar] = React.useState(!isBottomToolbarDocked);
  const closeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeDelayTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const openFrameRef = React.useRef<number | null>(null);

  const cancelClose = React.useCallback(() => {
    if (closeDelayTimeoutRef.current) {
      clearTimeout(closeDelayTimeoutRef.current);
      closeDelayTimeoutRef.current = null;
    }
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
    closeDelayTimeoutRef.current = setTimeout(() => {
      closeDelayTimeoutRef.current = null;
      setIsOpen(false);
      closeTimeoutRef.current = setTimeout(() => {
        setShouldRenderToolbar(false);
        closeTimeoutRef.current = null;
      }, BOTTOM_TOOLBAR_FADE_MS);
    }, BOTTOM_TOOLBAR_HIDE_DELAY_MS);
  }, [cancelClose, isDocked]);

  React.useEffect(() => {
    cancelClose();
    setIsDocked(isBottomToolbarDocked);
    setIsOpen(!isBottomToolbarDocked);
    setShouldRenderToolbar(!isBottomToolbarDocked);
  }, [cancelClose, isBottomToolbarDocked]);

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
        }, BOTTOM_TOOLBAR_FADE_MS);
      } else {
        setShouldRenderToolbar(true);
        scheduleOpenAfterMount();
      }
      return next;
    });
  }, [cancelClose, scheduleOpenAfterMount, setIsBottomToolbarDocked]);

  React.useEffect(() => {
    return () => {
      if (closeDelayTimeoutRef.current) {
        clearTimeout(closeDelayTimeoutRef.current);
      }
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
      if (openFrameRef.current != null) {
        cancelAnimationFrame(openFrameRef.current);
      }
    };
  }, []);

  const bottomToolbarLabel = isDocked
    ? t("bottomToggle.expand")
    : t("bottomToggle.collapse");

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
                aria-label={bottomToolbarLabel}
                tooltip={bottomToolbarLabel}
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
