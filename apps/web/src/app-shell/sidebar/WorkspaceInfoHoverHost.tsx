"use client";

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@workspace/ui";
import {
  isWorkspaceInfoHoverKeepAliveHovered,
  isWorkspaceInfoHoverKeepAliveTarget,
  workspaceInfoHoverSession,
} from "./workspace-info-hover-session";

const WORKSPACE_INFO_HOVER_FOLLOW_STYLE_ID = "atmos-workspace-info-hover-follow";
const WORKSPACE_INFO_HOVER_FOLLOW_STYLE = `
@media (prefers-reduced-motion: no-preference) {
  [data-radix-popper-content-wrapper]:has([data-workspace-info-hover-host="follow"]) {
    transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
  }
}
`;

function ensureWorkspaceInfoHoverFollowStyle() {
  if (typeof document === "undefined") return;
  if (document.getElementById(WORKSPACE_INFO_HOVER_FOLLOW_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = WORKSPACE_INFO_HOVER_FOLLOW_STYLE_ID;
  style.textContent = WORKSPACE_INFO_HOVER_FOLLOW_STYLE;
  document.head.appendChild(style);
}

function useWorkspaceInfoHoverHostSnapshot() {
  return useSyncExternalStore(
    workspaceInfoHoverSession.subscribe,
    workspaceInfoHoverSession.getHostSnapshot,
    workspaceInfoHoverSession.getServerSnapshot,
  );
}

export function WorkspaceInfoHoverHost() {
  const { openId, trigger } = useWorkspaceInfoHoverHostSnapshot();
  const isOpen = openId != null && trigger != null;
  const [followMotion, setFollowMotion] = useState(false);
  const virtualRef = useRef<HTMLElement | null>(null);
  virtualRef.current = trigger;

  const setSlotNode = useCallback((node: HTMLDivElement | null) => {
    workspaceInfoHoverSession.setSlotEl(node);
    if (node == null) return;
    return () => {
      workspaceInfoHoverSession.setSlotEl(null);
    };
  }, []);

  useEffect(() => {
    ensureWorkspaceInfoHoverFollowStyle();
    return () => {
      workspaceInfoHoverSession.reset();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (trigger?.contains(target)) return;
      if (isWorkspaceInfoHoverKeepAliveTarget(target)) return;
      workspaceInfoHoverSession.dismiss();
    };

    const handlePointerOver = (event: PointerEvent) => {
      if (
        isWorkspaceInfoHoverKeepAliveTarget(event.target) ||
        (event.target instanceof Node && trigger?.contains(event.target))
      ) {
        workspaceInfoHoverSession.hold();
        return;
      }
      workspaceInfoHoverSession.unhold();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("pointerover", handlePointerOver, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("pointerover", handlePointerOver, true);
    };
  }, [isOpen, trigger]);

  useEffect(() => {
    if (!isOpen) {
      setFollowMotion(false);
      return;
    }
    // Wait for the first Radix placement (off-screen measure → final spot)
    // so the follow transition does not slide in from translate(0, -200%).
    const timer = window.setTimeout(() => setFollowMotion(true), 80);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  return (
    <Popover
      open={isOpen}
      modal={false}
      onOpenChange={(open) => {
        if (open) return;
        if (workspaceInfoHoverSession.shouldIgnoreRootDismiss()) return;
        if (isWorkspaceInfoHoverKeepAliveHovered()) return;
        workspaceInfoHoverSession.dismiss();
      }}
    >
      {trigger ? (
        <PopoverAnchor virtualRef={virtualRef} />
      ) : null}
      {isOpen ? (
        <PopoverContent
          data-workspace-popover-surface="true"
          data-workspace-info-hover-host={followMotion ? "follow" : "true"}
          side="right"
          align="start"
          sideOffset={10}
          className="w-72 p-3"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={() => workspaceInfoHoverSession.dismiss()}
          onFocusOutside={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => {
            if (
              isWorkspaceInfoHoverKeepAliveTarget(event.target) ||
              (event.target instanceof Node && trigger?.contains(event.target))
            ) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            if (
              isWorkspaceInfoHoverKeepAliveTarget(event.target) ||
              (event.target instanceof Node && trigger?.contains(event.target))
            ) {
              event.preventDefault();
            }
          }}
          onMouseEnter={() => workspaceInfoHoverSession.hold()}
          onMouseLeave={(event) => {
            if (isWorkspaceInfoHoverKeepAliveTarget(event.relatedTarget)) return;
            workspaceInfoHoverSession.unhold();
          }}
        >
          <div ref={setSlotNode} className="space-y-3" />
        </PopoverContent>
      ) : null}
    </Popover>
  );
}
