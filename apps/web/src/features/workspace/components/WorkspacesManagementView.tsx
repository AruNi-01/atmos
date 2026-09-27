"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Archive, Clock3 } from "lucide-react";
import { useQueryState } from "nuqs";
import { RecentWorkspacesView } from "./RecentWorkspacesView";
import { ArchivedWorkspacesView } from "./ArchivedWorkspacesView";
import { LaunchpadPageTabs } from "@/shared/components/LaunchpadPageTabs";
import { workspacesParams } from "@/shared/lib/nuqs/searchParams";

export const WorkspacesManagementView: React.FC = () => {
  const t = useTranslations("Workspace.components.viewTabs");
  const [view, setView] = useQueryState("view", workspacesParams.view);

  const viewSwitcher = (
    <LaunchpadPageTabs
      value={view}
      onValueChange={(value) => {
        if (value === "recent" || value === "archived") {
          void setView(value);
        }
      }}
      items={[
        { value: "recent", label: t("recent"), icon: Clock3 },
        { value: "archived", label: t("archived"), icon: Archive },
      ]}
    />
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {view === "archived" ? (
        <ArchivedWorkspacesView viewSwitcher={viewSwitcher} />
      ) : (
        <RecentWorkspacesView viewSwitcher={viewSwitcher} />
      )}
    </div>
  );
};
