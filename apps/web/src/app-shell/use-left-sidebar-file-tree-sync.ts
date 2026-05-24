import { useCallback, useEffect } from 'react';

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
    const fileTreeProjectId = useFileTreeStore((s) => s.projectId);
    const fileTreeWorkspaceId = useFileTreeStore((s) => s.workspaceId);
    const fileTreeShowHidden = useFileTreeStore((s) => s.showHidden);
    const isLoadingFiles = useFileTreeStore((s) => s.isLoading);
    const fetchFileTree = useFileTreeStore((s) => s.fetch);
    const showHiddenFiles = useFileTreeStore((s) => s.showHidden);

    const doFetchFileTree = useCallback(async (projectId: string, workspaceId: string | null, effectivePath: string, showHidden: boolean = false) => {
        if (!effectivePath) return;
        setCurrentProjectPath(effectivePath);
        await fetchFileTree(projectId, workspaceId, effectivePath, showHidden);
    }, [setCurrentProjectPath, fetchFileTree]);

    useEffect(() => {
        if ((activeTab === 'files' || filesOnRight) && currentProjectId && currentEffectivePath) {
            const canFetch = currentWorkspaceId ? !isSettingUp : true;

            if (canFetch) {
                const isContextMismatch = fileTreeProjectId !== currentProjectId || fileTreeWorkspaceId !== currentWorkspaceId;
                const isHiddenMismatch = fileTreeShowHidden !== showHiddenFiles;

                if ((isContextMismatch || isHiddenMismatch) && !isLoadingFiles) {
                    void doFetchFileTree(currentProjectId, currentWorkspaceId, currentEffectivePath, showHiddenFiles);
                }
            }
        }
    }, [activeTab, filesOnRight, currentProjectId, currentWorkspaceId, currentEffectivePath, isSettingUp, fileTreeProjectId, fileTreeWorkspaceId, fileTreeShowHidden, isLoadingFiles, doFetchFileTree, showHiddenFiles]);

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
