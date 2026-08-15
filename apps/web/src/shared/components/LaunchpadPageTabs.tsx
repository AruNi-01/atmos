"use client";

import type { ComponentType } from "react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/motion/tabs";
import { cn } from "@workspace/ui";

export type LaunchpadPageTabItem = {
  value: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
};

export function LaunchpadPageTabs({
  value,
  onValueChange,
  items,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  items: LaunchpadPageTabItem[];
  className?: string;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={onValueChange}
      variant="pill"
      className={cn("shrink-0", className)}
    >
      <TabsList className="h-10 gap-1 p-1">
        {items.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            className="h-8 gap-1.5 px-3.5 text-sm"
          >
            {item.icon ? <item.icon className="size-4 shrink-0" /> : null}
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
