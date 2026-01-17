"use client";

import * as React from "react";
import { Globe } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface LanguageSelectorProps {
  locale: string;
  onSelect: (locale: string) => void;
  items: { label: string; value: string }[];
  className?: string;
}

export function LanguageSelector({
  locale,
  onSelect,
  items,
  className,
  ...props
}: LanguageSelectorProps) {
  const currentLabel = items.find((item) => item.value === locale)?.label || locale;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("w-auto px-3 gap-2 font-medium", className)}
          {...props}
        >
          <Globe className="h-[1.2rem] w-[1.2rem]" />
          <span className="hidden sm:inline-block">{currentLabel}</span>
          <span className="sr-only">Toggle language</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.value}
            onClick={() => onSelect(item.value)}
            className={cn(locale === item.value && "bg-accent")}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
