"use client";

import type { ReactNode } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@workspace/ui";
import { ListFilter } from "lucide-react";

export function PageFilterButton({
  label,
  activeCount,
  children,
  align = "end",
}: {
  label: string;
  activeCount: number;
  children: ReactNode;
  align?: "start" | "center" | "end";
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="relative h-11 shrink-0 gap-1.5 rounded-xl px-3"
          aria-label={label}
        >
          {activeCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {activeCount}
            </span>
          ) : null}
          <ListFilter className="size-3.5" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-64 p-1">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
