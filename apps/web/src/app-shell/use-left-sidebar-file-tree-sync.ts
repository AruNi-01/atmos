import { useEffect } from "react";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import {
  isConflictResolveEditorPath,
  isDiffEditorPath,
} from "@/features/editor/store/editor-store-paths";
import { useFileTreeStore } from "@/features/files/store/use-file-tree-store";
import { activateCenterChromeTab } from "@/app-shell/center-stage-activate";
import { useCenterPaintContextId } from "@/app-shell/center-space/use-center-paint-context-id";
import { setCenterExplorerCollapsed } from "@/shared/stores/use-ui-pref-hooks";

function normalizePathForContainment(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

interface UseLeftSidebarFileTreeSyncParams {
  currentEffectivePath: string | null;
  currentProjectId: string | null;
  currentWorkspaceId: string | null;
  effectiveContextId: string | null;
  isSettingUp: boolean;
}

export function useLeftSidebarFileTreeSync({
  currentEffectivePath,
  currentProjectId,
  currentWorkspaceId,
  effectiveContextId,
  isSettingUp,
}: UseLeftSidebarFileTreeSyncParams) {
  const setCurrentProjectPath = useEditorStore((s) => s.setCurrentProjectPath);
  const fileTreeRevealTarget = useEditorStore((s) => s.fileTreeRevealTarget);
  const setContext = useFileTreeStore((s) => s.setContext);
  const paintContextId = useCenterPaintContextId();

  // Keep the file-tree query key bound to the live workspace so the shared
  // files explorer can render as soon as a file surface opens.
  useEffect(() => {
    if (!currentProjectId || !currentEffectivePath) return;
    const canSet = currentWorkspaceId ? !isSettingUp : true;
    if (!canSet) return;

    let cancelled = false;
    const outer = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        setCurrentProjectPath(currentEffectivePath);
        setContext(currentProjectId, currentWorkspaceId, currentEffectivePath);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(outer);
    };
  }, [
    currentProjectId,
    currentWorkspaceId,
    currentEffectivePath,
    isSettingUp,
    setCurrentProjectPath,
    setContext,
  ]);

  useEffect(() => {
    if (!fileTreeRevealTarget || !effectiveContextId) return;
    if (
      fileTreeRevealTarget.workspaceId &&
      fileTreeRevealTarget.workspaceId !== effectiveContextId
    ) {
      return;
    }
    if (!currentEffectivePath) return;
    const normalizedCurrentPath = normalizePathForContainment(currentEffectivePath);
    const normalizedRevealPath = normalizePathForContainment(fileTreeRevealTarget.path);
    if (
      normalizedRevealPath !== normalizedCurrentPath &&
      !normalizedRevealPath.startsWith(`${normalizedCurrentPath}/`)
    ) {
      return;
    }
    const targetContextId = paintContextId || effectiveContextId;
    setCenterExplorerCollapsed("files", false);
    const openFiles = useEditorStore.getState().workspaceStates[targetContextId]?.openFiles;
    const hasRegularFile = (openFiles ?? []).some(
      (file) =>
        !isDiffEditorPath(file.path) && !isConflictResolveEditorPath(file.path),
    );
    if (hasRegularFile) return;
    activateCenterChromeTab(targetContextId, "files", { placement: "focused" });
  }, [
    currentEffectivePath,
    effectiveContextId,
    fileTreeRevealTarget,
    paintContextId,
  ]);
}
