import { useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import type { MutableRefObject } from "react";

function isTerminalHotkeyTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest(".terminal-mosaic-container"));
}

export function useHeaderHotkeys({
  actionMenuFocusRef,
  isActionMenuOpen,
  setIsActionMenuOpen,
  setIsUsagePopoverOpen,
  showRightSidebar,
  toggleLeftSidebar,
  toggleRightSidebar,
}: {
  actionMenuFocusRef: MutableRefObject<HTMLElement | null>;
  isActionMenuOpen: boolean;
  setIsActionMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsUsagePopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  showRightSidebar: boolean;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
}) {
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
    enableOnFormTags: true,
    preventDefault: true,
    description: "Toggle left sidebar",
  });

  useHotkeys("mod+r", () => window.location.reload(), {
    enableOnFormTags: true,
    preventDefault: true,
    description: "Refresh page",
  });

  useHotkeys("mod+u", () => setIsUsagePopoverOpen((prev) => !prev), {
    enableOnFormTags: true,
    preventDefault: true,
    description: "Toggle AI Usage",
  });

  useHotkeys("mod+shift+m", () => {
    if (!isActionMenuOpen && document.activeElement instanceof HTMLElement) {
      actionMenuFocusRef.current = document.activeElement;
    }
    setIsActionMenuOpen((prev) => !prev);
  }, {
    enableOnFormTags: true,
    preventDefault: true,
    description: "Toggle menu",
  }, [isActionMenuOpen]);

  useHotkeys("mod+shift+b", () => {
    if (showRightSidebar) {
      toggleRightSidebar();
    }
  }, {
    enableOnFormTags: true,
    preventDefault: true,
    description: "Toggle right sidebar",
  });
}
