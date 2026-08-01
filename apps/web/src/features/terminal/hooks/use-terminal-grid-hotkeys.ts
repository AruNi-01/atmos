"use client";

import React from "react";

import { useTerminalRichInputSettingsStore } from "@/features/settings/store/terminal-rich-input-settings-store";
import { isTerminalAgentInputPinShortcut, isTerminalAgentInputShortcut } from "../lib/terminal-runtime-utils";

type UseTerminalGridHotkeysOptions = {
  terminalHotkeyScopeRef: React.RefObject<HTMLDivElement | null>;
  focusPaneByOffset: (offset: 1 | -1) => void;
  getFocusedPaneId: () => string | null;
  onNewTerminalTab?: () => void;
  onToggleMaximize: (id: string) => void;
  pinPaneToCanvas: (id?: string | null) => void;
  requestCloseTerminal: (id?: string | null) => void;
  splitFocusedTerminal: (direction: "row" | "column") => void;
  toggleFocusedAgentInput: () => void;
  togglePinFocusedAgentInput: () => void;
};

export function useTerminalGridHotkeys({
  terminalHotkeyScopeRef,
  focusPaneByOffset,
  getFocusedPaneId,
  onNewTerminalTab,
  onToggleMaximize,
  pinPaneToCanvas,
  requestCloseTerminal,
  splitFocusedTerminal,
  toggleFocusedAgentInput,
  togglePinFocusedAgentInput,
}: UseTerminalGridHotkeysOptions) {
  const richInputEnabled = useTerminalRichInputSettingsStore((s) => s.enabled);

  React.useEffect(() => {
    const handleTerminalNavigationHotkey = (event: KeyboardEvent) => {
      const container = terminalHotkeyScopeRef.current;
      if (!container || container.getClientRects().length === 0) return;
      const eventTarget = event.target instanceof Node ? event.target : null;
      const activeTarget = document.activeElement;
      const isSideChatTarget = (target: Element | null) => {
        return !!target && !!target.closest("[data-side-chat-modal='true']");
      };
      const isTerminalEventTarget =
        (eventTarget !== null && container.contains(eventTarget)) ||
        (activeTarget !== null && container.contains(activeTarget));
      if (!isTerminalEventTarget || isSideChatTarget(eventTarget instanceof Element ? eventTarget : null) || isSideChatTarget(activeTarget) || !(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }

      if (!event.shiftKey && (event.key.toLowerCase() === "d" || event.code === "KeyD")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        splitFocusedTerminal("row");
        return;
      }

      if (event.shiftKey && (event.key.toLowerCase() === "d" || event.code === "KeyD")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        splitFocusedTerminal("column");
        return;
      }

      if (!event.shiftKey && (event.key.toLowerCase() === "t" || event.code === "KeyT")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        onNewTerminalTab?.();
        return;
      }

      // Only intercept ⌘G / ⌘⇧G when Terminal Rich Input is enabled so the
      // terminal can receive those chords when the setting is off.
      if (richInputEnabled && isTerminalAgentInputPinShortcut(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        togglePinFocusedAgentInput();
        return;
      }

      if (richInputEnabled && isTerminalAgentInputShortcut(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        toggleFocusedAgentInput();
        return;
      }

      if (!event.shiftKey && (event.key.toLowerCase() === "w" || event.code === "KeyW")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        requestCloseTerminal(getFocusedPaneId());
        return;
      }

      if (event.shiftKey && (event.key.toLowerCase() === "f" || event.code === "KeyF")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const focusedPaneId = getFocusedPaneId();
        if (focusedPaneId) {
          onToggleMaximize(focusedPaneId);
        }
        return;
      }

      if (event.shiftKey && (event.key.toLowerCase() === "p" || event.code === "KeyP")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void pinPaneToCanvas(getFocusedPaneId());
        return;
      }

      if (!event.shiftKey && (event.key === "[" || event.code === "BracketLeft")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        focusPaneByOffset(-1);
        return;
      }

      if (!event.shiftKey && (event.key === "]" || event.code === "BracketRight")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        focusPaneByOffset(1);
      }
    };

    window.addEventListener("keydown", handleTerminalNavigationHotkey, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleTerminalNavigationHotkey, { capture: true });
    };
  }, [
    focusPaneByOffset,
    getFocusedPaneId,
    onNewTerminalTab,
    onToggleMaximize,
    pinPaneToCanvas,
    requestCloseTerminal,
    richInputEnabled,
    splitFocusedTerminal,
    terminalHotkeyScopeRef,
    toggleFocusedAgentInput,
    togglePinFocusedAgentInput,
  ]);
}
