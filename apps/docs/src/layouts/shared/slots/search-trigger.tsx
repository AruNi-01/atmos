"use client";
import type { ComponentProps } from "react";
import { Search } from "lucide-react";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { useI18n } from "fumadocs-ui/contexts/i18n";
import { cn } from "../../../lib/cn";
import { type ButtonProps, buttonVariants } from "../../../components/ui/button";

export interface SearchTriggerProps extends Omit<ComponentProps<"button">, "color">, ButtonProps {
  hideIfDisabled?: boolean;
}

export function SearchTrigger({
  hideIfDisabled,
  size = "icon-sm",
  color = "ghost",
  className,
  onClick,
  disabled,
  ...props
}: SearchTriggerProps) {
  const { setOpenSearch, enabled } = useSearchContext();
  if (hideIfDisabled && !enabled) return null;

  return (
    <button
      type="button"
      disabled={disabled}
      {...props}
      className={cn(
        buttonVariants({
          size,
          color,
        }),
        className,
      )}
      data-search=""
      aria-label={props["aria-label"] ?? "Open Search"}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || disabled) return;
        setOpenSearch(true);
      }}
    >
      <Search />
    </button>
  );
}

export interface FullSearchTriggerProps extends ComponentProps<"button"> {
  hideIfDisabled?: boolean;
}

export function FullSearchTrigger({
  hideIfDisabled,
  className,
  onClick,
  disabled,
  ...props
}: FullSearchTriggerProps) {
  const { enabled, hotKey, setOpenSearch } = useSearchContext();
  const { text } = useI18n();
  if (hideIfDisabled && !enabled) return null;

  return (
    <button
      type="button"
      disabled={disabled}
      data-search-full=""
      {...props}
      className={cn(
        "bg-fd-secondary/50 text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-accent-foreground inline-flex items-center gap-2 rounded-lg border p-1.5 ps-2 text-sm",
        className,
      )}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || disabled) return;
        setOpenSearch(true);
      }}
    >
      <Search className="size-4" />
      {text.search}
      <div className="ms-auto inline-flex gap-0.5">
        {hotKey.map((k, i) => (
          <kbd key={i} className="bg-fd-background rounded-md border px-1.5">
            {k.display}
          </kbd>
        ))}
      </div>
    </button>
  );
}
