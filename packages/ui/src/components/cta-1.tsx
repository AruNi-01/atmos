import * as React from "react";

import { cn } from "../lib/utils";
import { DecorIcon } from "./ui/decor-icon";

type CTA1Props = {
  title: React.ReactNode;
  desc?: React.ReactNode;
  actionButtonOne?: React.ReactNode;
  actionButtonTwo?: React.ReactNode;
  className?: string;
  widthClassName?: string;
  showFrame?: boolean;
  showBorder?: boolean;
};

export function CTA1({
  title,
  desc,
  actionButtonOne,
  actionButtonTwo,
  className,
  widthClassName = "max-w-5xl",
  showFrame = true,
  showBorder = true,
}: CTA1Props) {
  return (
    <section
      className={cn(
        "relative mx-auto flex w-full flex-col justify-between gap-y-5 px-4 py-8 md:px-8 md:py-12",
        showBorder && "border-y",
        widthClassName,
        "bg-[radial-gradient(35%_80%_at_25%_0%,color-mix(in_oklab,var(--foreground)_8%,transparent),transparent)]",
        className
      )}
    >
      {showFrame ? (
        <>
          <DecorIcon className="size-4" position="top-left" />
          <DecorIcon className="size-4" position="top-right" />
          <DecorIcon className="size-4" position="bottom-left" />
          <DecorIcon className="size-4" position="bottom-right" />

          <div className="pointer-events-none absolute -inset-y-6 -left-px w-px border-l" />
          <div className="pointer-events-none absolute -inset-y-6 -right-px w-px border-r" />
        </>
      ) : null}
      <div className="space-y-3">
        <h1 className="text-balance text-center text-3xl font-semibold tracking-tight md:text-5xl">
          {title}
        </h1>
        {desc ? (
          <p className="mx-auto max-w-2xl text-balance text-center text-sm font-medium text-muted-foreground md:text-base">
            {desc}
          </p>
        ) : null}
      </div>

      {(actionButtonOne || actionButtonTwo) && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {actionButtonOne}
          {actionButtonTwo}
        </div>
      )}
    </section>
  );
}
