import * as React from "react";

import { cn } from "../../lib/utils";

/**
 * Adapted from Cult UI MinimalCard
 * https://www.cult-ui.com/docs/components/minimal-card
 * https://github.com/nolly-studio/cult-ui
 */
const MinimalCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="minimal-card"
    className={cn(
      "rounded-[24px] bg-card p-2 no-underline shadow-sm transition-colors hover:bg-muted/70",
      "shadow-[0px_1px_1px_0px_rgba(0,0,0,0.05),0px_1px_1px_0px_rgba(255,252,240,0.5)_inset,0px_0px_0px_1px_hsla(0,0%,100%,0.1)_inset,0px_0px_1px_0px_rgba(28,27,26,0.5)]",
      "shadow-[rgba(17,24,28,0.08)_0_0_0_1px,rgba(17,24,28,0.08)_0_1px_2px_-1px,rgba(17,24,28,0.04)_0_2px_4px]",
      "dark:shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_0_0_1px_rgba(255,255,255,0.03)_inset,0_0_0_1px_rgba(0,0,0,0.1),0_2px_2px_0_rgba(0,0,0,0.1),0_4px_4px_0_rgba(0,0,0,0.1),0_8px_8px_0_rgba(0,0,0,0.1)]",
      className,
    )}
    {...props}
  >
    {children}
  </div>
));
MinimalCard.displayName = "MinimalCard";

const MinimalCardImage = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    src?: string;
    alt?: string;
    actions?: React.ReactNode;
  }
>(({ className, alt = "", src, actions, children, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="minimal-card-image"
    className={cn(
      "relative mb-2 aspect-[16/10] w-full overflow-hidden rounded-[20px]",
      "shadow-[0px_1px_1px_0px_rgba(0,0,0,0.05),0px_1px_1px_0px_rgba(255,252,240,0.5)_inset,0px_0px_0px_1px_hsla(0,0%,100%,0.1)_inset,0px_0px_1px_0px_rgba(28,27,26,0.5)]",
      "dark:shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_0_0_1px_rgba(255,255,255,0.03)_inset,0_0_0_1px_rgba(0,0,0,0.1),0_2px_2px_0_rgba(0,0,0,0.1),0_4px_4px_0_rgba(0,0,0,0.1),0_8px_8px_0_rgba(0,0,0,0.1)]",
      className,
    )}
    {...props}
  >
    {src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 size-full rounded-[16px] object-cover"
      />
    ) : (
      <div className="absolute inset-0">{children}</div>
    )}
    <div className="pointer-events-none absolute inset-0 rounded-[16px]">
      <div
        className={cn(
          "absolute inset-0 rounded-[16px]",
          "shadow-[0px_0px_0px_1px_rgba(0,0,0,.07),0px_0px_0px_3px_#fff,0px_0px_0px_4px_rgba(0,0,0,.08)]",
          "dark:shadow-[0px_0px_0px_1px_rgba(0,0,0,.07),0px_0px_0px_3px_rgba(100,100,100,0.3),0px_0px_0px_4px_rgba(0,0,0,.08)]",
        )}
      />
      <div
        className={cn(
          "absolute inset-0 rounded-[16px]",
          "dark:shadow-[0px_1px_1px_0px_rgba(0,0,0,0.15),0px_1px_1px_0px_rgba(0,0,0,0.15)_inset,0px_0px_0px_1px_rgba(0,0,0,0.15)_inset,0px_0px_1px_0px_rgba(0,0,0,0.15)]",
        )}
      />
    </div>
    {actions ? (
      <div
        data-slot="minimal-card-actions"
        className="absolute right-2 top-2 z-10 flex items-center gap-1"
      >
        {actions}
      </div>
    ) : null}
  </div>
));
MinimalCardImage.displayName = "MinimalCardImage";

const MinimalCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    data-slot="minimal-card-title"
    className={cn("mt-1 px-1 text-sm font-medium leading-tight", className)}
    {...props}
  />
));
MinimalCardTitle.displayName = "MinimalCardTitle";

const MinimalCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    data-slot="minimal-card-description"
    className={cn("px-1 pb-1 text-xs text-muted-foreground", className)}
    {...props}
  />
));
MinimalCardDescription.displayName = "MinimalCardDescription";

const MinimalCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="minimal-card-content"
    className={cn("px-1 pb-1 pt-0", className)}
    {...props}
  />
));
MinimalCardContent.displayName = "MinimalCardContent";

const MinimalCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="minimal-card-footer"
    className={cn("flex items-center px-1 pb-1 pt-0", className)}
    {...props}
  />
));
MinimalCardFooter.displayName = "MinimalCardFooter";

export {
  MinimalCard,
  MinimalCardImage,
  MinimalCardTitle,
  MinimalCardDescription,
  MinimalCardContent,
  MinimalCardFooter,
};
