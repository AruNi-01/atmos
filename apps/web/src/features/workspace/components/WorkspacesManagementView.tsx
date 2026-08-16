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

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      {/*
        Keep the pill tabs mounted on this shell. Passing them into Recent /
        Archived as children remounts LaunchpadPageTabs, which resets the
        motion layoutId and kills the indicator slide.
      */}
      <div className="pointer-events-none absolute left-1/2 top-12 z-30 w-full max-w-5xl -translate-x-1/2 px-8">
        <div className="flex justify-end">
          <div className="pointer-events-auto">
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
          </div>
        </div>
      </div>
      {view === "archived" ? (
        <ArchivedWorkspacesView viewSwitcher={<WorkspaceViewTabsSpacer />} />
      ) : (
        <RecentWorkspacesView viewSwitcher={<WorkspaceViewTabsSpacer />} />
      )}
    </div>
  );
};

function WorkspaceViewTabsSpacer() {
  return <div aria-hidden="true" className="h-10 w-[14.5rem]" />;
}
