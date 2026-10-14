"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { overlayScrollClassName, overlayScrollHandlers } from "../../lib/isolate-overlay-scroll";
import { cn } from "../../lib/utils";

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

const preventAutoFocus = (e: Event) => e.preventDefault();

const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(function PopoverContent(
  {
    className,
    align = "center",
    sideOffset = 4,
    onOpenAutoFocus = preventAutoFocus,
    onCloseAutoFocus,
    onWheel,
    onTouchMove,
    ...props
  },
  ref,
) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
        className={cn(
          "desktop-no-drag z-50 max-h-(--radix-popover-content-available-height) w-72 origin-(--radix-popover-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-xl border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          overlayScrollClassName,
          className,
        )}
        {...overlayScrollHandlers({ onWheel, onTouchMove })}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
PopoverContent.displayName = "PopoverContent";

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
