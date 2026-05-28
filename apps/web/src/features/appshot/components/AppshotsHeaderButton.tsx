"use client";

import React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui";
import { Camera } from "lucide-react";

import { AppshotsHistoryPopover } from "./AppshotsHistoryPopover";

type AppshotsHeaderButtonProps = {
  onCloseAutoFocus?: (event: Event) => void;
};

export function AppshotsHeaderButton({ onCloseAutoFocus }: AppshotsHeaderButtonProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Appshots"
              className="relative size-8 flex items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 ease-out hover:bg-accent hover:text-accent-foreground"
            >
              <Camera className="size-4" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Appshots</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        sideOffset={8}
        onCloseAutoFocus={onCloseAutoFocus}
        className="!z-[2147483647] w-[420px] max-w-[calc(100vw-1rem)] max-h-[min(72vh,var(--radix-popover-content-available-height,72vh))] overflow-x-hidden overflow-y-auto overscroll-contain p-3 bg-popover border border-border shadow-md"
      >
        <AppshotsHistoryPopover open={open} />
      </PopoverContent>
    </Popover>
  );
}
