import { useEffect } from "react";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { useFileTreeStore } from "@/features/files/store/use-file-tree-store";
import { activateCenterChromeTab } from "@/app-shell/center-stage-activate";
import { useCenterPaintContextId } from "@/app-shell/center-space/use-center-paint-context-id";

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

  // Keep the file-tree query key bound to the live workspace so the center
  // Files tab can render as soon as it opens.
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
    activateCenterChromeTab(targetContextId, "files", { placement: "focused" });
  }, [
    currentEffectivePath,
    effectiveContextId,
    fileTreeRevealTarget,
    paintContextId,
  ]);
}
