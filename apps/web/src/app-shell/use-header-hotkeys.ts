import { useCallback, useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useTranslations } from "next-intl";
import type { MutableRefObject } from "react";

function isTerminalHotkeyTarget(target: EventTarget | null) {
  const candidates = [
    target instanceof Node ? target : null,
    document.activeElement,
  ];
  return candidates.some((node) => {
    const element = node instanceof Element ? node : node?.parentElement;
    return Boolean(element?.closest(".terminal-mosaic-container"));
  });
}

export function useHeaderHotkeys({
  actionMenuFocusRef,
  isActionMenuOpen,
  refreshCurrentRoute,
  setIsActionMenuOpen,
  setIsQuotaPopoverOpen,
  showRightSidebar,
  toggleLeftSidebar,
  toggleRightSidebar,
}: {
  actionMenuFocusRef: MutableRefObject<HTMLElement | null>;
  isActionMenuOpen: boolean;
  refreshCurrentRoute?: () => void;
  setIsActionMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsQuotaPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  showRightSidebar: boolean;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
}) {
  const t = useTranslations("header.hotkeys");
  const handleRefreshCurrentRoute = useCallback(() => {
    if (refreshCurrentRoute) {
      refreshCurrentRoute();
      return;
    }
    window.location.reload();
  }, [refreshCurrentRoute]);

  useEffect(() => {
    // Native menu accelerators were removed, so JS handles bracket navigation on web and desktop.
    const handleNavigationHotkey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (isTerminalHotkeyTarget(event.target)) return;

      if (event.key === "[" || event.code === "BracketLeft") {
        event.preventDefault();
        window.history.back();
        return;
      }

      if (event.key === "]" || event.code === "BracketRight") {
        event.preventDefault();
        window.history.forward();
      }
    };

    window.addEventListener("keydown", handleNavigationHotkey, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleNavigationHotkey, { capture: true });
    };
  }, []);

  useHotkeys("mod+b", toggleLeftSidebar, {
    enableOnContentEditable: true,
    enableOnFormTags: true,
    preventDefault: true,
    description: t("toggleLeftSidebar"),
  });

  useHotkeys("mod+r", handleRefreshCurrentRoute, {
    enableOnContentEditable: true,
    enableOnFormTags: true,
    preventDefault: true,
    description: t("refreshPage"),
  }, [handleRefreshCurrentRoute]);

  useHotkeys("mod+u", () => setIsQuotaPopoverOpen((prev) => !prev), {
    enableOnContentEditable: true,
    enableOnFormTags: true,
    preventDefault: true,
    description: t("toggleQuotaUsage"),
  });

  useHotkeys("mod+shift+m", () => {
    if (!isActionMenuOpen && document.activeElement instanceof HTMLElement) {
      actionMenuFocusRef.current = document.activeElement;
    }
    setIsActionMenuOpen((prev) => !prev);
  }, {
    enableOnContentEditable: true,
    enableOnFormTags: true,
    preventDefault: true,
    description: t("toggleMenu"),
  }, [isActionMenuOpen]);

  useHotkeys("mod+shift+b", () => {
    if (showRightSidebar) {
      toggleRightSidebar();
    }
  }, {
    enableOnContentEditable: true,
    enableOnFormTags: true,
    preventDefault: true,
    description: t("toggleRightSidebar"),
  });
}
