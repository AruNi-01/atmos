"use client";

import { type ComponentProps } from "react";
import { cn } from "@workspace/ui";
import { ChevronsUpDown, ChevronsDownUp } from "lucide-react";

interface ExpandButtonProps extends ComponentProps<"button"> {
  expanded: boolean;
  onToggle: () => void;
  iconSize?: number;
}

const ExpandButton = ({
  expanded,
  onToggle,
  iconSize = 14,
  className,
  ...props
}: ExpandButtonProps) => {
  return (
    <button
      title={expanded ? "Collapse code" : "Expand code"}
      className={cn(
        "cursor-pointer",
        "transition-colors duration-200 ease-in-out",
        "text-neutral-600 dark:text-neutral-400",
        "hover:text-neutral-950 hover:dark:text-neutral-50",
        className,
      )}
      onClick={onToggle}
      {...props}
    >
      {expanded ? (
        <ChevronsDownUp
          size={iconSize}
          className="animate-in zoom-in-50 duration-200"
        />
      ) : (
        <ChevronsUpDown
          size={iconSize}
          className="animate-in zoom-in-50 duration-200"
        />
      )}
    </button>
  );
};

export { ExpandButton };
