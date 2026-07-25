import { useEffect } from 'react';

import { useEditorStore } from '@/features/editor/store/use-editor-store';
import { useFileTreeStore } from '@/features/files/store/use-file-tree-store';
import type { LeftSidebarTab } from '@/shared/lib/nuqs/searchParams';

function normalizePathForContainment(path: string): string {
    const normalized = path.replace(/\\/g, '/');
    if (normalized.length > 1 && normalized.endsWith('/')) {
        return normalized.slice(0, -1);
    }
    return normalized;
}

interface UseLeftSidebarFileTreeSyncParams {
    activeTab: LeftSidebarTab;
    currentEffectivePath: string | null;
    currentProjectId: string | null;
    currentWorkspaceId: string | null;
    effectiveContextId: string | null;
    filesOnRight: boolean;
    isSettingUp: boolean;
    setActiveTab: (value: LeftSidebarTab) => void | Promise<URLSearchParams>;
}

export function useLeftSidebarFileTreeSync({
    activeTab,
    currentEffectivePath,
    currentProjectId,
    currentWorkspaceId,
    effectiveContextId,
    filesOnRight,
    isSettingUp,
    setActiveTab,
}: UseLeftSidebarFileTreeSyncParams) {
    const setCurrentProjectPath = useEditorStore(s => s.setCurrentProjectPath);
    const fileTreeRevealTarget = useEditorStore(s => s.fileTreeRevealTarget);
    const setContext = useFileTreeStore((s) => s.setContext);

    // Update the store context so FileTreePanel knows which Query key to render.
    // Defer past paint so rapid workspace hops do not block sidebar hover.
    useEffect(() => {
        if (!((activeTab === 'files' || filesOnRight) && currentProjectId && currentEffectivePath)) {
            return;
        }
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
    }, [activeTab, filesOnRight, currentProjectId, currentWorkspaceId, currentEffectivePath, isSettingUp, setCurrentProjectPath, setContext]);

    useEffect(() => {
        if (!fileTreeRevealTarget) return;
        if (fileTreeRevealTarget.workspaceId && fileTreeRevealTarget.workspaceId !== effectiveContextId) {
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
        if (activeTab !== 'files') {
            void setActiveTab('files');
        }
    }, [activeTab, currentEffectivePath, effectiveContextId, fileTreeRevealTarget, setActiveTab]);
}
