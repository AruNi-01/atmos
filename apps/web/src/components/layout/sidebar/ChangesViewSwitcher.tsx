"use client";

import React, { useState, useEffect } from "react";
import {
  GitBranch,
  Plus,
  GitPullRequest,
  FileCheck,
  LoaderCircle,
} from "lucide-react";
import { Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChangesView } from "@/lib/nuqs/searchParams";

export interface ChangesViewSwitcherProps {
  changesView: ChangesView;
  onViewChange: (view: ChangesView) => void;
  hasWorkingContext: boolean;
  onCodeReview: () => void;
  onCreatePr: () => void;
  onRefreshActions: () => void;
}

export const ChangesViewSwitcher: React.FC<ChangesViewSwitcherProps> = ({
  changesView,
  onViewChange,
  hasWorkingContext,
  onCodeReview,
  onCreatePr,
  onRefreshActions,
}) => {
  const [isChangesActionReady, setIsChangesActionReady] = useState(false);
  const [isChangesHovered, setIsChangesHovered] = useState(false);

  const [isPrActionReady, setIsPrActionReady] = useState(false);
  const [isPrHovered, setIsPrHovered] = useState(false);

  const [isActionsActionReady, setIsActionsActionReady] = useState(false);
  const [isActionsHovered, setIsActionsHovered] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (changesView === "changes") {
      timer = setTimeout(() => {
        setIsChangesActionReady(true);
      }, 1000);
      setIsPrActionReady(false);
      setIsActionsActionReady(false);
    } else if (changesView === "pr") {
      timer = setTimeout(() => {
        setIsPrActionReady(true);
      }, 1000);
      setIsChangesActionReady(false);
      setIsActionsActionReady(false);
    } else if (changesView === "actions") {
      timer = setTimeout(() => {
        setIsActionsActionReady(true);
      }, 1000);
      setIsChangesActionReady(false);
      setIsPrActionReady(false);
    } else {
      setIsChangesActionReady(false);
      setIsPrActionReady(false);
      setIsActionsActionReady(false);
    }
    return () => clearTimeout(timer);
  }, [changesView]);

  const showChangesActions =
    changesView === "changes" && isChangesActionReady && isChangesHovered;
  const showPrActions = changesView === "pr" && isPrActionReady && isPrHovered;
  const showActionsActions =
    changesView === "actions" && isActionsActionReady && isActionsHovered;

  return (
    <div className="flex border-b border-sidebar-border shrink-0 bg-sidebar-accent/5 h-10 overflow-hidden">
      {hasWorkingContext && (
        <>
          {/* Changes Toggle */}
          <div
            className={cn(
              "flex-1 flex items-center justify-center transition-colors relative cursor-pointer border-r border-sidebar-border/50 overflow-hidden",
              changesView === "changes"
                ? showChangesActions
                  ? "text-foreground"
                  : "bg-sidebar-accent text-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
            )}
            onMouseEnter={() => setIsChangesHovered(true)}
            onMouseLeave={() => setIsChangesHovered(false)}
            onClick={() => {
              if (changesView !== "changes") {
                onViewChange("changes");
              }
            }}
          >
            {/* Default State (Changes Icon/Text) */}
            <div
              className={cn(
                "flex items-center gap-1.5 justify-center transition-all duration-300 ease-out",
                showChangesActions ? "-translate-y-10 opacity-0" : "",
              )}
            >
              <GitBranch className="size-3.5" />
              <span className="text-[11px] font-medium">Changes</span>
            </div>

            {/* Hover State (Review) */}
            <div
              className={cn(
                "absolute inset-0 flex transition-all duration-300 ease-out",
                showChangesActions
                  ? "translate-y-0 opacity-100"
                  : "translate-y-10 opacity-0 pointer-events-none",
              )}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCodeReview();
                }}
                className="flex-1 flex items-center justify-center hover:bg-sidebar-accent cursor-pointer transition-colors"
                title="Agent Review"
              >
                <FileCheck className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Pull Requests Toggle */}
          <div
            className={cn(
              "flex-1 flex items-center justify-center transition-colors relative cursor-pointer border-r border-sidebar-border/50 overflow-hidden group",
              changesView === "pr"
                ? showPrActions
                  ? "text-foreground"
                  : "bg-sidebar-accent text-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
            )}
            onMouseEnter={() => setIsPrHovered(true)}
            onMouseLeave={() => setIsPrHovered(false)}
            onClick={() => {
              if (changesView !== "pr") {
                onViewChange("pr");
              }
            }}
            title="Pull Requests"
          >
            <div
              className={cn(
                "flex items-center gap-1.5 justify-center transition-all duration-300 ease-out",
                showPrActions ? "-translate-y-10 opacity-0" : "",
              )}
            >
              <GitPullRequest className="size-3.5" />
              <span className="text-[11px] font-medium">PR</span>
            </div>

            <div
              className={cn(
                "absolute inset-0 flex transition-all duration-300 ease-out",
                showPrActions
                  ? "translate-y-0 opacity-100"
                  : "translate-y-10 opacity-0 pointer-events-none",
              )}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCreatePr();
                }}
                className="flex-1 flex items-center justify-center hover:bg-sidebar-accent cursor-pointer transition-colors"
                title="Create PR"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Actions Toggle */}
          <div
            className={cn(
              "flex-1 flex items-center justify-center transition-colors relative cursor-pointer border-r border-transparent overflow-hidden h-full",
              changesView === "actions"
                ? showActionsActions
                  ? "text-foreground"
                  : "bg-sidebar-accent text-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
            )}
            onClick={() => {
              if (changesView !== "actions")
                onViewChange("actions");
            }}
            onMouseEnter={() => setIsActionsHovered(true)}
            onMouseLeave={() => setIsActionsHovered(false)}
            title="Actions"
          >
            <div
              className={cn(
                "flex items-center gap-1.5 justify-center transition-all duration-300 ease-out",
                showActionsActions ? "-translate-y-10 opacity-0" : "",
              )}
            >
              <Workflow className="size-3.5" />
              <span className="text-[11px] font-medium">Actions</span>
            </div>

            <div
              className={cn(
                "absolute inset-0 flex transition-all duration-300 ease-out",
                showActionsActions
                  ? "translate-y-0 opacity-100"
                  : "translate-y-10 opacity-0 pointer-events-none",
              )}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRefreshActions();
                }}
                className="flex-1 flex items-center justify-center hover:bg-sidebar-accent cursor-pointer transition-colors"
                title="Refresh"
              >
                <LoaderCircle className="size-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
