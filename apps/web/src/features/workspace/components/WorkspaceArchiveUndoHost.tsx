"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { UndoPill } from "@workspace/ui";
import { APP_FOOTER_HEIGHT_PX } from "@/app-shell/sidebar-layout-constants";
import { useProjectStore } from "@/features/project/store/use-project-store";
import {
  WORKSPACE_ARCHIVE_UNDO_SECONDS,
  workspaceArchiveDisplayName,
} from "@/features/workspace/lib/workspace-archive-undo";
import { useWorkspaceArchiveUndoStore } from "@/features/workspace/store/use-workspace-archive-undo-store";
import { useAppRouter } from "@/shared/hooks/use-app-router";

export function WorkspaceArchiveUndoHost() {
  const t = useTranslations("project.runtime");
  const router = useAppRouter();
  const pending = useWorkspaceArchiveUndoStore((state) => state.pending);

  useEffect(() => {
    const flush = () => {
      void useProjectStore.getState().commitPendingWorkspaceArchive();
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  const name = pending
    ? workspaceArchiveDisplayName(pending.workspace, t("common.untitled"))
    : "";

  return (
    <div
      className="pointer-events-none fixed left-6 z-[130]"
      data-slot="workspace-archive-undo-host"
      style={{ bottom: APP_FOOTER_HEIGHT_PX + 16 }}
    >
      <UndoPill
        open={pending != null}
        duration={WORKSPACE_ARCHIVE_UNDO_SECONDS}
        label={
          pending ? t("store.messages.workspaceArchivedNamed", { name }) : t("store.messages.workspaceArchived")
        }
        undoLabel={t("common.undo")}
        onUndo={() => {
          const restored = useProjectStore.getState().undoPendingWorkspaceArchive();
          if (restored?.restoreHref) {
            router.push(restored.restoreHref);
          }
        }}
        onExpire={() => {
          void useProjectStore.getState().commitPendingWorkspaceArchive();
        }}
      />
    </div>
  );
}
