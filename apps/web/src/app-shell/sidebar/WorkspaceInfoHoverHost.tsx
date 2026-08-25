"use client";

import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@workspace/ui";
import { workspaceInfoHoverSession } from "./workspace-info-hover-session";

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

  const virtualRef = useMemo(
    () => ({ current: trigger }),
    [trigger],
  );

  useEffect(() => {
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
      if (target.closest("[data-workspace-popover-surface='true']")) return;
      if (target.closest("[data-ws-row]")) return;
      workspaceInfoHoverSession.dismiss();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isOpen, trigger]);

  useEffect(() => {
    if (!isOpen) {
      setFollowMotion(false);
      return;
    }
    const timer = window.setTimeout(() => setFollowMotion(true), 180);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) workspaceInfoHoverSession.dismiss();
      }}
    >
      {trigger ? (
        <PopoverAnchor
          virtualRef={virtualRef as React.RefObject<HTMLElement>}
        />
      ) : null}
      {isOpen ? (
        <PopoverContent
          data-workspace-popover-surface="true"
          data-workspace-info-hover-host=""
          side="right"
          align="start"
          sideOffset={10}
          className={
            followMotion
              ? "w-72 p-3 transition-transform duration-150 ease-out"
              : "w-72 p-3"
          }
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onMouseEnter={() => workspaceInfoHoverSession.hold()}
          onMouseLeave={() => workspaceInfoHoverSession.unhold()}
        >
          <div
            ref={(el) => {
              workspaceInfoHoverSession.setSlotEl(el);
            }}
            className="space-y-3"
          />
        </PopoverContent>
      ) : null}
    </Popover>
  );
}
