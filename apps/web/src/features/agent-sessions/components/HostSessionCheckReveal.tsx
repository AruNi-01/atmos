"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { Checkbox, cn } from "@workspace/ui";

const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

const subscribeHover = (onChange: () => void) => {
  const query = window.matchMedia(HOVER_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const getHover = () => window.matchMedia(HOVER_QUERY).matches;
const getHoverOnServer = () => true;

function useCanHover() {
  return useSyncExternalStore(subscribeHover, getHover, getHoverOnServer);
}

export function HostSessionCheckReveal({
  selected,
  forceOpen,
  label,
  onSelectedChange,
  children,
}: {
  selected: boolean;
  forceOpen: boolean;
  label: string;
  onSelectedChange: (selected: boolean) => void;
  children: ReactNode;
}) {
  const canHover = useCanHover();
  const revealed = forceOpen || selected || !canHover;

  return (
    <div className="group/check relative overflow-hidden rounded-lg">
      <div className="absolute inset-y-0 left-0 flex w-11 items-center justify-center">
        <Checkbox
          checked={selected}
          tabIndex={revealed ? 0 : -1}
          aria-label={label}
          data-testid="host-session-select"
          onCheckedChange={(checked) => onSelectedChange(checked === true)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          className={cn(
            !revealed &&
              "pointer-events-none group-hover/check:pointer-events-auto group-focus-within/check:pointer-events-auto",
          )}
        />
      </div>
      <div
        className={cn(
          "relative z-10 w-full bg-background transition-[margin-left,width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          "group-hover/check:ml-11 group-hover/check:w-[calc(100%-2.75rem)] group-focus-within/check:ml-11 group-focus-within/check:w-[calc(100%-2.75rem)]",
          revealed && "ml-11 w-[calc(100%-2.75rem)]",
        )}
      >
        {children}
      </div>
    </div>
  );
}
