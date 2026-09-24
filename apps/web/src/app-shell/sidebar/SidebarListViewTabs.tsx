"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/motion/tabs";
import type { SidebarListView } from "@/app-shell/sidebar/sidebar-list-view";

/** Same pill tabs as the Task source switch. */
export function SidebarListViewTabs({
  value,
  onValueChange,
}: {
  value: SidebarListView;
  onValueChange: (view: SidebarListView) => void;
}) {
  const t = useTranslations("appShell.task");

  return (
    <Tabs
      value={value}
      onValueChange={(next) => onValueChange(next === "session" ? "session" : "workspace")}
      variant="pill"
      className="w-full"
    >
      <TabsList className="h-8 w-full gap-0.5 bg-muted p-0.5">
        <TabsTrigger value="workspace" className="h-7 flex-1 px-3 text-xs">
          {t("view.workspace")}
        </TabsTrigger>
        <TabsTrigger value="session" className="h-7 flex-1 px-3 text-xs">
          {t("view.session")}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
